import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Small stale-while-revalidate cache. Screens render the last known data instantly
 * (from memory, or from disk after an app restart) and refresh in the background, so a
 * slow connection delays fresh numbers but never blanks the screen.
 * On web nothing is written to disk (shared browsers); the memory cache still applies.
 */
const diskEnabled = Platform.OS !== 'web';
type Entry<T> = { value: T; at: number };
const memory = new Map<string, Entry<unknown>>();
const prefix = 'labbayk:cache:v1:';

export const cacheKey = (userId: string, name: string) => `${userId}:${name}`;

export function readMemory<T>(key: string): Entry<T> | null {
  return (memory.get(key) as Entry<T> | undefined) ?? null;
}

export function writeMemory<T>(key: string, value: T) {
  memory.set(key, { value, at: Date.now() });
}

export async function readPersisted<T>(key: string, maxAgeMs: number): Promise<Entry<T> | null> {
  const inMemory = readMemory<T>(key);
  if (inMemory) return inMemory;
  if (!diskEnabled) return null;
  try {
    const raw = await AsyncStorage.getItem(prefix + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    if (!entry || typeof entry.at !== 'number' || Date.now() - entry.at > maxAgeMs) return null;
    memory.set(key, entry);
    return entry;
  } catch {
    return null;
  }
}

export function writePersisted<T>(key: string, value: T) {
  writeMemory(key, value);
  if (!diskEnabled) return;
  void AsyncStorage.setItem(prefix + key, JSON.stringify({ value, at: Date.now() })).catch(() => undefined);
}

export const isFresh = (key: string, maxAgeMs: number) => {
  const entry = memory.get(key);
  return !!entry && Date.now() - entry.at < maxAgeMs;
};

/** Removes everything cached for one account (memory and disk). Call on sign-out. */
export async function clearUserCache(userId: string) {
  for (const key of [...memory.keys()]) if (key.startsWith(`${userId}:`)) memory.delete(key);
  if (!diskEnabled) return;
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((key) => key.startsWith(`${prefix}${userId}:`));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch { /* nothing else to clean */ }
}

/**
 * Coalesces refresh requests: bursts of realtime events become one request after `delayMs`,
 * and a request that arrives while one is running triggers exactly one follow-up run.
 */
export function createRefreshScheduler(run: () => Promise<void>, delayMs = 600) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let pending = false;
  const execute = async () => {
    if (running) { pending = true; return; }
    running = true;
    try { await run(); } finally {
      running = false;
      if (pending) { pending = false; void execute(); }
    }
  };
  return {
    schedule() { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; void execute(); }, delayMs); },
    now() { if (timer) { clearTimeout(timer); timer = null; } return execute(); },
    cancel() { if (timer) clearTimeout(timer); timer = null; pending = false; },
  };
}
