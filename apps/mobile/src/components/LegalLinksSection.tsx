import { Link } from 'expo-router';
import { Linking, Pressable, View } from 'react-native';
import { ltrPhone, prettyPhone, useSupportContact, whatsappUrl } from '@/lib/support-contact';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { AppText as Text } from '@/components/AppText';

const pages: { href: '/privacy' | '/terms' | '/support'; title: string; detail: string; icon: { ios: SFSymbol; android: AndroidSymbol; web: AndroidSymbol } }[] = [
  { href: '/privacy', title: 'سياسة الخصوصية', detail: 'كيف نحمي بياناتك ونستخدمها', icon: { ios: 'hand.raised.fill', android: 'shield', web: 'shield' } },
  { href: '/terms', title: 'شروط الاستخدام', detail: 'قواعد استخدام خدمة لَبّيك', icon: { ios: 'doc.text.fill', android: 'description', web: 'description' } },
  { href: '/support', title: 'الدعم والمساعدة', detail: 'تواصل معنا عند الحاجة', icon: { ios: 'questionmark.circle.fill', android: 'support_agent', web: 'support_agent' } },
];

export function LegalLinksSection({ theme }: { theme: 'dark' | 'light' }) {
  const dark = theme === 'dark';
  const support = useSupportContact();
  const colors = dark
    ? { surface: '#142119', raised: '#17251C', border: '#2C4034', text: '#F3F7F3', muted: '#A9B9B0', accent: '#B7FF30', danger: '#F0787F', dangerBg: '#291C1D' }
    : { surface: '#FFFFFF', raised: '#EFF5E8', border: '#DCE4D8', text: '#20241F', muted: '#5D645B', accent: '#287A55', danger: '#B42318', dangerBg: '#FBE9E7' };
  return <View style={{ gap: 12, marginTop: 14 }}>
    {(support?.phone || support?.whatsapp) ? <View style={{ padding: 15, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 9 }}>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800', textAlign: 'right' }}>تواصل مع الإدارة</Text>
      <View style={{ flexDirection: 'row-reverse', gap: 9 }}>
        {support.phone ? <Pressable onPress={() => void Linking.openURL(`tel:${support.phone}`)} accessibilityRole="button" accessibilityLabel="اتصال بالإدارة" style={{ flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: '#B7FF30', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#0B1411', fontSize: 14, fontWeight: '900' }}>📞 اتصال</Text></Pressable> : null}
        {support.whatsapp ? <Pressable onPress={() => void Linking.openURL(whatsappUrl(support.whatsapp as string))} accessibilityRole="button" accessibilityLabel="واتساب الإدارة" style={{ flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#06210F', fontSize: 14, fontWeight: '900' }}>💬 واتساب</Text></Pressable> : null}
      </View>
      {support.phone ? <Text selectable style={{ color: colors.muted, fontSize: 13, textAlign: 'center' }}>{ltrPhone(prettyPhone(support.phone))}</Text> : null}
    </View> : null}
    <View style={{ padding: 15, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800', textAlign: 'right', marginBottom: 5 }}>السياسات والمساعدة</Text>
      <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'right', marginBottom: 9 }}>كل ما يخص استخدامك وبياناتك والتواصل معنا.</Text>
      {pages.map((page) => <Link key={page.href} href={page.href} asChild><Pressable accessibilityRole="link" style={{ minHeight: 54, flexDirection: 'row-reverse', alignItems: 'center', gap: 11, borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 8 }}>
        <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}><SymbolView name={page.icon} tintColor={colors.accent} size={18}/></View>
        <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', textAlign: 'right' }}>{page.title}</Text><Text style={{ color: colors.muted, fontSize: 11, textAlign: 'right', marginTop: 2 }}>{page.detail}</Text></View>
        <SymbolView name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }} tintColor={colors.muted} size={16}/>
      </Pressable></Link>)}
    </View>
    <Link href="/delete-account" asChild><Pressable accessibilityRole="link" style={{ minHeight: 60, padding: 13, borderRadius: 16, flexDirection: 'row-reverse', alignItems: 'center', gap: 11, backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: colors.danger }}>
      <SymbolView name={{ ios: 'person.crop.circle.badge.xmark', android: 'person_remove', web: 'person_remove' }} tintColor={colors.danger} size={21}/>
      <View style={{ flex: 1 }}><Text style={{ color: colors.danger, fontSize: 13, fontWeight: '800', textAlign: 'right' }}>طلب حذف الحساب</Text><Text style={{ color: colors.muted, fontSize: 11, textAlign: 'right', marginTop: 2 }}>راجع البيانات والخطوات قبل إرسال الطلب.</Text></View>
      <SymbolView name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }} tintColor={colors.danger} size={16}/>
    </Pressable></Link>
  </View>;
}
