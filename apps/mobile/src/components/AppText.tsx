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
  const textStyle = StyleSheet.flatten(style);
  const weight = textStyle?.fontWeight;
  const family = families[String(weight ?? '400')] ?? families['400'];
  const childrenText = Array.isArray(props.children)
    ? props.children.filter((child): child is string => typeof child === 'string').join(' ')
    : props.children;
  const writingDirection = textStyle?.writingDirection
    ?? (typeof childrenText === 'string' && /[\u0600-\u06FF]/u.test(childrenText) ? 'rtl' : undefined);
  return <Text {...props} style={[writingDirection ? { writingDirection } : null, style, { fontFamily: family }]} />;
}
