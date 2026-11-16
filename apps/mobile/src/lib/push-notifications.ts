import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const tokenStorageKey = (userId: string) => `labbayk-push-token:${userId}`;

export type PushRegistrationResult =
  | { status: 'enabled' }
  | { status: 'permission-denied' }
  | { status: 'development-build-required' }
  | { status: 'missing-project-id' }
  | { status: 'unsupported' }
  | { status: 'error' };

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
    return !!await SecureStore.getItemAsync(tokenStorageKey(userId));
  } catch {
    return false;
  }
}

export async function enablePushNotifications(userId: string, askPermission = true): Promise<PushRegistrationResult> {
  if (Platform.OS !== 'web' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return { status: 'development-build-required' };
  }
  if (!supabase) return { status: 'error' };

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
      await Notifications.setNotificationChannelAsync('order_updates', {
        name: 'تحديثات الطلبات',
        description: 'تنبيهات عند تغيّر حالة طلبك',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 200, 250],
        lightColor: '#B7FF30',
      });
    }

    const current = await Notifications.getPermissionsAsync();
    const permission = current.granted || !askPermission ? current : await Notifications.requestPermissionsAsync();
    if (!permission.granted) return { status: 'permission-denied' };

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.rpc('register_push_token', {
      p_expo_push_token: token,
      p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    if (error) return { status: 'error' };

    await SecureStore.setItemAsync(tokenStorageKey(userId), token);
    return { status: 'enabled' };
  } catch {
    return { status: 'error' };
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
  const token = await SecureStore.getItemAsync(tokenStorageKey(userId));
  if (token && supabase) {
    const { error } = await supabase.from('push_tokens').delete()
      .eq('user_id', userId)
      .eq('expo_push_token', token);
    if (error) throw error;
  }
  await SecureStore.deleteItemAsync(tokenStorageKey(userId));
}

function decodeBase64Url(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes.buffer as ArrayBuffer;
}
