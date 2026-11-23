import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

/**
 * Signed URLs and folder listings for private Storage images.
 *
 * Every createSignedUrl call returns a different URL, so without a stable cache key the
 * image cache never hits and the same photo is downloaded again on every screen open.
 * We keep signed URLs until shortly before they expire, cache folder listings, and give
 * expo-image a stable cacheKey (bucket/path) so a photo is fetched over the network once.
 */
export type ImageBucket = 'order-images' | 'delivery-proofs' | 'profile-avatars';

const signSeconds: Record<ImageBucket, number> = {
  'order-images': 60 * 60 * 6,
  'delivery-proofs': 60 * 60 * 6,
  'profile-avatars': 60 * 60 * 24 * 30,
};
const refreshMarginMs = 10 * 60 * 1000;
const avatarStorageKey = 'labbayk:avatar-urls:v1';
const imageListStorageKey = 'labbayk:image-path-lists:v1';

const urlCache = new Map<string, { url: string; expiresAt: number }>();
const listCache = new Map<string, { paths: string[]; at: number }>();
const inflight = new Map<string, Promise<unknown>>();
let avatarsLoaded: Promise<void> | null = null;
let imageListsLoaded: Promise<void> | null = null;
let imageListWriteQueue: Promise<void> = Promise.resolve();

export const imageCacheKey = (bucket: ImageBucket, path: string) => `${bucket}/${path}`;

const dedupe = <T,>(key: string, run: () => Promise<T>): Promise<T> => {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = run().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
};

const loadPersistedAvatars = async () => {
  try {
    const raw = await AsyncStorage.getItem(avatarStorageKey);
    if (!raw) return;
    const saved = JSON.parse(raw) as Record<string, { url: string; expiresAt: number }>;
    const now = Date.now();
    for (const [key, entry] of Object.entries(saved)) {
      if (entry && typeof entry.url === 'string' && entry.expiresAt - now > refreshMarginMs && !urlCache.has(key)) urlCache.set(key, entry);
    }
  } catch { /* a corrupt cache only costs one extra request */ }
};

const persistAvatars = () => {
  const entries = [...urlCache.entries()].filter(([key]) => key.startsWith('profile-avatars/')).slice(-50);
  void AsyncStorage.setItem(avatarStorageKey, JSON.stringify(Object.fromEntries(entries))).catch(() => undefined);
};

const loadPersistedImageLists = async () => {
  try {
    const raw = await AsyncStorage.getItem(imageListStorageKey);
    if (!raw) return;
    const saved = JSON.parse(raw) as Record<string, { paths: unknown; at: unknown }>;
    const now = Date.now();
    for (const [key, entry] of Object.entries(saved)) {
      const [bucket, orderId] = key.split(':');
      if ((bucket !== 'order-images' && bucket !== 'delivery-proofs')
        || !/^[a-f0-9-]{36}$/i.test(orderId ?? '')
        || typeof entry?.at !== 'number'
        || !Array.isArray(entry.paths)
        || entry.paths.length > 3
        || entry.paths.some((path) => typeof path !== 'string' || !path.startsWith(`${orderId}/`) || path.includes('..'))) continue;
      const paths = entry.paths as string[];
      const ttl = paths.length ? 30 * 60 * 1000 : 60 * 1000;
      if (now - entry.at <= ttl) listCache.set(key, { paths, at: entry.at });
    }
  } catch { /* a corrupt cache only costs one extra Storage request */ }
};

const persistImageLists = () => {
  const entries = [...listCache.entries()].slice(-50);
  imageListWriteQueue = imageListWriteQueue.catch(() => undefined).then(() =>
    AsyncStorage.setItem(imageListStorageKey, JSON.stringify(Object.fromEntries(entries))),
  ).catch(() => undefined);
};

/** Signed URLs for the given paths, reusing unexpired ones. Missing paths are signed in one request. */
export async function signedImageUrls(bucket: ImageBucket, paths: string[]): Promise<Record<string, string>> {
  if (bucket === 'profile-avatars') await (avatarsLoaded ??= loadPersistedAvatars());
  const now = Date.now();
  const result: Record<string, string> = {};
  const missing: string[] = [];
  for (const path of paths) {
    const cached = urlCache.get(imageCacheKey(bucket, path));
    if (cached && cached.expiresAt - now > refreshMarginMs) result[path] = cached.url;
    else missing.push(path);
  }
  if (!missing.length || !supabase) return result;
  const signed = await dedupe(`sign:${bucket}:${missing.join('|')}`, async () => {
    const { data, error } = await supabase!.storage.from(bucket).createSignedUrls(missing, signSeconds[bucket]);
    return error ? [] : data ?? [];
  });
  const expiresAt = Date.now() + signSeconds[bucket] * 1000;
  for (const item of signed) {
    if (!item.signedUrl || !item.path) continue;
    urlCache.set(imageCacheKey(bucket, item.path), { url: item.signedUrl, expiresAt });
    result[item.path] = item.signedUrl;
  }
  if (bucket === 'profile-avatars' && signed.length) persistAvatars();
  return result;
}

export async function signedImageUrl(bucket: ImageBucket, path: string): Promise<string | null> {
  return (await signedImageUrls(bucket, [path]))[path] ?? null;
}

/** Synchronous lookup so a screen can render a cached image on its first frame. */
export function peekSignedImageUrl(bucket: ImageBucket, path: string): string | null {
  const cached = urlCache.get(imageCacheKey(bucket, path));
  return cached && cached.expiresAt > Date.now() ? cached.url : null;
}

/** File paths (folder/name) inside an order's folder. Returns null when the listing failed. */
export async function listOrderImagePaths(bucket: 'order-images' | 'delivery-proofs', orderId: string): Promise<string[] | null> {
  const key = `${bucket}:${orderId}`;
  await (imageListsLoaded ??= loadPersistedImageLists());
  const cached = listCache.get(key);
  // Uploaded photos never change, so a non-empty listing stays valid; an empty one is re-checked soon
  // because a delivery proof can be added later.
  if (cached && Date.now() - cached.at < (cached.paths.length ? 30 * 60 * 1000 : 60 * 1000)) return cached.paths;
  return dedupe(`list:${key}`, async () => {
    if (!supabase) return null;
    const { data, error } = await supabase.storage.from(bucket).list(orderId, { limit: 3, sortBy: { column: 'name', order: 'asc' } });
    if (error) return null;
    const paths = (data ?? []).map((file) => `${orderId}/${file.name}`);
    listCache.set(key, { paths, at: Date.now() });
    while (listCache.size > 100) listCache.delete(listCache.keys().next().value!);
    persistImageLists();
    return paths;
  });
}

export function peekOrderImagePaths(bucket: 'order-images' | 'delivery-proofs', orderId: string): string[] | null {
  return listCache.get(`${bucket}:${orderId}`)?.paths ?? null;
}

/** Drops a cached listing, e.g. right after photos were uploaded to that order. */
export function forgetOrderImages(bucket: 'order-images' | 'delivery-proofs', orderId: string) {
  const key = `${bucket}:${orderId}`;
  listCache.delete(key);
  void (async () => {
    await (imageListsLoaded ??= loadPersistedImageLists());
    listCache.delete(key);
    persistImageLists();
  })();
}

export function clearImageCaches() {
  urlCache.clear(); listCache.clear(); avatarsLoaded = null; imageListsLoaded = null;
  void AsyncStorage.removeItem(avatarStorageKey).catch(() => undefined);
  imageListWriteQueue = imageListWriteQueue.catch(() => undefined).then(() => AsyncStorage.removeItem(imageListStorageKey)).catch(() => undefined);
}
