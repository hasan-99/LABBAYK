import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold, Tajawal_900Black } from '@expo-google-fonts/tajawal';

export default function RootLayout() {
  const [loaded] = useFonts({ Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold, Tajawal_900Black });
  useEffect(() => {
    if (Platform.OS !== 'web' || __DEV__ || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);
  if (!loaded) return null;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0B1411' } }} />;
}
