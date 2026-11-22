import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { ActivityIndicator, I18nManager, Platform, View } from 'react-native';

// Keep the Arabic app RTL even when the device language is English.
if (Platform.OS !== 'web') {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
  I18nManager.swapLeftAndRightInRTL(false);
}

// Load only the weights used by AppText; importing the package entry loads
// every Tajawal weight into native bundles.
const Tajawal_400Regular = require('@expo-google-fonts/tajawal/400Regular/Tajawal_400Regular.ttf');
const Tajawal_500Medium = require('@expo-google-fonts/tajawal/500Medium/Tajawal_500Medium.ttf');
const Tajawal_700Bold = require('@expo-google-fonts/tajawal/700Bold/Tajawal_700Bold.ttf');
const Tajawal_800ExtraBold = require('@expo-google-fonts/tajawal/800ExtraBold/Tajawal_800ExtraBold.ttf');
const Tajawal_900Black = require('@expo-google-fonts/tajawal/900Black/Tajawal_900Black.ttf');

export default function RootLayout() {
  const [loaded] = useFonts({ Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold, Tajawal_900Black });
  useEffect(() => {
    if (Platform.OS !== 'web' || __DEV__ || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);
  if (!loaded) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1411' }}><ActivityIndicator color="#B7FF30" /></View>;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0B1411' } }} />;
}
