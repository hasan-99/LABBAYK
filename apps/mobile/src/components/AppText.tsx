import { I18nManager, Platform, StyleSheet, Text, type TextProps } from 'react-native';

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
  // React Native Android reverses left/right Text alignment when its layout is RTL.
  // Compensate here so a right-aligned label occupies the same side as on web.
  const androidAlign: 'left' | 'right' | undefined = Platform.OS === 'android' && I18nManager.isRTL && writingDirection === 'rtl'
    ? textStyle?.textAlign === 'right' ? 'left' : textStyle?.textAlign === 'left' ? 'right' : undefined
    : undefined;
  return <Text {...props} style={[writingDirection ? { writingDirection } : null, style, { fontFamily: family }, androidAlign ? { textAlign: androidAlign } : null]} />;
}
