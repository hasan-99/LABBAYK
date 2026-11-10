import { StyleSheet, Text, type TextProps } from 'react-native';

const families: Record<string, string> = {
  '400': 'Tajawal_400Regular',
  '500': 'Tajawal_500Medium',
  '600': 'Tajawal_500Medium',
  '700': 'Tajawal_700Bold',
  '800': 'Tajawal_800ExtraBold',
  '900': 'Tajawal_900Black',
};

export function AppText({ style, ...props }: TextProps) {
  const weight = StyleSheet.flatten(style)?.fontWeight;
  const family = families[String(weight ?? '400')] ?? families['400'];
  return <Text {...props} style={[style, { fontFamily: family }]} />;
}
