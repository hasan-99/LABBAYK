import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const tokenStorageKey = (userId: string) => `labbayk-push-token:${userId}`;
export type PushFailureStage = 'notifications-module' | 'android-channel' | 'permission-check' | 'fcm-token' | 'supabase-registration' | 'local-storage';
async function readStoredPushToken(userId: string): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(tokenStorageKey(userId));
    if (token) return token;
  } catch { /* Try secure storage when app storage is unavailable. */ }
  try { return await SecureStore.getItemAsync(tokenStorageKey(userId)); } catch { return null; }
}

async function storePushToken(userId: string, token: string): Promise<void> {
  const key = tokenStorageKey(userId);
  try {
    await SecureStore.setItemAsync(key, token);
  } catch {
    // Remove an old secure token when Keystore cannot replace it; otherwise reads can return
    // that stale value ahead of the new AsyncStorage fallback token.
    try { await SecureStore.deleteItemAsync(key); } catch { /* AsyncStorage remains the fallback source. */ }
  }
  try {
    await AsyncStorage.setItem(key, token);
  } catch {
    try { await AsyncStorage.removeItem(key); } catch { /* The server already has the token. */ }
  }
}

const statusCache = new Map<string, { status: PushRegistrationResult['status']; at: number }>();
const failureStages = new Map<string, PushFailureStage>();
const statusListeners = new Map<string, Set<(status: PushRegistrationResult['status'], failureStage?: PushFailureStage) => void>>();
const inFlightRegistrations = new Map<string, { askPermission: boolean; promise: Promise<PushRegistrationResult> }>();

function rememberPushStatus(userId: string, result: PushRegistrationResult) {
  statusCache.set(userId, { status: result.status, at: Date.now() });
  if (result.status === 'error' && result.failureStage) failureStages.set(userId, result.failureStage);
  else failureStages.delete(userId);
  statusListeners.get(userId)?.forEach((listener) => {
    try { listener(result.status, result.status === 'error' ? result.failureStage : undefined); } catch { /* A view closing during registration must not break the registration. */ }
  });
}

export function peekPushFailureStage(userId: string): PushFailureStage | null {
  return failureStages.get(userId) ?? null;
}

export function subscribePushStatus(userId: string, listener: (status: PushRegistrationResult['status'], failureStage?: PushFailureStage) => void): () => void {
  const listeners = statusListeners.get(userId) ?? new Set();
  listeners.add(listener);
  statusListeners.set(userId, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) statusListeners.delete(userId);
  };
}

export type PushRegistrationResult =
  | { status: 'enabled'; expoPushToken?: string }
  | { status: 'permission-denied' }
  | { status: 'development-build-required' }
  | { status: 'missing-project-id' }
  | { status: 'unsupported' }
  | { status: 'error'; failureStage?: PushFailureStage };

export async function hasRegisteredPushToken(userId: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription || !supabase) return false;
      const { data, error } = await supabase.from('web_push_subscriptions').select('user_id')
        .eq('endpoint', subscription.endpoint).eq('user_id', userId).maybeSingle();
      return !error && !!data;
    }
    return !!await readStoredPushToken(userId);
  } catch {
    return false;
  }
}

export function enablePushNotifications(userId: string, askPermission = true): Promise<PushRegistrationResult> {
  const active = inFlightRegistrations.get(userId);
  if (active) {
    if (!askPermission || active.askPermission) return active.promise;
    return active.promise.then((result) => result.status === 'permission-denied'
      ? enablePushNotifications(userId, true)
      : result);
  }

  let promise: Promise<PushRegistrationResult>;
  promise = registerPushNotifications(userId, askPermission)
    .then((result) => {
      rememberPushStatus(userId, result);
      return result;
    })
    .finally(() => {
      if (inFlightRegistrations.get(userId)?.promise === promise) inFlightRegistrations.delete(userId);
    });
  inFlightRegistrations.set(userId, { askPermission, promise });
  return promise;
}

async function registerPushNotifications(userId: string, askPermission: boolean): Promise<PushRegistrationResult> {
  if (Platform.OS !== 'web' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return { status: 'development-build-required' };
  }
  if (!supabase) return { status: 'error', failureStage: 'supabase-registration' };

  let failureStage: PushFailureStage = 'notifications-module';
  try {
    if (Platform.OS === 'web') {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return { status: 'unsupported' };
      const { data: keyData, error: keyError } = await supabase.functions.invoke('push-notification', { body: { action: 'get-public-key' } });
      const applicationServerKey = keyData?.publicKey;
      if (keyError || typeof applicationServerKey !== 'string' || !applicationServerKey) return { status: 'error' };
      let permission = Notification.permission;
      if (permission === 'default' && askPermission) permission = await Notification.requestPermission();
      if (permission !== 'granted') return { status: 'permission-denied' };
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeBase64Url(applicationServerKey) });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return { status: 'error' };
      const { error } = await supabase.from('web_push_subscriptions').upsert({
        endpoint: json.endpoint,
        user_id: userId,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
      if (error) { await subscription.unsubscribe(); return { status: 'error' }; }
      return { status: 'enabled' };
    }
    const Notifications = await import('expo-notifications');
    const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return { status: 'missing-project-id' };

    if (Platform.OS === 'android') {
      failureStage = 'android-channel';
      try {
        await Notifications.setNotificationChannelAsync('order_updates', {
          name: 'تحديثات الطلبات',
          description: 'تنبيهات عند تغيّر حالة طلبك',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 200, 250],
          lightColor: '#B7FF30',
        });
      } catch {
        // Some Android devices reject optional channel settings. Retry with only required fields;
        // even if the OEM still rejects channel creation, continue token registration and let
        // Android use the app's configured fallback channel.
        try {
          await Notifications.setNotificationChannelAsync('order_updates', {
            name: 'تحديثات الطلبات',
            importance: Notifications.AndroidImportance.HIGH,
          });
        } catch { /* Continue with the system fallback channel. */ }
      }
    }

    failureStage = 'permission-check';
    const current = await Notifications.getPermissionsAsync();
    const permission = current.granted || !askPermission ? current : await Notifications.requestPermissionsAsync();
    if (!permission.granted) return { status: 'permission-denied' };

    failureStage = 'fcm-token';
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    failureStage = 'supabase-registration';
    const { error } = await supabase.rpc('register_push_token', {
      p_expo_push_token: token,
      p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    if (error) return { status: 'error', failureStage };

    failureStage = 'local-storage';
    await storePushToken(userId, token);
    return { status: 'enabled', expoPushToken: token };
  } catch {
    return { status: 'error', failureStage };
  }
}

export async function unregisterPushNotifications(userId: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (!('serviceWorker' in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager.getSubscription();
    const endpoint = subscription?.endpoint;
    let deleteError: Error | null = null;
    if (endpoint && supabase) {
      const { error } = await supabase.from('web_push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint);
      if (error) deleteError = error;
    }
    await subscription?.unsubscribe();
    if (deleteError) throw deleteError;
    return;
  }
  const token = await readStoredPushToken(userId);
  if (token && supabase) {
    const { error } = await supabase.from('push_tokens').delete()
      .eq('user_id', userId)
      .eq('expo_push_token', token);
    if (error) throw error;
  }
  try { await SecureStore.deleteItemAsync(tokenStorageKey(userId)); } catch { /* Continue clearing fallback storage. */ }
  try { await AsyncStorage.removeItem(tokenStorageKey(userId)); } catch { /* Ignore if there was no fallback token. */ }
}

function decodeBase64Url(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes.buffer as ArrayBuffer;
}

/** Last known registration result per account, so several screens can show it without repeating the check. */
export function peekPushStatus(userId: string): PushRegistrationResult['status'] | null {
  return statusCache.get(userId)?.status ?? null;
}
/** Checks (and, when the permission is already granted, refreshes) this device's push registration. */
export async function checkPushStatus(userId: string, askPermission = false): Promise<PushRegistrationResult['status']> {
  const cached = statusCache.get(userId);
  if (!askPermission && cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.status;
  return (await enablePushNotifications(userId, askPermission)).status;
}

export type TestPushResult = { status: 'sent' | 'no-token' | 'unsupported' | 'rejected' | 'error'; detail?: string };
/**
 * Sends a real push to this device through Expo's push service (the same path server notifications use),
 * so it tests the whole chain: device token, Expo, Firebase (FCM) credentials. Expo reports credential problems
 * in its answer, which is shown to the person instead of failing silently.
 */
export async function sendTestPush(_userId: string, onStage?: (stage: string) => void): Promise<TestPushResult> {
  if (Platform.OS === 'web') return { status: 'unsupported' };
  try {
    onStage?.('عم نبدأ اختبار الإشعار على السيرفر…');
    if (!supabase) return { status: 'error', detail: 'Supabase غير مهيأ' };
    onStage?.('عم نتحقق من رمز الجهاز المسجّل…');
    const { data, error } = await supabase.functions.invoke('push-notification', {
      body: { action: 'send-test' },
    });
    if (error) {
      onStage?.(`فشل اتصال الاختبار: ${error.message}`);
      return { status: 'error', detail: error.message };
    }
    onStage?.(data?.status === 'sent' ? 'Expo قبل الإرسال؛ عم ننتظر وصول الإشعار…' : `الاختبار وقف عند ${data?.stage ?? 'استجابة غير معروفة'}.`);
    if (data?.status === 'sent') return { status: 'sent' };
    if (data?.status === 'rejected') return { status: 'rejected', detail: data.detail };
    return { status: 'error', detail: data?.stage ?? 'unknown' };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown';
    onStage?.(`تعطّل الاختبار: ${detail}`);
    return { status: 'error', detail };
  }
}
