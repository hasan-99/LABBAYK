import { createClient, type Session } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { Database } from '@labbayk/shared/database.types';
import { createMonitoredFetch } from './network-health';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && publishableKey);
export const supabaseUrl = url;
export const supabasePublishableKey = publishableKey;
const webStorage = {
  getItem: async (key: string) => typeof window === 'undefined' ? null : window.localStorage.getItem(key),
  setItem: async (key: string, value: string) => { if (typeof window !== 'undefined') window.localStorage.setItem(key, value); },
  removeItem: async (key: string) => { if (typeof window !== 'undefined') window.localStorage.removeItem(key); },
};
const nativeStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

export const supabase = supabaseConfigured ? createClient<Database>(url!, publishableKey!, {
  auth: { storage: Platform.OS === 'web' ? webStorage : nativeStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
  global: { fetch: createMonitoredFetch(fetch) },
}) : null;

/**
 * Asks the backend for a tiny health response, through the same monitored fetch, so a success also
 * flips the app's online state back. Used when the user pulls to refresh while the app still thinks
 * it is offline: without a real request nothing could ever mark the connection as restored.
 */
export async function recheckBackend(): Promise<boolean> {
  if (!url || !publishableKey) return false;
  try {
    const response = await createMonitoredFetch(fetch, 8_000)(`${url}/auth/v1/health`, { headers: { apikey: publishableKey } });
    return response.status < 500;
  } catch { return false; }
}

/**
 * Reads the saved session straight from device storage, without the network.
 * supabase.auth.getSession() refreshes an expired token before it resolves, which on a slow
 * connection kept the app on its loading screen for seconds. The app opens from this copy and the
 * real getSession() result (refreshed, or null if revoked) replaces it moments later.
 */
export async function readStoredSession(): Promise<Session | null> {
  if (!url) return null;
  try {
    const key = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
    const raw = Platform.OS === 'web' ? (typeof window === 'undefined' ? null : window.localStorage.getItem(key)) : await SecureStore.getItemAsync(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { user?: { id?: string }; currentSession?: Session } & Partial<Session>;
    const session = (parsed.currentSession ?? parsed) as Session;
    return session?.user?.id && session.refresh_token ? session : null;
  } catch {
    return null;
  }
}
