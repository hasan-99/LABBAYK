import { Children, Fragment, createContext, isValidElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import type { Metadata } from 'expo-router/server';
import { ActivityIndicator, Animated, AppState, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { useNetworkState } from 'expo-network';
import type { NotificationResponse } from 'expo-notifications';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tokens } from '@labbayk/design-tokens';
import type { Session } from '@supabase/supabase-js';
import type { Database } from '@labbayk/shared/database.types';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { getBackendHealth, subscribeBackendHealth, type BackendHealth } from '@/lib/network-health';
import { clearCustomerOrderDraft, clearCustomerOrdersSnapshot, loadCustomerOrderDraft, loadCustomerOrdersSnapshot, saveCustomerOrderDraft, saveCustomerOrdersSnapshot, type CustomerOrderImageDraft, type CustomerOrderSnapshot } from '@/lib/customer-order-draft';
import { clearDriverOrdersSnapshot, loadDriverOrdersSnapshot, saveDriverOrdersSnapshot } from '@/lib/driver-orders-cache';
import { enablePushNotifications, hasRegisteredPushToken, unregisterPushNotifications } from '@/lib/push-notifications';
import { AuthScreen, PasswordRecoveryScreen } from '@/components/AuthScreen';
import { LegalLinksSection } from '@/components/LegalLinksSection';
import { AppText as Text } from '@/components/AppText';
import { ToastProvider, useToastMessage } from '@/components/Toast';

const c: any = tokens.color;
const MobileThemeContext = createContext<{ colors: any; styles: Record<string, any> } | null>(null);
function useMobileTheme() {
  const theme = useContext(MobileThemeContext);
  if (!theme) throw new Error('useMobileTheme must be used inside MobileThemeContext');
  return theme;
}
const mobileThemeKey = 'labbayk-theme';
const lightPalette = { ...tokens.color, background: '#F5F7F2', surface: '#FFFFFF', raised: '#EFF5E8', surfaceRaised: '#EFF5E8', border: '#DCE4D8', text: '#20241F', muted: '#5D645B', primary: '#343A32', accent: '#287A55', danger: '#B42318' } as unknown as typeof tokens.color;
const lightColorMap: Record<string, string> = {
  '#0B1411':'#F5F7F2','#101A14':'#F5F7F2','#0F1A13':'#F5F7F2','#111c16':'#F5F7F2','#121d16':'#F5F7F2',
  '#142119':'#FFFFFF','#15231a':'#FFFFFF','#17251C':'#F5F7F2','#17251c':'#F5F7F2','#1D2B24':'#FFFFFF','#25382E':'#EFF5E8','#25382d':'#EFF5E8','#26382c':'#EFF5E8','#263b2c':'#EFF5E8','#26392c':'#EFF5E8','#283b2d':'#EFF5E8','#223128':'#EFF5E8','#344629':'#EFF5E8','#2C4034':'#DCE4D8','#33473b':'#DCE4D8','#3b5143':'#DCE4D8','#405449':'#DCE4D8','#42564a':'#DCE4D8','#3A5143':'#DCE4D8',
  '#FFFFFF':'#20241F','#ffffff':'#20241F','#fff':'#20241F','#E4EEE7':'#30372F','#A9B9B0':'#5D645B','#8fa196':'#687066','#839188':'#687066','#819087':'#58675D','#91A397':'#58675D','#99AA9E':'#58675D','#99bd75':'#496037','#DFFFAD':'#30372F','#DFFFAE':'#30372F','#D3EFA4':'#30372F','#B8C8BE':'#5D645B','#FFC1AD':'#A33420','#FFD1D1':'#A33420','#FFE2A0':'#765500',
  '#451E21':'#FBE9E7','#302321':'#FBE9E7','#352D1D':'#FFF4D6','#263820':'#EFF5E8','#3A2D18':'#FFF4D6'
};
function stylesForTheme(definitions: Record<string, Record<string, unknown>>, theme: 'dark' | 'light'): Record<string, any> {
  if (theme === 'dark') return StyleSheet.create(definitions as never) as Record<string, any>;
  const mapped = Object.fromEntries(Object.entries(definitions).map(([name, style]) => [name, Object.fromEntries(Object.entries(style).map(([property, value]) => {
    if (typeof value !== 'string' || !/color/i.test(property)) return [property, value];
    if (property === 'color' && ['#0B1411','#101A14','#0F1A13'].includes(value)) return [property, '#20241F'];
    const replacement = lightColorMap[value];
    if (replacement) return [property, replacement];
    if (/^border.*color$/i.test(property) && /^#[0-9a-f]{6}$/i.test(value)) return [property, value.toUpperCase() === '#B7FF30' ? '#9ACB28' : '#DCE4D8'];
    if (/^#[0-9a-f]{6}$/i.test(value)) {
      const raw = value.slice(1);
      const luminance = (parseInt(raw.slice(0, 2), 16) * 299 + parseInt(raw.slice(2, 4), 16) * 587 + parseInt(raw.slice(4, 6), 16) * 114) / 1000;
      if (property === 'backgroundColor' && luminance < 62) return [property, '#F3F6F2'];
      if (property === 'backgroundColor' && luminance < 112) return [property, '#EDF3ED'];
      if (property === 'backgroundColor' && luminance < 158) return [property, '#E6F0D8'];
      if ((property === 'color' || property === 'tintColor') && luminance > 165) return [property, '#343A32'];
      if ((property === 'color' || property === 'tintColor') && luminance < 45) return [property, '#20241F'];
    }
    return [property, value];
  }))]));
  const driverPrimarySurfaces = ['driverHeroOrb','driverAvailabilityAction','driverAvailabilityHeroIconOn','driverSaveButton','completeDriverProfile','driverOnboardingIcon','driverOnboardingButton','driverFooterButtonActive'];
  for (const name of driverPrimarySurfaces) {
    if (mapped[name]) mapped[name].backgroundColor = '#B7FF30';
  }
  const driverPrimaryText = ['driverAvailabilityActionText','driverSaveButtonText','completeDriverProfileText','driverOnboardingButtonText','driverFooterLabelActive'];
  for (const name of driverPrimaryText) {
    if (mapped[name]) mapped[name].color = '#0B1411';
  }
  if (mapped.driverHero) Object.assign(mapped.driverHero, { backgroundColor: '#F2F7E8', borderColor: '#C9D9A7' });
  if (mapped.driverAvailabilityHeroOn) Object.assign(mapped.driverAvailabilityHeroOn, { backgroundColor: '#F0F6E4', borderColor: '#B7D66C' });
  if (mapped.driverOnboardingCard) Object.assign(mapped.driverOnboardingCard, { backgroundColor: '#FFFFFF', borderColor: '#DCE4D8' });
  if (mapped.driverHeaderAvatar) mapped.driverHeaderAvatar.borderColor = '#A7CF45';
  if (mapped.driverPhotoRing) mapped.driverPhotoRing.borderColor = '#A7CF45';
  if (mapped.driverTabBadgeText) mapped.driverTabBadgeText.color = '#FFFFFF';
  Object.assign(mapped.driverFooter, { backgroundColor: '#FFFFFF', borderTopColor: '#CCD6C8' });
  Object.assign(mapped.driverFooterButtonActive, { backgroundColor: '#B7FF30' });
  Object.assign(mapped.driverFooterLabel, { color: '#495248', fontSize: 11 });
  Object.assign(mapped.driverFooterLabelActive, { color: '#17210F', fontSize: 11, fontWeight: '900' });
  Object.assign(mapped.driverTabBadge, { minWidth: 22, height: 22, borderRadius: 11, right: -7, top: -6, paddingHorizontal: 4, backgroundColor: '#C62828', borderColor: '#FFFFFF', borderWidth: 2 });
  Object.assign(mapped.driverTabBadgeText, { color: '#FFFFFF', fontSize: 10, fontWeight: '900' });
  Object.assign(mapped.footer, { backgroundColor: '#FFFFFF', borderTopColor: '#CCD6C8' });
  Object.assign(mapped.footerButtonActive, { backgroundColor: '#B7FF30' });
  Object.assign(mapped.footerItem, { color: '#495248', fontSize: 12 });
  Object.assign(mapped.footerActive, { color: '#17210F', fontSize: 12, fontWeight: '900' });
  Object.assign(mapped.accountIntro, { borderRightWidth: 3, borderRightColor: '#B7FF30', paddingRight: 10 });
  Object.assign(mapped.profileSectionCard, { borderColor: '#D5E1C8' });
  Object.assign(mapped.accountRoleTag, { backgroundColor: '#EDF7D9', borderColor: '#D4E3BD' });
  Object.assign(mapped.accountRoleTagText, { color: '#405D1B' });
  Object.assign(mapped.customerIdentityAvatar, { backgroundColor: '#F8FBEF', borderColor: '#A7CF45' });
  Object.assign(mapped.driverIdentityAvatar, { backgroundColor: '#F8FBEF', borderColor: '#A7CF45' });
  Object.assign(mapped.driverIdentityName, { color: '#20241F' });
  Object.assign(mapped.driverIdentityEmail, { color: '#5D645B' });
  Object.assign(mapped.driverRoleTag, { backgroundColor: '#EDF7D9', borderColor: '#D4E3BD' });
  Object.assign(mapped.driverRoleTagText, { color: '#405D1B' });
  Object.assign(mapped.driverIdentityFact, { backgroundColor: '#F8FBEF', borderColor: '#D4E3BD' });
  Object.assign(mapped.driverIdentityFactLabel, { color: '#626D5A' });
  Object.assign(mapped.driverIdentityFactValue, { color: '#20241F' });
  Object.assign(mapped.profileHeadingIcon, { backgroundColor: '#B7FF30' });
  Object.assign(mapped.profileSectionTag, { color: '#405D1B', backgroundColor: '#EDF7D9' });
  Object.assign(mapped.profileSectionAction, { backgroundColor: '#F8FBEF', borderColor: '#D4E3BD' });
  Object.assign(mapped.profileSectionActionText, { color: '#405D1B' });
  Object.assign(mapped.profileSectionActionPrimary, { backgroundColor: '#B7FF30', borderColor: '#B7FF30' });
  Object.assign(mapped.profileSectionActionTextPrimary, { color: '#17210F' });
  Object.assign(mapped.profileAddressSummary, { backgroundColor: '#F8FBEF', borderColor: '#D4E3BD' });
  Object.assign(mapped.profileThemeRow, { backgroundColor: '#F8FBEF', borderColor: '#D4E3BD' });
  Object.assign(mapped.profileThemeIcon, { backgroundColor: '#B7FF30' });
  Object.assign(mapped.profileThemeState, { backgroundColor: '#E9F8C9' });
  Object.assign(mapped.profileThemeStateText, { color: '#405D1B' });
  Object.assign(mapped.address, { minHeight: 64, paddingHorizontal: 12, backgroundColor: '#FFFFFF', borderColor: '#D5E1C8' });
  Object.assign(mapped.pin, { width: 36, height: 36, borderRadius: 12, backgroundColor: '#EDF7D9' });
  Object.assign(mapped.pinGlyph, { color: '#385616' });
  Object.assign(mapped.addressEyebrow, { color: '#626D5A' });
  Object.assign(mapped.addressName, { color: '#20241F' });
  Object.assign(mapped.addressChangeButton, { minWidth: 88, flexShrink: 0, backgroundColor: '#B7FF30', borderColor: '#A3E51E' });
  Object.assign(mapped.addressChange, { color: '#0B1411', fontSize: 12, fontWeight: '900', flexShrink: 0 });
  Object.assign(mapped.ordersIntroCard, { backgroundColor: '#FFFFFF', borderColor: '#D5E1C8' });
  Object.assign(mapped.ordersEyebrow, { color: '#56751F' });
  Object.assign(mapped.ordersEyebrowDot, { backgroundColor: '#B7FF30' });
  Object.assign(mapped.ordersBackButton, { backgroundColor: '#F3F8E8', borderColor: '#D3E2B9' });
  Object.assign(mapped.ordersBackButtonText, { color: '#405D1B' });
  Object.assign(mapped.ordersCountBadge, { backgroundColor: '#B7FF30', borderColor: '#A3E51E' });
  Object.assign(mapped.ordersCountValue, { color: '#17210F' });
  Object.assign(mapped.ordersCountLabel, { color: '#385616' });
  Object.assign(mapped.ordersRefreshButton, { backgroundColor: '#EFF7DF', borderColor: '#D3E2B9' });
  Object.assign(mapped.notificationCard, { backgroundColor: '#FFFFFF', borderColor: '#CCD6C8' });
  Object.assign(mapped.notificationIcon, { backgroundColor: '#EDF7D9', borderColor: '#CFDDB7' });
  Object.assign(mapped.notificationCount, { backgroundColor: '#B7FF30', borderColor: '#9BCB35' });
  Object.assign(mapped.notificationCountText, { color: '#17210F', fontSize: 13, fontWeight: '900' });
  Object.assign(mapped.notificationItemRead, { opacity: 1 });
  Object.assign(mapped.notificationItemBody, { color: '#4F584D' });
  Object.assign(mapped.notificationItemMeta, { color: '#586253', fontSize: 11 });
  Object.assign(mapped.notificationItemTitle, { flex: 1, minWidth: 0, color: '#20241F' });
  Object.assign(mapped.notificationDot, { backgroundColor: '#6C9F16' });
  Object.assign(mapped.notificationDotRead, { backgroundColor: '#849080' });
  Object.assign(mapped.notificationUnreadPill, { backgroundColor: '#E9F8C9', borderColor: '#B7D87A' });
  Object.assign(mapped.notificationUnreadPillText, { color: '#385616' });
  Object.assign(mapped.notificationMarkAll, { backgroundColor: '#EFF7DF', borderColor: '#D3E2B9' });
  Object.assign(mapped.notificationMarkAllText, { color: '#405D1B' });
  Object.assign(mapped.notificationItemStandalone, { backgroundColor: '#FBFCF9', borderColor: '#D1DACD' });
  Object.assign(mapped.notificationItemUnread, { backgroundColor: '#F3F9E8', borderColor: '#BAD48D' });
  Object.assign(mapped.navigationNotificationBadge, { backgroundColor: '#B7FF30', borderColor: '#17210F' });
  Object.assign(mapped.navigationNotificationBadgeText, { color: '#17210F' });
  Object.assign(mapped.notificationOrderCard, { borderColor: '#9ACB28', backgroundColor: '#F3F9E8' });
  Object.assign(mapped.notificationOrderLabel, { color: '#17210F', backgroundColor: '#B7FF30' });
  return StyleSheet.create(mapped as never) as Record<string, any>;
}
const categories = ['خضرة', 'لحمة', 'أغراض البيت', 'غيره'];
const numberFormatter = new Intl.NumberFormat('en-US');
const normalizeDigits = (value: string) => value.replace(/[٠-٩۰-۹]/g, (digit) => {
  const code = digit.charCodeAt(0);
  return String(code >= 0x06F0 ? code - 0x06F0 : code - 0x0660);
}).replace(/\D/g, '');
const formatSyrianMobile = (value: string) => normalizeDigits(value).slice(0, 9).replace(/^(\d{3})(\d{0,3})(\d{0,3})$/, (_match, first: string, second: string, third: string) => [first, second, third].filter(Boolean).join(' '));
const shortTimeFormatter = new Intl.DateTimeFormat('ar-SY', { timeStyle: 'short' });
const shortDateTimeFormatter = new Intl.DateTimeFormat('ar-SY', { dateStyle: 'medium', timeStyle: 'short' });
export function generateMetadata(): Metadata {
  return { title: 'لَبّيك | اطلب، والباقي علينا.', description: 'خدمة يومك تبدأ من هون. احتياجاتك، بطلب واحد.' };
}
type Address = Database['public']['Tables']['addresses']['Row'];
type DriverOfferAddress = Pick<Address, 'id'|'label'|'street'|'city'|'neighborhood'|'building'|'landmark'>;
type CustomerOrder = Pick<Database['public']['Tables']['orders']['Row'], 'id'|'status'|'category'|'request_text'|'delivery_fee_minor'|'delivery_quote_set_at'|'delivery_quote_approved_at'|'budget_ceiling_minor'|'purchase_amount_minor'|'purchase_approved_at'|'created_at'>;
type DriverOfferCard = { id: string; expires_at: string; order: Pick<Database['public']['Tables']['orders']['Row'], 'id'|'status'|'category'|'request_text'|'delivery_fee_minor'|'budget_ceiling_minor'|'address_id'> & { address: DriverOfferAddress | null } };
type DriverActiveOrder = Pick<Database['public']['Tables']['orders']['Row'], 'id'|'status'|'category'|'request_text'|'delivery_fee_minor'|'budget_ceiling_minor'|'purchase_amount_minor'|'purchase_approved_at'|'created_at'|'address_id'> & { address: Pick<Address, 'id'|'label'|'street'|'city'|'neighborhood'|'contact_phone'|'building'|'landmark'> | null };
const newRequestKey = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => { const value = Math.random() * 16 | 0; return (char === 'x' ? value : (value & 3 | 8)).toString(16); });
type OrderImage = CustomerOrderImageDraft & { uri: string };
type ProfileAvatarDraft = { uri: string; mimeType: string; extension: string };
const orderStatus: Record<string, string> = { requested:'بانتظار تحديد أجرة التوصيل', quoted:'بانتظار سائق متاح', searching:'عم نفتش على سائق', accepted:'قبل السائق الطلب', assigned:'تم تعيين سائق', shopping:'عم نجهز طلبك', awaiting_approval:'بانتظار موافقتك', purchased:'تم الشراء', delivering:'بالطريق لعندك', delivered:'تم التوصيل', settled:'تمت التسوية', disputed:'قيد مراجعة الدعم', cancelled:'ملغي' };

function SkeletonBlock({ width = '68%', height = 11, style }: { width?: number | `${number}%`; height?: number; style?: object }) {
  const { colors: c } = useMobileTheme();
  const [pulse] = useState(() => new Animated.Value(0.45));
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.45, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[{ width, height, borderRadius: 8, backgroundColor: c.border, alignSelf: 'flex-end', opacity: pulse }, style]} />;
}

function SkeletonCard({ children, style }: { children: ReactNode; style?: object }) {
  const { colors: c } = useMobileTheme();
  return <View style={[{ borderRadius: 24, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 16 }, style]}>{children}</View>;
}
const skRow = { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 } as const;
const skCol = { flex: 1, gap: 9, alignItems: 'flex-end' } as const;
const sk = (width: number | `${number}%`, height: number, extra?: object) => <SkeletonBlock width={width} height={height} style={{ alignSelf: 'auto', ...extra }} />;

function NotificationsSkeleton({ standalone }: { standalone: boolean }) {
  return <View accessibilityRole="progressbar" accessibilityLabel="تحميل التنبيهات" style={{ gap: 12, paddingVertical: 8 }}>
    {standalone && <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 2 }}>{sk(64, 40, { borderRadius: 20 })}{sk(104, 40, { borderRadius: 20 })}{sk(84, 40, { borderRadius: 20 })}{sk(84, 40, { borderRadius: 20 })}</View>}
    {[0, 1, 2].map((item) => <SkeletonCard key={item}>
      <View style={[skRow, { alignItems: 'flex-start' }]}>{sk(52, 52, { borderRadius: 17 })}<View style={skCol}><View style={[skRow, { justifyContent: 'space-between', width: '100%' }]}>{sk('56%', 16)}{sk(54, 24, { borderRadius: 12 })}</View>{sk('94%', 11)}{sk('68%', 11)}</View></View>
      <View style={{ height: 1, backgroundColor: 'transparent', marginVertical: 13 }} />
      <View style={[skRow, { justifyContent: 'space-between' }]}>{sk(118, 32, { borderRadius: 12 })}{sk(96, 12)}</View>
    </SkeletonCard>)}
  </View>;
}

function OrdersSkeleton({ styles: s }: { styles: Record<string, any> }) {
  return <View accessibilityRole="progressbar" accessibilityLabel="تحميل الطلبات" style={{ gap: 10 }}>
    {[0, 1].map((item) => <View key={item} style={[s.orderCard, { minHeight: 154, justifyContent: 'center', gap: 15 }]}>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}><SkeletonBlock width="34%" height={26} /><SkeletonBlock width="23%" height={12} /></View>
      <SkeletonBlock width="48%" height={13} />
      <SkeletonBlock width="88%" height={11} />
      <SkeletonBlock width="72%" height={11} />
      <View style={{ flexDirection: 'row-reverse', gap: 9, marginTop: 2 }}><SkeletonBlock width="48%" height={42} style={{ alignSelf: 'auto', flex: 1 }} /><SkeletonBlock width="48%" height={42} style={{ alignSelf: 'auto', flex: 1 }} /></View>
    </View>)}
  </View>;
}

function flattenSections(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((child) => {
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) return flattenSections(child.props.children);
    return [child];
  });
}

function EntranceSection({ children, delay = 0, transitionKey = '' }: { children: ReactNode; delay?: number; transitionKey?: string }) {
  const [progress] = useState(() => new Animated.Value(0));
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [26, 0] });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] });
  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.timing(progress, { toValue: 1, duration: 680, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [delay, progress, transitionKey]);
  return <Animated.View style={{ width: '100%', opacity: progress, transform: [{ translateY }, { scale }] }}>{children}</Animated.View>;
}

function StaggeredSections({ children, transitionKey, animateSingle = false }: { children: ReactNode; transitionKey: string; animateSingle?: boolean }) {
  const sections = flattenSections(children);
  if (sections.length === 1 && !animateSingle) return <>{sections[0]}</>;
  return <>{sections.map((section, index) => <EntranceSection key={`${transitionKey}-${String(isValidElement(section) ? section.key ?? index : index)}`} transitionKey={transitionKey} delay={Math.min(index * 120, 600)}>{section}</EntranceSection>)}</>;
}

function AddressBook({ userId, onBack, backLabel, onAddressSaved }: { userId: string; onBack: () => void; backLabel: string; onAddressSaved: (address: Address) => void }) {
  const { colors: c, styles: s } = useMobileTheme();
  const online = useInternetAvailable();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [historyAddresses, setHistoryAddresses] = useState<Address[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyLoaded = useRef(false);
  const [manualGovernorate, setManualGovernorate] = useState('');
  const [manualCity, setManualCity] = useState('');
  const [manualNeighborhood, setManualNeighborhood] = useState('');
  const [label, setLabel] = useState('');
  const [street, setStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const editingAddressRef = useRef<Address | null>(null);
  const [busy, setBusy] = useState(false);
  const [addressLoadingState, setAddressLoadingState] = useState(true);
  const addressLoading = online && addressLoadingState;
  const [, setMessage] = useToastMessage();

  const fillAddress = useCallback((address: Address) => {
    editingAddressRef.current = address;
    setEditingAddress(address);
    setManualGovernorate(address.governorate.toLowerCase().includes('ريف') || address.governorate.toLowerCase().includes('rif') ? 'ريف دمشق' : 'دمشق');
    setManualCity(address.city); setManualNeighborhood(address.neighborhood); setLabel(address.label); setStreet(address.street);
    setLandmark(address.landmark ?? ''); setBuilding(address.building ?? ''); setFloor(address.floor ?? ''); setContactPhone(address.contact_phone);
  }, []);

  const refresh = useCallback(async () => {
    if (!supabase || !online) return;
    const { data: addressRows, error: addressError } = await supabase.from('addresses').select('*').eq('user_id', userId).order('is_default', { ascending: false }).order('updated_at', { ascending: false });
    setAddressLoadingState(false);
    if (addressError) { setMessage('ما قدرنا نحمّل عنوانك. أعد فتح الصفحة وجرب مرة ثانية.'); return; }
    const rows = addressRows ?? [];
    setAddresses(rows);
    if (!editingAddressRef.current && rows.length) fillAddress(rows[0]);
  }, [online, userId, fillAddress, setMessage]);
  // Refresh synchronizes this form with Supabase; updates follow the completed request.
  useEffect(() => { void refresh(); }, [refresh]);

  const openHistory = async () => {
    setShowHistory(true);
    if (historyLoaded.current) return;
    if (!supabase || !online) { setMessage('سجل العناوين يحتاج اتصالاً بالإنترنت.'); return; }
    setHistoryLoading(true);
    const [{ data: orders, error: ordersError }, { data: allAddresses, error: addressesError }] = await Promise.all([
      supabase.from('orders').select('address_id').eq('customer_id', userId),
      supabase.from('addresses').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
    ]);
    if (ordersError || addressesError) setMessage('ما قدرنا نحمّل سجل العناوين. جرّب مرة ثانية.');
    else {
      const usedIds = new Set((orders ?? []).map((order) => order.address_id));
      setHistoryAddresses((allAddresses ?? []).filter((address) => usedIds.has(address.id)));
      historyLoaded.current = true;
    }
    setHistoryLoading(false);
  };

  const save = async () => {
    if (!supabase || !online) { setMessage('حفظ العنوان يحتاج اتصالاً بالإنترنت.'); return; }
    const governorateValue = manualGovernorate.trim() === 'ريف الشام' ? 'ريف دمشق' : manualGovernorate.trim();
    const cityValue = manualCity.trim();
    const neighborhoodValue = manualNeighborhood.trim();
    if (!['دمشق', 'ريف دمشق'].includes(governorateValue)) { setMessage('اختار دمشق أو ريف دمشق؛ التوصيل متاح ضمن هالنطاق حالياً.'); return; }
    if (!governorateValue || governorateValue.length < 2 || !cityValue || cityValue.length < 2 || !neighborhoodValue) { setMessage('اكتب المحافظة أو المنطقة والمدينة والحارة.'); return; }
    if (label.trim().length < 1 || street.trim().length < 1 || contactPhone.trim().length < 7) { setMessage('كمّل اسم العنوان والشارع ورقم تواصل صحيح.'); return; }
    setBusy(true); setMessage('');
    const values = {
      user_id: userId, zone_id: null, label: label.trim(), governorate: governorateValue,
      city: cityValue, neighborhood: neighborhoodValue, street: street.trim(),
      landmark: landmark.trim() || null, building: building.trim() || null, floor: floor.trim() || null,
      contact_phone: contactPhone.trim(), is_default: editingAddress?.is_default ?? addresses.length === 0,
    };
    let savedAddress: Address | null = null;
    let saveError = '';
    if (editingAddress) {
      const { count, error: linkedOrdersError } = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('address_id', editingAddress.id);
      if (linkedOrdersError) { setBusy(false); setMessage('ما قدرنا نتحقق من الطلبات السابقة. ما غيّرنا العنوان، جرّب مرة ثانية.'); return; }
      if (count) {
        const { error: archiveError } = await supabase.from('addresses').update({ is_default: false }).eq('id', editingAddress.id).eq('user_id', userId);
        if (archiveError) saveError = archiveError.message;
        else {
          const { data, error } = await supabase.from('addresses').insert({ ...values, is_default: true }).select('*').single();
          if (error || !data) {
            await supabase.from('addresses').update({ is_default: editingAddress.is_default }).eq('id', editingAddress.id).eq('user_id', userId);
            saveError = error?.message ?? 'تعذر إنشاء نسخة العنوان الجديدة.';
          } else savedAddress = data;
        }
      } else {
        const { data, error } = await supabase.from('addresses').update(values).eq('id', editingAddress.id).eq('user_id', userId).select('*').single();
        if (error || !data) saveError = error?.message ?? 'ما لقينا العنوان الحالي.';
        else savedAddress = data;
      }
    } else {
      const { data, error } = await supabase.from('addresses').insert(values).select('*').single();
      if (error || !data) saveError = error?.message ?? 'ما قدرنا نضيف العنوان.';
      else savedAddress = data;
    }
    setBusy(false);
    if (saveError || !savedAddress) { setMessage(saveError.includes('Damascus and Rif Dimashq') ? 'التوصيل متاح حالياً بدمشق وريف دمشق فقط.' : 'ما انحفظ العنوان. تأكد من المعلومات والاتصال وجرب مرة ثانية.'); return; }
    const addedAddress = !editingAddress;
    fillAddress(savedAddress);
    setAddresses((current) => [savedAddress!, ...current.filter((address) => address.id !== editingAddress?.id && address.id !== savedAddress!.id)]);
    onAddressSaved(savedAddress);
    setMessage(addedAddress ? 'انحفظ عنوان التوصيل.' : 'انحفظ تعديل عنوان التوصيل.');
    if (addedAddress) onBack();
  };

  const remove = async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('addresses').delete().eq('id', id).eq('user_id', userId);
    if (error) {
      setMessage(error.code === '23503' ? 'ما فينا نحذف عنوان مرتبط بطلب سابق حتى يبقى سجل الطلب محفوظاً.' : 'ما قدرنا نحذف العنوان. جرّب مرة ثانية.');
      return;
    }
    setMessage('انحذف العنوان من السجل.');
    setHistoryAddresses((current) => current.filter((address) => address.id !== id));
  };

  if (showHistory && historyLoading) return <View style={s.addressPage}>
    <Pressable onPress={() => setShowHistory(false)} style={s.addressBackButton} accessibilityRole="button"><Text style={s.addressBackArrow}>→</Text><Text style={s.addressBackText}>عنوان التوصيل</Text></Pressable>
    <View style={s.addressHistoryHero}><SkeletonBlock width="66%" height={18} /><SkeletonBlock width={46} height={46} style={{ alignSelf: 'auto', borderRadius: 15 }} /></View>
    {[0, 1, 2].map((item) => <View key={item} style={[s.historyAddressCard, { minHeight: 126, justifyContent: 'center', gap: 13 }]}><SkeletonBlock width="54%" height={14} /><SkeletonBlock width="78%" height={11} /><SkeletonBlock width="65%" height={11} /><SkeletonBlock width="38%" height={10} /></View>)}
  </View>;

  if (showHistory) return <View style={s.addressPage}>
    <Pressable onPress={() => setShowHistory(false)} style={s.addressBackButton} accessibilityRole="button"><Text style={s.addressBackArrow}>→</Text><Text style={s.addressBackText}>عنوان التوصيل</Text></Pressable>
    <View style={s.addressHistoryHero}><View style={s.addressHistoryIcon}><SymbolView name={{ios:'clock.arrow.circlepath',android:'history',web:'history'}} tintColor={c.primary} size={22}/></View><View style={s.addressHistoryCopy}><Text style={s.addressHistoryEyebrow}>عناوين طلباتك السابقة</Text><Text style={s.addressHistoryTitle}>سجل العناوين</Text><Text style={s.addressHistorySubtitle}>راجع تفاصيل العناوين التي استخدمتها في طلباتك.</Text></View><View style={s.addressHistoryCount}><Text style={s.addressHistoryCountNumber}>{historyAddresses.length}</Text><Text style={s.addressHistoryCountLabel}>عنوان</Text></View></View>
    {historyAddresses.length ? historyAddresses.map((address) => <View key={address.id} style={s.historyAddressCard}><View style={s.historyAddressTop}><View style={s.savedPin}><Text style={s.pin}>⌂</Text></View><View style={s.savedCopy}><Text style={s.savedLabel}>{address.label}</Text><Text style={s.savedDetail}>{address.neighborhood}، {address.city}، {address.governorate}</Text></View><Pressable onPress={() => void remove(address.id)} accessibilityRole="button" accessibilityLabel={`حذف ${address.label} من السجل`} style={s.deleteAddress}><Text style={s.deleteText}>حذف</Text></Pressable></View><View style={s.historyAddressDivider}/><Text style={s.historyAddressDetail}>{address.street}{address.building ? `، بناء ${address.building}` : ''}{address.floor ? `، الطابق ${address.floor}` : ''}</Text>{address.landmark ? <Text style={s.historyAddressDetail}>قريب من {address.landmark}</Text> : null}<Text style={s.historyAddressPhone}>للتواصل: {address.contact_phone}</Text></View>) : <View style={s.historyEmpty}><View style={s.historyEmptyIcon}><SymbolView name={{ios:'clock',android:'history',web:'history'}} tintColor={c.primary} size={22}/></View><Text style={s.emptyTitle}>لسه ما عندك عناوين في السجل</Text><Text style={s.emptyCopy}>رح تظهر هون العناوين بعد استخدامها في طلباتك.</Text></View>}
  </View>;

  if (addressLoading) return <View style={s.addressPage}>
    <View style={s.addressPageHeader}><SkeletonBlock width="38%" height={25} /><SkeletonBlock width={112} height={38} style={{ alignSelf: 'auto', borderRadius: 12 }} /></View>
    <SkeletonBlock width="86%" height={12} style={{ marginTop: 10, marginBottom: 18 }} />
    <View style={[s.addressHistoryButton, { justifyContent: 'flex-start' }]}><SkeletonBlock width={42} height={42} style={{ alignSelf: 'auto', borderRadius: 13 }} /><View style={{ flex: 1, gap: 8 }}><SkeletonBlock width="48%" height={12} /><SkeletonBlock width="76%" height={10} /></View></View>
    <View style={[s.formCard, { gap: 13 }]}><SkeletonBlock width="42%" height={18} style={{ marginBottom: 4 }} />{[0, 1, 2, 3, 4, 5].map((item) => <View key={item} style={{ gap: 7 }}><SkeletonBlock width="25%" height={11} /><SkeletonBlock width="100%" height={48} style={{ alignSelf: 'auto', borderRadius: 12 }} /></View>)}</View>
  </View>;

  return <View style={s.addressPage}>
    <View style={s.addressPageHeader}><Text style={s.pageTitle}>عنوان التوصيل</Text><Pressable onPress={onBack} style={s.addressBackButton} accessibilityRole="button"><Text style={s.addressBackArrow}>→</Text><Text style={s.addressBackText}>{backLabel}</Text></Pressable></View>
    <Text style={s.pageDescription}>حدّث العنوان الحالي؛ تفاصيل الطلبات السابقة محفوظة في السجل.</Text>
    <Pressable onPress={() => void openHistory()} style={s.addressHistoryButton} accessibilityRole="button"><View style={s.addressHistoryButtonIcon}><SymbolView name={{ios:'clock.arrow.circlepath',android:'history',web:'history'}} tintColor={c.primary} size={20}/></View><View style={s.addressHistoryButtonCopy}><Text style={s.addressHistoryButtonTitle}>سجل العناوين</Text><Text style={s.addressHistoryButtonHint}>شوف العناوين المستخدمة بطلباتك السابقة</Text></View><View style={s.addressHistoryButtonEnd}><Text style={s.addressHistoryArrow}>←</Text></View></Pressable>
    <View style={s.formCard}><Text style={s.sectionTitle}>{editingAddress ? `تعديل ${editingAddress.label}` : 'أضف عنوان التوصيل'}</Text>
      <Text style={s.label}>المحافظة</Text><View style={s.zoneList}>{['دمشق','ريف دمشق'].map((area) => <Pressable key={area} onPress={() => setManualGovernorate(area)} accessibilityRole="button" accessibilityState={{ selected: manualGovernorate === area }} style={[s.zoneOption, manualGovernorate === area && s.zoneSelected]}><Text style={[s.zoneName, manualGovernorate === area && s.zoneNameSelected]}>{area}</Text></Pressable>)}</View>
      <Text style={s.formLocationHint}>اكتب أي مدينة أو بلدة ضمن دمشق أو ريف دمشق، مثل كناكر، وبعدها الحارة بالتفصيل. ما بدك دبوس خريطة.</Text>
      <Text style={s.label}>المدينة أو البلدة</Text><TextInput value={manualCity} onChangeText={setManualCity} maxLength={100} placeholder="مثلاً: دمشق، كناكر، جرمانا" placeholderTextColor="#839188" textAlign="right" style={s.field} accessibilityLabel="المدينة أو البلدة"/>
      <Text style={s.label}>الحارة</Text><TextInput value={manualNeighborhood} onChangeText={setManualNeighborhood} maxLength={100} placeholder="مثلاً: الحارة الغربية" placeholderTextColor="#839188" textAlign="right" style={s.field} accessibilityLabel="الحارة"/>
      <Text style={s.label}>اسم العنوان</Text><TextInput value={label} onChangeText={setLabel} maxLength={60} placeholder="بيت أبو مالك الجاهوش، الشغل..." placeholderTextColor="#839188" textAlign="right" style={s.field} accessibilityLabel="اسم العنوان"/>
      <Text style={s.label}>الشارع أو رقم البيت</Text><TextInput value={street} onChangeText={setStreet} maxLength={160} placeholder="مثلاً: الحارة الغربية" placeholderTextColor="#839188" textAlign="right" style={s.field} accessibilityLabel="الشارع أو رقم البيت"/>
      <Text style={s.label}>مكان معروف قريب <Text style={s.optional}>اختياري</Text></Text><TextInput value={landmark} onChangeText={setLandmark} maxLength={160} placeholder="مقابل الجامع، جنب الصيدلية..." placeholderTextColor="#839188" textAlign="right" style={s.field} accessibilityLabel="مكان معروف قريب"/>
      <View style={s.inlineFields}><View style={s.inline}><Text style={s.label}>رقم البناء</Text><TextInput value={building} onChangeText={setBuilding} maxLength={80} placeholder="اختياري" placeholderTextColor="#839188" textAlign="right" style={s.field} accessibilityLabel="رقم البناء"/></View><View style={s.inline}><Text style={s.label}>الطابق</Text><TextInput value={floor} onChangeText={setFloor} maxLength={40} placeholder="اختياري" placeholderTextColor="#839188" textAlign="right" style={s.field} accessibilityLabel="الطابق"/></View></View>
      <Text style={s.label}>رقم اتصال أو واتساب</Text><TextInput value={contactPhone} onChangeText={setContactPhone} maxLength={24} keyboardType="phone-pad" textAlign="left" placeholder="+963 ..." placeholderTextColor="#839188" style={s.field} accessibilityLabel="رقم اتصال أو واتساب"/>
      <Pressable disabled={busy || addressLoading} onPress={() => void save()} style={[s.saveAddress,(busy || addressLoading)&&s.disabled]} accessibilityRole="button"><Text style={s.saveAddressText}>{addressLoading?'عم نحمّل عنوانك…':busy?'عم نحفظ…':editingAddress?'حفظ التعديلات':'حفظ العنوان'} <Text style={s.submitArrow}>←</Text></Text></Pressable>
    </View>
  </View>;
}

const notificationKind = (title: string) => /عرض|توصيل جديد/.test(title) ? 'offer' : /تسوية|عمولة|رصيد|محفظة/.test(title) ? 'money' : 'update';
const notificationIcons = { offer: { ios: 'bolt.fill', android: 'bolt', web: 'bolt' }, money: { ios: 'banknote.fill', android: 'payments', web: 'payments' }, update: { ios: 'cube.fill', android: 'deployed_code', web: 'deployed_code' } } as const;
const notificationKindLabels = { offer: 'عرض توصيل', money: 'تسوية', update: 'تحديث على الطلب' } as const;
const notificationFilters = [{ key: 'all', label: 'الكل' }, { key: 'unread', label: 'غير مقروءة' }] as const;
const notificationTimeFormatter = new Intl.DateTimeFormat('ar-SY', { hour: 'numeric', minute: '2-digit' });
const notificationDateFormatter = new Intl.DateTimeFormat('ar-SY', { day: 'numeric', month: 'long' });
function formatNotificationTime(iso: string) {
  const date = new Date(iso); const now = new Date();
  const dayStart = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((dayStart(now) - dayStart(date)) / 86400000);
  const time = notificationTimeFormatter.format(date);
  return (days <= 0 ? 'اليوم' : days === 1 ? 'أمس' : notificationDateFormatter.format(date)) + ' · ' + time;
}

function NotificationInbox({ userId, refreshKey = 0, onOpenOrder, standalone = false, onUnreadCountChange }: { userId: string; refreshKey?: number; onOpenOrder?: (orderId: string) => void; standalone?: boolean; onUnreadCountChange?: (count: number) => void }) {
  const { colors: c, styles: s } = useMobileTheme();
  const network = useNetworkState();
  const online = useInternetAvailable();
  type Notification = Pick<Database['public']['Tables']['notifications']['Row'],'id'|'title'|'body'|'created_at'|'read_at'|'order_id'>
  const [items,setItems]=useState<Notification[]>([]); const [message,setMessage]=useToastMessage(); const [loadingState,setLoadingState]=useState(true); const [expanded,setExpanded]=useState(standalone); const [loadingMore,setLoadingMore]=useState(false); const [hasMore,setHasMore]=useState(false); const [unreadCount,setUnreadCount]=useState(0)
  const [filter,setFilter]=useState<'all'|'unread'>('all'); const [sheet,setSheet]=useState<Notification|null>(null); const [markingAllRead,setMarkingAllRead]=useState(false); const openOrderRef=useRef(onOpenOrder)
  useEffect(()=>{openOrderRef.current=onOpenOrder},[onOpenOrder])
  useEffect(()=>{
    let subscription:{remove:()=>void}|undefined
    if(Platform.OS!=='web')void import('expo-notifications').then(Notifications=>{
        Notifications.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false})})
        const handleResponse=(response:NotificationResponse)=>{
          const orderId=response.notification.request.content.data?.orderId
          if(typeof orderId==='string')openOrderRef.current?.(orderId)
        }
        const lastResponse=Notifications.getLastNotificationResponse()
        if(lastResponse)handleResponse(lastResponse)
        subscription=Notifications.addNotificationResponseReceivedListener(handleResponse)
      }).catch(()=>undefined)
    void hasRegisteredPushToken(userId).then(registered=>{
      if(registered&&Platform.OS!=='web')void enablePushNotifications(userId,false)
    })
    return()=>subscription?.remove()
  },[userId])
  const networkResolved=typeof network.isConnected==='boolean';
  const loading=loadingState&&(online||!networkResolved);
  const refresh=useCallback(async()=>{
    if(!supabase || !online)return
    const pageSize=standalone?20:12
    const [{data,error},{count:unread,error:countError}]=await Promise.all([
      supabase.from('notifications').select('id,title,body,created_at,read_at,order_id').order('created_at',{ascending:false}).limit(pageSize),
      supabase.from('notifications').select('id',{count:'exact',head:true}).is('read_at',null),
    ])
    if(error)setMessage('ما قدرنا نحمّل التنبيهات.')
    else {setItems(data??[]);setHasMore((data??[]).length===pageSize);setMessage('')}
    if(!countError)setUnreadCount(unread??0)
    setLoadingState(false)
  },[online,setMessage,standalone]);
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  useEffect(() => { if (refreshKey > 0) void refreshRef.current(); }, [refreshKey]);
  useEffect(() => {
    if (online) setLoadingState(true);
    void refreshRef.current();
    if (!supabase || !online) return;
    // Unique per subscription so route switches or reconnects cannot reuse a channel during asynchronous removal.
    const channel = supabase.channel(`user-notifications-${userId}-${newRequestKey()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, () => { void refreshRef.current(); })
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [online, userId]);
  const markRead=async(id:number)=>{
    if(!supabase)return
    const {error}=await supabase.rpc('mark_notification_read',{p_notification_id:id})
    if(error){setMessage('ما قدرنا نحدّث حالة التنبيه.');return}
    setItems(current=>current.map(item=>item.id===id?{...item,read_at:new Date().toISOString()}:item));setUnreadCount(current=>Math.max(0,current-1))
  }
  const markAllRead=async()=>{
    if(!supabase||!online||markingAllRead||unreadCount===0)return
    setMarkingAllRead(true);setMessage('')
    const {error}=await supabase.rpc('mark_all_notifications_read')
    if(error)setMessage('ما قدرنا نحدّث حالة التنبيهات. حاول مرة ثانية.')
    else {const readAt=new Date().toISOString();setItems(current=>current.map(item=>item.read_at?item:{...item,read_at:readAt}));setUnreadCount(0);setMessage('تم تحديد كل التنبيهات كمقروءة.')}
    setMarkingAllRead(false)
  }
  useEffect(()=>{onUnreadCountChange?.(unreadCount)},[onUnreadCountChange,unreadCount])
  const loadMore=async()=>{
    if(!supabase||!online||loadingMore||!hasMore)return
    setLoadingMore(true)
    const start=items.length
    const {data,error}=await supabase.from('notifications').select('id,title,body,created_at,read_at,order_id').order('created_at',{ascending:false}).range(start,start+19)
    if(error)setMessage('ما قدرنا نحمّل التنبيهات الأقدم.')
    else {const more=data??[];setItems(current=>{const seen=new Set(current.map(item=>item.id));return [...current,...more.filter(item=>!seen.has(item.id))]});setHasMore((data??[]).length===20)}
    setLoadingMore(false)
  }
  return <View style={[s.notificationCard,standalone&&s.notificationCardStandalone]}>
    {standalone&&<View style={s.nChips}>
      {notificationFilters.map(f=>{const count=f.key==='all'?items.length:items.filter(i=>!i.read_at).length;const on=filter===f.key;return <Pressable key={f.key} onPress={()=>setFilter(f.key)} accessibilityRole="button" accessibilityState={{selected:on}} style={[s.nChip,on&&s.nChipOn]}><Text style={[s.nChipText,on&&s.nChipTextOn]}>{f.label}</Text>{!loading&&<Text style={[s.nChipText,on&&s.nChipTextOn]}>{count}</Text>}</Pressable>})}
      {unreadCount>0&&<Pressable onPress={()=>void markAllRead()} disabled={markingAllRead||!online} accessibilityRole="button" accessibilityLabel="تحديد كل التنبيهات كمقروءة" style={[s.nChip,s.nChipAction,(markingAllRead||!online)&&{opacity:0.6}]}><SymbolView name={{ios:'checkmark.circle.fill',android:'mark_email_read',web:'mark_email_read'}} tintColor={c.primary} size={16}/><Text style={s.nChipActionText}>{markingAllRead?'لحظة…':'قراءة الكل'}</Text></Pressable>}
    </View>}
    {!standalone&&<View style={s.notificationHeader}>
      <Pressable disabled={standalone} onPress={()=>setExpanded(value=>!value)} accessibilityRole={standalone?'summary':'button'} accessibilityState={{expanded}} style={[s.notificationSummary,standalone&&s.notificationSummaryStandalone]}>
        <View style={s.notificationIcon}><SymbolView name={{ios:unreadCount?'bell.badge.fill':'bell.fill',android:unreadCount?'notifications_active':'notifications',web:unreadCount?'notifications_active':'notifications'}} tintColor={c.primary} size={19}/></View>
        <View style={s.notificationCopy}>
          <Text style={s.notificationTitle}>{standalone?'تنبيهات السائق':'التنبيهات'}</Text>
          <Text style={s.notificationSubtitle}>{loading?'عم نحمّل آخر التحديثات':unreadCount?`عندك ${unreadCount} تنبيه غير مقروء`:'ما في تنبيهات جديدة'}</Text>
        </View>
        <View style={s.notificationCount}>{loading ? <SkeletonBlock width={15} height={14} style={{ alignSelf: 'auto' }} /> : <Text style={s.notificationCountText}>{unreadCount}</Text>}</View>
        {!standalone&&<View style={s.notificationExpandIcon}><SymbolView name={{ios:expanded?'chevron.up':'chevron.down',android:expanded?'expand_less':'expand_more',web:expanded?'expand_less':'expand_more'}} tintColor={c.muted} size={18}/></View>}
      </Pressable>
    </View>}
    {message?<Text accessibilityRole="alert" style={s.formMessage}>{message}</Text>:null}
    {false?<Pressable onPress={()=>void markAllRead()} disabled={markingAllRead||!online} accessibilityRole="button" style={[s.notificationMarkAll,s.notificationMarkAllStandalone,(markingAllRead||!online)&&{opacity:0.6}]}><SymbolView name={{ios:'checkmark.circle.fill',android:'mark_email_read',web:'mark_email_read'}} tintColor="#17210F" size={18}/><Text style={[s.notificationMarkAllText,s.notificationMarkAllStandaloneText]}>{markingAllRead?'عم نحدّث التنبيهات…':'تحديد الكل كمقروء'}</Text></Pressable>:null}
    {(expanded||standalone) && <View style={[s.notificationList,standalone&&s.notificationListStandalone]}>
      {standalone&&!loading&&items.length>0&&!items.some(i=>filter==='all'||!i.read_at)&&<Text style={s.notificationEmpty}>كل تنبيهاتك مقروءة.</Text>}
      {loading?<NotificationsSkeleton standalone={standalone}/>:items.length?(standalone?items.filter(i=>filter==='all'||!i.read_at):items).map(item=>standalone?<Pressable key={item.id} onPress={()=>{setSheet(item);if(!item.read_at)void markRead(item.id)}} accessibilityRole="button" accessibilityLabel={item.title+', '+item.body+(item.read_at?'، مقروء':'، جديد')} style={[s.nCard,!item.read_at?s.nCardUnread:s.nCardRead]}>
        {!item.read_at&&<View style={s.nAccent}/>}
        <View style={s.nTop}>
          <View style={[s.nTile,!item.read_at&&s.nTileUnread]}><SymbolView name={notificationIcons[notificationKind(item.title)]} tintColor={c.primary} size={24}/></View>
          <View style={s.nMain}>
            <View style={s.nTitleRow}><Text style={s.nTitle}>{item.title}</Text>{item.read_at?<Text style={s.nReadLabel}>مقروء</Text>:<View style={s.nNewBadge}><View style={s.nNewDot}/><Text style={s.nNewText}>جديد</Text></View>}</View>
            <Text style={s.nBody}>{item.body}</Text>
          </View>
        </View>
        <View style={s.nDivider}/>
        <View style={s.nFooter}>
          {item.order_id?<View style={s.nOrderChip}><Text style={s.nOrderLabel}>طلب</Text><Text style={s.nOrderCode}>{'#'+item.order_id.slice(0,8)}</Text></View>:<View/>}
          <View style={s.nDateRow}><SymbolView name={{ios:'chevron.left',android:'chevron_left',web:'chevron_left'}} tintColor={c.muted} size={14}/><Text style={s.nDate}>{formatNotificationTime(item.created_at)}</Text></View>
        </View>
      </Pressable>:<Pressable key={item.id} onPress={()=>{if(!item.read_at)void markRead(item.id);if(item.order_id)openOrderRef.current?.(item.order_id)}} accessibilityRole="button" accessibilityLabel={item.title+', '+item.body+(item.read_at?'، مقروء':'، جديد')} style={[s.notificationItem,standalone&&s.notificationItemStandalone,standalone&&!item.read_at&&s.notificationItemUnread,standalone&&!!item.read_at&&s.notifItemReadStandalone,!standalone&&item.read_at&&s.notificationItemRead]}>
        {standalone?<View style={[s.notifTile,!item.read_at&&s.notifTileUnread]}><SymbolView name={notificationIcons[notificationKind(item.title)]} tintColor={item.read_at?c.muted:'#0B1411'} size={20}/></View>:<View style={[s.notificationDot,item.read_at&&s.notificationDotRead]}/>}
        <View style={[s.notificationItemCopy,standalone&&s.notificationItemCopyStandalone]}>
          <View style={s.notificationItemHeading}><Text style={[s.notificationItemTitle,standalone&&s.notificationItemTitleStandalone]}>{item.title}</Text>{!item.read_at&&!standalone&&<View style={s.notificationUnreadPill}><Text style={s.notificationUnreadPillText}>جديد</Text></View>}</View>
          <Text style={[s.notificationItemBody,standalone&&s.notificationItemBodyStandalone]}>{item.body}</Text>
          {standalone?<View style={s.notifMetaRow}><Text style={s.notifTime}>{formatNotificationTime(item.created_at)}</Text>{item.order_id?<View style={s.notifOrderChip}><Text style={s.notifOrderChipLabel}>طلب</Text><Text style={s.notifOrderChipCode}>{'#'+item.order_id.slice(0,6)}</Text></View>:null}</View>:<Text style={[s.notificationItemMeta,standalone&&s.notificationItemMetaStandalone]}>{item.order_id?'طلب #'+item.order_id.slice(0,8)+' · ':''}{shortDateTimeFormatter.format(new Date(item.created_at))}</Text>}
        </View>
      </Pressable>):!online?<Text style={s.notificationEmpty}>اتصل بالإنترنت حتى نحمّل التنبيهات.</Text>:message?<Text style={s.notificationEmpty}>ما قدرنا نحمّل التنبيهات. جرّب تحديث الصفحة.</Text>:<Text style={s.notificationEmpty}>ما في تنبيهات جديدة.</Text>}
      {standalone&&hasMore&&<Pressable onPress={()=>void loadMore()} disabled={loadingMore||!online} style={s.notificationLoadMore} accessibilityRole="button"><Text style={s.notificationLoadMoreText}>{loadingMore?'عم نحمّل…':'تحميل تنبيهات أقدم'}</Text></Pressable>}
    </View>}
    {standalone&&<Modal visible={!!sheet} transparent animationType="slide" onRequestClose={()=>setSheet(null)}>
      <Pressable style={s.sheetBackdrop} onPress={()=>setSheet(null)} accessibilityLabel="إغلاق"><Pressable style={s.sheet} onPress={()=>{}}>
        {sheet&&<>
        <View style={s.sheetHandle}/>
        <View style={s.sheetHead}>
          <View style={[s.nTile,s.nTileUnread]}><SymbolView name={notificationIcons[notificationKind(sheet.title)]} tintColor={c.primary} size={24}/></View>
          <View style={{flex:1,minWidth:0}}><Text style={s.sheetKicker}>{notificationKindLabels[notificationKind(sheet.title)]}</Text><Text style={s.sheetTitle}>{sheet.title}</Text></View>
          <Pressable onPress={()=>setSheet(null)} style={s.sheetClose} accessibilityRole="button" accessibilityLabel="إغلاق"><SymbolView name={{ios:'xmark',android:'close',web:'close'}} tintColor={c.muted} size={16}/></Pressable>
        </View>
        <View style={s.sheetBox}>
          <Text style={s.sheetBody}>{sheet.body}</Text>
          <View style={s.nDivider}/>
          <View style={s.nFooter}>{sheet.order_id?<View style={s.nOrderChip}><Text style={s.nOrderLabel}>رقم الطلب:</Text><Text style={s.nOrderCode}>{'#'+sheet.order_id.slice(0,8)}</Text></View>:<View/>}<Text style={s.nDate}>{formatNotificationTime(sheet.created_at)}</Text></View>
        </View>
        {sheet.order_id&&<Pressable onPress={()=>{const id=sheet.order_id;setSheet(null);if(id)openOrderRef.current?.(id)}} style={s.sheetCta} accessibilityRole="button"><Text style={s.sheetCtaText}>فتح تفاصيل الطلب</Text><SymbolView name={{ios:'arrow.left',android:'arrow_back',web:'arrow_back'}} tintColor="#0B1411" size={18}/></Pressable>}
        </>}
      </Pressable></Pressable>
    </Modal>}
  </View>
}

function SupportIssueForm({orderId,status,disabled=false}:{orderId:string;status:string;disabled?:boolean}) {
  const { styles: s } = useMobileTheme();
  const online = useInternetAvailable();
  const [expanded,setExpanded]=useState(false);const [reason,setReason]=useState('');const [details,setDetails]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useToastMessage();const [idempotencyKey]=useState(newRequestKey());const [submitted,setSubmitted]=useState(false)
  const submit=async()=>{
    if(!supabase)return
    if(disabled || !online){setMessage('إرسال البلاغ يحتاج اتصالاً مؤكداً بالخادم. تفاصيلك ما زالت على هالجهاز.');return}
    if(!reason||details.trim().length<5){setMessage('اختار نوع المشكلة واكتب تفاصيل أكثر.');return}
    setBusy(true);setMessage('')
    const {error}=await supabase.rpc('open_order_dispute',{p_order_id:orderId,p_reason:reason,p_details:details.trim(),p_idempotency_key:idempotencyKey})
    setBusy(false)
    if(error){setMessage(error.message.includes('active')?'في بلاغ مفتوح على هالطلب. تواصل مع الدعم من التنبيهات.':'ما قدرنا نسجل البلاغ. أعد المحاولة بنفس التفاصيل.');return}
    setSubmitted(true);setMessage('وصل البلاغ لفريق لَبّيك، والطلب صار قيد المراجعة.')
  }
  if(status==='disputed')return <Text accessibilityRole="status" style={s.offerExpiry}>بلاغك قيد مراجعة فريق الدعم. تابع التنبيهات للمستجدات.</Text>
  if(!['accepted','assigned','shopping','awaiting_approval','purchased','delivering','delivered','settled'].includes(status)) return null
  return <View style={{marginTop:10}}>{submitted?<Text accessibilityRole="status" style={s.offerExpiry}>{message}</Text>:!expanded?<Pressable onPress={()=>setExpanded(true)} accessibilityRole="button" style={{minHeight:44,alignSelf:"flex-start",justifyContent:"center",paddingVertical:8}}><Text style={s.orderFee}>في مشكلة بهالطلب؟ تواصل مع الدعم</Text></Pressable>:<View style={s.dropoff}><Text style={s.dropoffTitle}>إرسال بلاغ للدعم</Text><View style={s.zoneList}>{['مشكلة بالمشتريات','تأخير أو مشكلة بالتوصيل','مبلغ أو تحصيل غير صحيح','مشكلة ثانية'].map(item=><Pressable key={item} onPress={()=>setReason(item)} accessibilityRole="button" accessibilityState={{selected:reason===item}} style={[s.zoneOption,reason===item&&s.zoneSelected]}><Text style={[s.zoneName,reason===item&&s.zoneNameSelected]}>{item}</Text></Pressable>)}</View><TextInput value={details} onChangeText={setDetails} multiline textAlignVertical="top" maxLength={2000} placeholder="اشرح المشكلة لفريق الدعم" placeholderTextColor="#839188" style={[s.field,{minHeight:85}]} accessibilityLabel="تفاصيل المشكلة"/><Pressable disabled={busy || !online || disabled} onPress={()=>void submit()} style={[s.acceptOffer,(busy || !online || disabled)&&s.disabled]} accessibilityRole="button"><Text style={s.acceptOfferText}>{busy?'عم نرسل البلاغ…':online && !disabled?'إرسال البلاغ':'بانتظار الاتصال'}</Text></Pressable><Pressable onPress={()=>{setExpanded(false);setMessage('')}} accessibilityRole="button" style={{minHeight:44,alignSelf:"flex-start",justifyContent:"center",paddingVertical:8}}><Text style={s.offerExpiry}>إغلاق</Text></Pressable>{message?<Text accessibilityRole="alert" style={s.formMessage}>{message}</Text>:null}</View>}</View>
}

function OfferCountdown({ expiresAt }: { expiresAt: string }) {
  const { colors: c, styles: s } = useMobileTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(id); }, []);
  const left = Math.max(0, new Date(expiresAt).getTime() - now);
  const minutes = Math.ceil(left / 60000);
  const ratio = Math.min(1, left / 600000);
  return <View style={s.offerTimerWrap} accessibilityRole="progressbar" accessibilityLabel={left ? `باقي ${minutes} دقيقة على انتهاء العرض` : 'انتهى العرض'}>
    <View style={s.offerTimerTrack}><View style={[s.offerTimerFill, { width: `${Math.round(ratio * 100)}%` }, ratio < 0.25 && { backgroundColor: c.danger }]}/></View>
    <Text style={s.offerTimerText}>{left ? `باقي ${minutes} دقيقة · ينتهي ${shortTimeFormatter.format(new Date(expiresAt))}` : 'انتهت مهلة العرض'}</Text>
  </View>;
}

function RadarRings({ active }: { active: boolean }) {
  const { colors: c } = useMobileTheme();
  const [rings] = useState(() => [new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]);
  useEffect(() => {
    if (!active) { rings.forEach((ring) => ring.setValue(0)); return; }
    const loops = rings.map((ring, index) => Animated.loop(Animated.sequence([
      Animated.delay(index * 1000),
      Animated.timing(ring, { toValue: 1, duration: 3000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(ring, { toValue: 0, duration: 0, useNativeDriver: true }),
      Animated.delay((2 - index) * 1000),
    ])));
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [active, rings]);
  if (!active) return null;
  return <>{rings.map((ring, index) => <Animated.View key={index} pointerEvents="none" style={{ position: 'absolute', width: 150, height: 150, borderRadius: 75, borderWidth: 2, borderColor: c.primary, opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }), transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }] }} />)}</>;
}

function DriverOperationsSkeleton({ screen }: { screen: 'home' | 'orders' }) {
  const { colors: c } = useMobileTheme();
  if (screen === 'home') return <View accessibilityRole="progressbar" accessibilityLabel="تحميل الصفحة الرئيسية للسائق" style={{ gap: 14, marginTop: 10 }}>
    <View style={{ height: 290, alignItems: 'center', justifyContent: 'center' }}>{sk(150, 150, { borderRadius: 75 })}</View>
    <View style={{ alignItems: 'center', gap: 9 }}>{sk('46%', 20)}{sk('62%', 12)}</View>
    <View style={{ flexDirection: 'row-reverse', gap: 9 }}>{[0, 1, 2].map((item) => <SkeletonCard key={item} style={{ flex: 1, padding: 12, alignItems: 'center', gap: 8 }}>{sk(40, 26)}{sk('70%', 11)}</SkeletonCard>)}</View>
    <SkeletonCard style={{ gap: 12 }}>{sk('42%', 12, { alignSelf: 'flex-end' })}<View style={[skRow, { justifyContent: 'space-between' }]}>{sk('52%', 16)}{sk(90, 22)}</View>{sk('100%', 5)}{sk('100%', 46, { borderRadius: 15 })}</SkeletonCard>
  </View>;
  return <View accessibilityRole="progressbar" accessibilityLabel="تحميل الطلبات" style={{ gap: 12, marginTop: 8 }}>
    <View style={{ flexDirection: 'row-reverse', gap: 6, padding: 6, borderRadius: 22, borderWidth: 1, borderColor: c.border, backgroundColor: c.raised }}>{[0, 1].map((item) => <SkeletonBlock key={item} width="48%" height={54} style={{ alignSelf: 'auto', flex: 1, borderRadius: 17 }} />)}</View>
    <View style={[skRow, { justifyContent: 'space-between' }]}>{sk('36%', 20)}{sk(92, 36, { borderRadius: 18 })}</View>
    {[0, 1].map((item) => <SkeletonCard key={item} style={{ gap: 14 }}>
      <View style={[skRow, { justifyContent: 'space-between' }]}>{sk(84, 30, { borderRadius: 12 })}{sk(104, 38)}</View>
      <View style={{ gap: 9, alignItems: 'flex-end' }}>{sk('94%', 12)}{sk('72%', 12)}</View>
      <View style={{ gap: 9, alignItems: 'flex-end', paddingRight: 12 }}>{sk('46%', 12)}{sk('58%', 11)}</View>
      {sk('100%', 5)}
      <View style={{ flexDirection: 'row-reverse', gap: 9 }}><SkeletonBlock width="48%" height={50} style={{ alignSelf: 'auto', flex: 1.5, borderRadius: 15 }} /><SkeletonBlock width="48%" height={50} style={{ alignSelf: 'auto', flex: 1, borderRadius: 15 }} /></View>
    </SkeletonCard>)}
  </View>;
}

function DriverOperations({ userId, screen = 'orders', profileComplete = true, onCompleteProfile = () => {}, onOpenOrders = () => {} }: { userId: string; screen?: 'home' | 'orders'; profileComplete?: boolean; onCompleteProfile?: () => void; onOpenOrders?: () => void }) {
  const { colors: c, styles: s } = useMobileTheme();
  const online = useInternetAvailable();
  const [profile, setProfile] = useState<{ is_online: boolean }>({ is_online: false });
  const [offers, setOffers] = useState<DriverOfferCard[]>([]);
  const [activeOrders, setActiveOrders] = useState<DriverActiveOrder[]>([]);
  const [offersCount, setOffersCount] = useState(0);
  const [activeOrdersCount, setActiveOrdersCount] = useState(0);
  const [orderSection, setOrderSection] = useState<'offers' | 'active'>('offers');
  const [dismissedOfferId, setDismissedOfferId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [refreshToastPending, setRefreshToastPending] = useState(false);
  const [operationsAreStale, setOperationsAreStale] = useState(false);
  const [ordersSyncedAt, setOrdersSyncedAt] = useState('');
  const [purchaseDrafts, setPurchaseDrafts] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [, setMessage] = useToastMessage();
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletUnavailable, setWalletUnavailable] = useState(false);
  const [loadedScreen, setLoadedScreen] = useState<'home' | 'orders' | null>(null);
  const pageLoading = loading || loadedScreen !== screen;
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelTopic = useRef(`driver-orders-${userId}-${newRequestKey()}`);
  const refresh = useCallback(async () => {
    if (!supabase) { setOperationsAreStale(true); setLoadedScreen(screen); setLoading(false); return; }
    try {
    const cachedSnapshot = await loadDriverOrdersSnapshot(userId);
    if (cachedSnapshot) {
      setActiveOrders(cachedSnapshot.orders);
      setActiveOrdersCount(cachedSnapshot.orders.length);
      setOrdersSyncedAt(cachedSnapshot.syncedAt);
      // Keep cached orders visible while refreshing, but don't flash the offline
      // warning during a normal online refresh. Set it only if sync fails below.
      if (!online) setOperationsAreStale(true);
    }
    if (!online) {
      if (!cachedSnapshot) setActiveOrders([]);
      setOperationsAreStale(true); setLoading(false); return;
    }
    const [driver, wallet] = await Promise.all([
      supabase.from('driver_profiles').select('is_online').eq('user_id', userId).single(),
      supabase.rpc('get_driver_wallet_balances'),
    ]);
    const { data: walletRows, error: walletError } = wallet;
    if (!walletError) { setWalletBalance(walletRows?.find((row) => row.driver_id === userId)?.balance_minor ?? 0); setWalletUnavailable(false); }
    else { setWalletBalance(null); setWalletUnavailable(true); }
    if (driver.data) setProfile(driver.data);
    if (screen === 'home') {
      const [offerCountResult, activeCountResult] = await Promise.all([
        supabase.from('order_offers').select('id', { count: 'exact', head: true }).eq('driver_id', userId).eq('status', 'pending').gt('expires_at', new Date().toISOString()),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('driver_id', userId).neq('status', 'delivered').neq('status', 'settled').neq('status', 'cancelled'),
      ]);
      if (!offerCountResult.error) setOffersCount(offerCountResult.count ?? 0);
      if (!activeCountResult.error) setActiveOrdersCount(activeCountResult.count ?? 0);
      const syncFailed = !!driver.error || !!offerCountResult.error || !!activeCountResult.error;
      setOperationsAreStale(syncFailed);
      if (!syncFailed) setMessage('');
      return;
    }
    const [offerRows, assigned] = await Promise.all([
      supabase.from('order_offers').select('id,order_id,expires_at').eq('driver_id', userId).eq('status', 'pending').gt('expires_at', new Date().toISOString()).order('expires_at'),
      supabase.from('orders').select('id,status,category,request_text,delivery_fee_minor,budget_ceiling_minor,purchase_amount_minor,purchase_approved_at,created_at,address_id').eq('driver_id', userId).neq('status', 'delivered').neq('status', 'settled').neq('status', 'cancelled').order('created_at', { ascending: false }),
    ]);
    const [addressResult, offerOrderResult] = await Promise.all([
      assigned.data?.length
        ? supabase.from('addresses').select('id,label,street,city,neighborhood,contact_phone,building,landmark').in('id', assigned.data.map((order) => order.address_id).filter((id): id is string => id !== null))
        : Promise.resolve(null),
      offerRows.data?.length
        ? supabase.from('orders').select('id,status,category,request_text,delivery_fee_minor,budget_ceiling_minor,address_id').in('id', offerRows.data.map((offer) => offer.order_id))
        : Promise.resolve(null),
    ]);
    const offerAddressResult = offerOrderResult?.data?.length
      ? await supabase.from('addresses').select('id,label,street,city,neighborhood,building,landmark').in('id', offerOrderResult.data.map((order) => order.address_id).filter((id): id is string => id !== null))
      : null;
    let addressError = false;
    if (offerAddressResult?.error) addressError = true;
    let currentOrders: DriverActiveOrder[] | null = null;
    if (assigned.error) addressError = true;
    else if (assigned.data?.length) {
      const { data: addressRows, error } = addressResult!;
      if (error) addressError = true;
      else {
        const addressMap = new Map((addressRows ?? []).map((address) => [address.id, address]));
        currentOrders = assigned.data.map((order) => ({ ...order, address: order.address_id ? addressMap.get(order.address_id) ?? null : null }));
      }
    } else currentOrders = [];
    if (currentOrders) {
      setActiveOrders(currentOrders);
      setActiveOrdersCount(currentOrders.length);
      void saveDriverOrdersSnapshot(userId, currentOrders).then((snapshot) => setOrdersSyncedAt(snapshot.syncedAt)).catch(() => {});
    }
    if (offerRows.data?.length) {
      const { data: orderRows, error } = offerOrderResult!;
      if (!error) {
        const orderMap = new Map((orderRows ?? []).map((order) => [order.id, order]));
        const addressMap = new Map((offerAddressResult?.data ?? []).map((address) => [address.id, address]));
        setOffers(offerRows.data.flatMap((offer) => { const order = orderMap.get(offer.order_id); return order ? [{ id: offer.id, expires_at: offer.expires_at, order: { ...order, address: order.address_id ? addressMap.get(order.address_id) ?? null : null } }] : []; }));
        setOffersCount(offerRows.data.length);
      }
    } else if (!offerRows.error) { setOffers([]); setOffersCount(0); }
    const syncFailed = !!driver.error || !!offerRows.error || !!assigned.error || addressError || !!offerOrderResult?.error;
    setOperationsAreStale(syncFailed);
    if (!syncFailed) setMessage('');
    if (syncFailed && !currentOrders && cachedSnapshot) setActiveOrders(cachedSnapshot.orders);
    } catch {
      setOperationsAreStale(true);
    } finally {
      setLoadedScreen(screen);
      setLoading(false);
    }
  }, [online, screen, userId, setMessage]);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => { refreshTimer.current = null; void refresh(); }, 250);
  }, [refresh]);
  useEffect(() => () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); }, []);
  // Initial load and realtime refresh are server synchronization, not derived render state.
  useEffect(() => { setLoading(true); void refresh(); }, [refresh]);
  const manualRefresh = async () => {
    if (busy || refreshing) return;
    if (!online) { setMessage('التحديث يحتاج اتصالاً بالإنترنت.'); return; }
    setRefreshing(true); setLoading(true);
    await refresh();
    setRefreshing(false); setRefreshToastPending(true);
  };
  useEffect(() => {
    if (!refreshToastPending || loading || refreshing) return;
    setRefreshToastPending(false);
    setMessage(operationsAreStale ? 'ما قدرنا نحدّث الطلبات. جرّب مرة ثانية.' : 'تم تحديث الطلبات.');
  }, [refreshToastPending, loading, refreshing, operationsAreStale, setMessage]);
  useEffect(() => {
    if (!supabase || !online) return;
    const channel = supabase.channel(channelTopic.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_offers', filter: `driver_id=eq.${userId}` }, scheduleRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_events' }, scheduleRefresh)
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [online, scheduleRefresh, userId]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') scheduleRefresh();
    });
    return () => subscription.remove();
  }, [scheduleRefresh]);
  const setAvailability = async (is_online: boolean) => {
    if (!profileComplete) { setMessage('أكمل ملفك الشخصي أولاً حتى تقدر تستقبل الطلبات.'); onCompleteProfile(); return; }
    if (!supabase || !online || operationsAreStale) { setMessage('هالإجراء يحتاج اتصالاً بالخادم. تأكد من الإنترنت وحدّث الصفحة.'); return; }
    setBusy(true); setMessage('');
    const { error } = await supabase.from('driver_profiles').update({ is_online }).eq('user_id', userId);
    setBusy(false);
    if (error) { setMessage('ما قدرنا نحدّث التوفر. حاول مرة ثانية.'); return; }
    setProfile({ is_online });
    setMessage(is_online ? 'تم تفعيل استقبال الطلبات. العروض الجديدة توصلك فوراً.' : 'تم إيقاف استقبال الطلبات.');
  };
  const accept = async (offerId: string) => {
    if (!supabase || !online || operationsAreStale) { setMessage('هالإجراء يحتاج اتصالاً بالخادم. تأكد من الإنترنت وحدّث الصفحة.'); return; }
    setBusy(true); setMessage('');
    const { error } = await supabase.rpc('accept_order_offer', { p_offer_id: offerId });
    setBusy(false);
    if (error) { setMessage('العرض انتهى أو قبله سائق تاني. حدّث القائمة.'); await refresh(); return; }
    setMessage('تم قبول الطلب من السيرفر.'); await refresh();
  };
  const decline = async (offerId: string) => {
    if (!supabase || !online || operationsAreStale) { setMessage('هالإجراء يحتاج اتصالاً بالخادم. تأكد من الإنترنت وحدّث الصفحة.'); return; }
    setBusy(true); setMessage('');
    const { error } = await supabase.rpc('decline_order_offer', { p_offer_id: offerId });
    setBusy(false);
    if (error) { setMessage('انتهى العرض أو ما عاد متاح. حدّث القائمة.'); await refresh(); return; }
    setMessage('اعتذرت عن العرض.'); await refresh();
  };
  const startShopping = async (orderId: string) => {
    if (!supabase || !online || operationsAreStale) { setMessage('هالإجراء يحتاج اتصالاً بالخادم. تأكد من الإنترنت وحدّث الصفحة.'); return; }
    setBusy(true); setMessage('');
    const { error } = await supabase.rpc('start_order_shopping', { p_order_id: orderId });
    setBusy(false);
    if (error) { setMessage('ما قدرنا نبدأ التسوق. حدّث حالة الطلب وحاول مرة ثانية.'); return; }
    setMessage('تم تأكيد بدء التسوق.'); await refresh();
  };
  const recordPurchase = async (orderId: string) => {
    if (!supabase || !online || operationsAreStale) { setMessage('هالإجراء يحتاج اتصالاً بالخادم. تأكد من الإنترنت وحدّث الصفحة.'); return; }
    const amount = Number(purchaseDrafts[orderId]);
    if (!Number.isSafeInteger(amount) || amount < 0) { setMessage('أدخل قيمة المشتريات بالليرة السورية كرقم صحيح.'); return; }
    setBusy(true); setMessage('');
    const { error } = await supabase.rpc('record_order_purchase', { p_order_id: orderId, p_purchase_amount_minor: amount });
    setBusy(false);
    if (error) { setMessage('ما قدرنا نسجل المشتريات. تأكد من حالة الطلب.'); return; }
    setMessage('انسجل المبلغ. اشتري الأغراض وبعدها أكد إتمام الشراء. إذا بدك تستفسر من الزبون اتصل فيه.');
    await refresh();
  };
  const confirmPurchase = async (orderId: string) => {
    if (!supabase || !online || operationsAreStale) { setMessage('هالإجراء يحتاج اتصالاً بالخادم. تأكد من الإنترنت وحدّث الصفحة.'); return; }
    setBusy(true); setMessage('');
    const { error } = await supabase.rpc('confirm_order_purchase', { p_order_id: orderId });
    setBusy(false);
    if (error) { setMessage('ما قدرنا نأكد الشراء. إذا المبلغ فوق الميزانية لازم موافقة الزبون أولاً.'); return; }
    setMessage('تأكد شراء الأغراض من السيرفر.'); await refresh();
  };
  const startDelivery = async (orderId: string) => {
    if (!supabase || !online || operationsAreStale) { setMessage('هالإجراء يحتاج اتصالاً بالخادم. تأكد من الإنترنت وحدّث الصفحة.'); return; }
    setBusy(true); setMessage('');
    const { error } = await supabase.rpc('start_order_delivery', { p_order_id: orderId });
    setBusy(false);
    if (error) { setMessage('ما قدرنا نبدأ التوصيل. تأكد أن المشتريات مسجلة وموافق عليها.'); return; }
    setMessage('بدأ التوصيل. اطلب من الزبون رمز التأكيد عند التسليم.'); await refresh();
  };
  const confirmDeliveryWithPhoto = async (orderId: string) => {
    if (!supabase || !online || operationsAreStale) { setMessage('هالإجراء يحتاج اتصالاً بالخادم. تأكد من الإنترنت وحدّث الصفحة.'); return; }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) { setMessage('نحتاج إذن الكاميرا حتى تصوّر تسليم الطلب. فعّله من إعدادات الجهاز.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6, allowsEditing: false });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setBusy(true); setMessage('');
    try {
      const body = await fetch(asset.uri).then((response) => response.arrayBuffer());
      if (body.byteLength > 5 * 1024 * 1024) { setBusy(false); setMessage('حجم الصورة أكبر من 5 ميغابايت. صوّر مرة ثانية.'); return; }
      const path = `${orderId}/${Date.now()}.jpg`;
      const upload = await supabase.storage.from('delivery-proofs').upload(path, body, { contentType: asset.mimeType ?? 'image/jpeg', cacheControl: '3600', upsert: false });
      if (upload.error) throw upload.error;
      const { error } = await supabase.rpc('confirm_order_delivery_with_photo', { p_order_id: orderId, p_proof_path: path });
      if (error) throw error;
      setBusy(false); setMessage('تم تأكيد التسليم وحُفظت صورة الإثبات.'); await refresh();
    } catch {
      setBusy(false); setMessage('ما قدرنا نأكد التسليم. تأكد من الاتصال وصوّر مرة ثانية.');
    }
  };
  return <View style={[s.driverPanel,s.driverHomePanel]}>{false&&<View style={s.driverPanelTop}><View><Text style={s.driverApplyTitle}>{screen==='home'?'استقبال الطلبات':'قائمة التوصيل'}</Text><Text style={s.driverApplyCopy}>{screen==='home'?'بدّل حالتك من هون لتبدأ أو توقف استقبال العروض.':'شوف العروض الجديدة أو تابع طلباتك النشطة.'}</Text></View><Pressable disabled={busy || refreshing} onPress={() => void manualRefresh()} style={s.driverRefresh} accessibilityRole="button" accessibilityLabel="تحديث طلبات السائق"><Text style={s.driverRefreshGlyph}>↻</Text></Pressable></View>}
      {operationsAreStale && <Text style={s.driverAvailabilityOffline}>{ordersSyncedAt ? 'طلبات محفوظة وقديمة · آخر مزامنة ' + shortDateTimeFormatter.format(new Date(ordersSyncedAt)) + ' · لا تظهر عناوين العملاء أو المبالغ دون اتصال.' : 'تعذرت مزامنة الخادم. الإجراءات والعروض تحتاج اتصالاً.'}</Text>}
    {pageLoading ? <DriverOperationsSkeleton screen={screen}/> : <StaggeredSections transitionKey={`${screen}-ready`}><>
    {screen==='home'&&<View style={s.radarStage}>
      <RadarRings active={profile.is_online}/>
      <Pressable disabled={busy||!online||operationsAreStale} onPress={()=>void setAvailability(!profile.is_online)} style={[s.radarButton,profile.is_online?s.radarButtonOn:s.radarButtonOff,(busy||!online||operationsAreStale)&&s.disabled]} accessibilityRole="switch" accessibilityLabel={profile.is_online?'إيقاف استقبال الطلبات':'بدء استقبال الطلبات'} accessibilityState={{checked:profile.is_online,disabled:busy||!online||operationsAreStale}} aria-checked={profile.is_online}>
        <SymbolView name={profile.is_online?{ios:'dot.radiowaves.left.and.right',android:'sensors',web:'sensors'}:{ios:'power',android:'power_settings_new',web:'power_settings_new'}} tintColor={profile.is_online?'#0B1411':c.muted} size={42}/>
        <Text style={[s.radarButtonText,profile.is_online&&s.radarButtonTextOn]}>{busy?'لحظة…':profile.is_online?'متصل':profileComplete?'اضغط للبدء':'أكمل ملفك'}</Text>
      </Pressable>
    </View>}
    {screen==='home'&&<View style={s.radarState}><Text style={s.radarStateTitle}>{profile.is_online?'أنت متاح الآن':'متوقف عن الاستقبال'}</Text><Text style={s.radarStateHint}>{operationsAreStale?'الاتصال بالخادم مطلوب لتغيير حالة التوفر.':profile.is_online?'اضغط الدائرة لإيقاف الاستقبال':'فعّل التوفر وقت ما تكون جاهز للشغل'}</Text></View>}
    {screen==='home'&&<View style={s.homePills}>
      <Pressable onPress={()=>{setOrderSection('offers');onOpenOrders()}} accessibilityRole="button" accessibilityLabel={`عروض جديدة، ${offersCount}`} style={[s.homePill,offersCount>0&&s.homePillHot]}><Text style={s.homePillValue}>{offersCount}</Text><Text style={s.homePillLabel}>عروض جديدة</Text></Pressable>
      <Pressable onPress={()=>{setOrderSection('active');onOpenOrders()}} accessibilityRole="button" accessibilityLabel={`طلبات نشطة، ${activeOrdersCount}`} style={s.homePill}><Text style={[s.homePillValue,activeOrdersCount===0&&{color:c.text}]}>{activeOrdersCount}</Text><Text style={s.homePillLabel}>طلبات نشطة</Text></Pressable>
      <Pressable onPress={()=>setBalanceOpen(true)} accessibilityRole="button" accessibilityLabel="تفاصيل العمولة المستحقة" style={s.homePill}><Text style={[s.homePillValue,(walletBalance===null||walletBalance>=0)&&{color:c.text}]}>{walletBalance===null?'—':numberFormatter.format(Math.abs(walletBalance))}</Text><Text style={s.homePillLabel}>{walletBalance!==null&&walletBalance<0?'عمولة مستحقة':'رصيد ل.س'}</Text></Pressable>
    </View>}
    {screen==='home'&&offers[0]&&profile.is_online&&<Pressable onPress={()=>{setOrderSection('offers');onOpenOrders()}} accessibilityRole="button" style={s.homeLive}>
      <View style={s.homeLiveHead}><Text style={s.homeLiveKicker}>⚡ عرض بانتظارك</Text></View>
      <View style={s.homeLiveMain}><View style={{flex:1}}><Text numberOfLines={1} style={s.homeLiveTitle}>{offers[0].order.request_text}</Text><Text style={s.homeLiveSub}>{offers[0].order.address?`${offers[0].order.address.neighborhood}، ${offers[0].order.address.city}`:offers[0].order.category}</Text></View><Text style={s.homeLiveFee}>{numberFormatter.format(offers[0].order.delivery_fee_minor)} <Text style={s.homeLiveFeeUnit}>ل.س</Text></Text></View>
      <OfferCountdown expiresAt={offers[0].expires_at}/>
      <View style={s.homeLiveCta}><Text style={s.homeLiveCtaText}>عرض التفاصيل ←</Text></View>
    </Pressable>}
    {screen==='home'&&!(offers[0]&&profile.is_online)&&activeOrders[0]&&<Pressable onPress={()=>{setOrderSection('active');onOpenOrders()}} accessibilityRole="button" style={s.homeActive}>
      <View style={s.homeActiveIcon}><SymbolView name={{ios:'shippingbox.fill',android:'local_shipping',web:'local_shipping'}} tintColor={c.primary} size={22}/></View>
      <View style={{flex:1}}><Text style={s.homeActiveTitle}>طلب قيد التنفيذ</Text><Text numberOfLines={1} style={s.homeActiveSub}>{orderStatus[activeOrders[0].status] ?? activeOrders[0].status} · {activeOrders[0].category}</Text></View>
      <SymbolView name={{ios:'chevron.left',android:'chevron_left',web:'chevron_left'}} tintColor={c.muted} size={16}/>
    </Pressable>}
    {screen === 'home' && <View style={s.driverCommissionSummary}><View style={s.driverCommissionBadge}><SymbolView name={{ios:'banknote.fill',android:'payments',web:'payments'}} tintColor={c.primary} size={18}/></View><View style={{flex:1,alignItems:'flex-end'}}><Text style={s.driverCommissionTitle}>العمولة المستحقة</Text><Text style={s.driverCommissionCopy}>{walletUnavailable?'تعذر تحميل رصيد العمولة. أعد المحاولة.':walletBalance === null ? online ? 'عم نتحقق من رصيدك.' : 'الرصيد يظهر عند الاتصال.' : walletBalance < 0 ? `عليك ${numberFormatter.format(Math.abs(walletBalance))} ل.س بعد تسوية الطلبات.` : walletBalance > 0 ? `إلك رصيد ${numberFormatter.format(walletBalance)} ل.س.` : 'ما عليك عمولات مستحقة حالياً.'}</Text></View></View>}
    {screen === 'orders' && <>
      <View style={s.driverOrderTabs}>
        {([{ key: 'offers', label: 'عروض جديدة', count: offersCount }, { key: 'active', label: 'طلباتي النشطة', count: activeOrdersCount }] as const).map((item) => { const on = orderSection === item.key; return <Pressable key={item.key} onPress={() => setOrderSection(item.key)} accessibilityRole="button" accessibilityLabel={`${item.label}، ${item.count}`} accessibilityState={{ selected: on }} style={[s.oTab, on && s.oTabOn]}><Text style={[s.oTabText, on && s.oTabTextOn]}>{item.label}</Text><View style={[s.oTabCount, on && s.oTabCountOn, !on && item.count > 0 && s.oTabCountHot]}><Text style={[s.oTabCountText, on && s.oTabCountTextOn, !on && item.count > 0 && s.oTabCountTextHot]}>{item.count}</Text></View></Pressable>; })}
      </View>
      <View style={s.driverOrdersToolbar}><View style={s.driverOrdersToolbarTitleRow}><Text style={s.driverOrdersToolbarTitle}>{orderSection === 'offers' ? 'عروض قريبة منك' : 'طلباتك النشطة'}</Text></View><Pressable disabled={busy || refreshing} onPress={() => void manualRefresh()} style={[s.driverToolbarRefresh, busy && s.disabled]} accessibilityRole="button" accessibilityLabel="تحديث طلبات السائق"><SymbolView name={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }} tintColor={c.primary} size={15}/><Text style={s.driverToolbarRefreshText}>{refreshing ? 'لحظة…' : 'تحديث'}</Text></Pressable></View>
      <View style={orderSection === 'offers' ? undefined : s.hidden}>{!profile.is_online && <View style={s.driverOrdersHint}><SymbolView name={{ios:'pause.circle.fill',android:'pause_circle',web:'pause_circle'}} tintColor={c.accent} size={19}/><Text style={s.driverOrdersHintText}>الاستقبال متوقف. فعّله من الرئيسية حتى تقدر تقبل عرضاً.</Text></View>}
    {offers.length ? offers.map((offer) => <View key={offer.id} style={s.driverIncomingCard}><View style={s.driverIncomingTop}><View style={s.driverOrderCategoryPill}><Text style={s.driverOrderCategoryPillText}>{offer.order.category}</Text></View><View style={s.driverFeeHighlight}><Text style={s.driverFeeLabel}>أجرة التوصيل</Text><Text style={s.driverFeeValue}>{numberFormatter.format(offer.order.delivery_fee_minor)} ل.س</Text></View></View><Text style={s.driverOfferRequest}>{offer.order.request_text}</Text><OrderImageGallery orderId={offer.order.id} defaultOpen/><View style={s.driverOfferDestination}><View style={s.driverOfferSectionTitle}><SymbolView name={{ios:'mappin.and.ellipse',android:'location_on',web:'location_on'}} tintColor={c.primary} size={17}/><Text style={s.dropoffTitle}>مكان التوصيل</Text></View>{offer.order.address?<><Text style={s.dropoffText}>{offer.order.address.street}{offer.order.address.building?'، بناء '+offer.order.address.building:''}</Text><Text style={s.dropoffText}>{offer.order.address.neighborhood}، {offer.order.address.city}{offer.order.address.landmark?' · '+offer.order.address.landmark:''}</Text></>:<Text style={s.dropoffText}>عم نحمل عنوان التوصيل…</Text>}</View><View style={s.driverOfferBudget}><Text style={s.driverOrderFactLabel}>الحد الأعلى لمشتريات العميل</Text><Text style={s.driverOrderFactValue}>حتى {numberFormatter.format(offer.order.budget_ceiling_minor)} ل.س</Text><Text style={s.dropoffText}>أي مبلغ أعلى يحتاج موافقة العميل.</Text></View><OfferCountdown expiresAt={offer.expires_at}/><View style={s.offerActions}><Pressable disabled={busy || !profile.is_online || !online || operationsAreStale || !offer.order.address} onPress={() => void accept(offer.id)} style={[s.acceptOffer,(busy || !online || operationsAreStale || !offer.order.address)&&s.disabled]} accessibilityRole="button"><Text style={s.acceptOfferText}>قبول العرض</Text></Pressable><Pressable disabled={busy || !online || operationsAreStale} onPress={() => void decline(offer.id)} style={[s.declineOffer,(busy || !online || operationsAreStale)&&s.disabled]} accessibilityRole="button"><Text style={s.declineOfferText}>رفض</Text></Pressable></View></View>) : <View style={s.noOffers}><View style={s.emptyIconWrap}><SymbolView name={{ios:'sparkles',android:'new_releases',web:'new_releases'}} tintColor={c.primary} size={26}/></View><Text style={s.noOffersTitle}>ما في عروض حالياً</Text><Text style={s.noOffersCopy}>لما يوصلك عرض جديد بيظهر هون. فيك تحدّث القائمة بأي وقت.</Text></View>}
    </View><View style={orderSection === 'active' ? undefined : s.hidden}>{!!activeOrders.length && <>{activeOrders.map((order) => <View key={order.id} style={s.driverActiveCard}><View style={s.driverActiveHead}><Text style={s.orderCategory}>{order.category}</Text><View style={s.driverStatusChip}><Text style={s.driverStatusChipText}>{({ accepted: 'بانتظار بدء التسوق', assigned: 'بانتظار بدء التسوق', shopping: 'مرحلة التسوق', awaiting_approval: 'بانتظار موافقة العميل', purchased: 'جاهز للتوصيل', delivering: 'قيد التوصيل' } as Record<string,string>)[order.status] ?? orderStatus[order.status] ?? order.status}</Text></View></View><View style={s.driverOrderFacts}><View style={s.driverOrderFact}><Text style={s.driverOrderFactLabel}>أجرة التوصيل</Text><Text style={s.driverOrderFactValue}>{numberFormatter.format(order.delivery_fee_minor)} ل.س</Text></View><View style={s.driverOrderFact}><Text style={s.driverOrderFactLabel}>ميزانية العميل</Text><Text style={s.driverOrderFactValue}>{operationsAreStale ? 'تظهر عند الاتصال' : numberFormatter.format(order.budget_ceiling_minor) + ' ل.س'}</Text></View></View><Text style={s.orderRequest}>{order.request_text}</Text><OrderImageGallery orderId={order.id} defaultOpen/><SupportIssueForm orderId={order.id} status={order.status} disabled={operationsAreStale}/>{order.address && <View style={s.dropoff}><Text style={s.dropoffTitle}>عنوان التوصيل</Text><Text style={s.dropoffText}>{order.address.label} · {order.address.street}{order.address.building ? `، بناء ${order.address.building}` : ''}</Text><Text style={s.dropoffText}>{order.address.neighborhood}، {order.address.city}{order.address.landmark ? ` · ${order.address.landmark}` : ''}</Text><Text style={s.dropoffPhone} selectable>{order.address.contact_phone}</Text></View>}{['accepted','assigned'].includes(order.status) && <Pressable disabled={busy || !online || operationsAreStale} onPress={() => void startShopping(order.id)} style={[s.acceptOffer,(busy || !online || operationsAreStale)&&s.disabled]} accessibilityRole="button"><Text style={s.acceptOfferText}>بدء التسوق ←</Text></Pressable>}{order.status === 'shopping' && <><Text style={s.label}>المبلغ المتوقع عند الصندوق · ل.س</Text><TextInput value={purchaseDrafts[order.id] ?? ''} onChangeText={(value) => setPurchaseDrafts((current) => ({...current,[order.id]:value}))} keyboardType="number-pad" textAlign="left" placeholder="مثال: 25000" placeholderTextColor="#839188" style={s.field} accessibilityLabel="قيمة المشتريات"/><Pressable disabled={busy || !online || operationsAreStale} onPress={() => void recordPurchase(order.id)} style={[s.acceptOffer,(busy || !online || operationsAreStale)&&s.disabled]} accessibilityRole="button"><Text style={s.acceptOfferText}>تسجيل قيمة المشتريات ←</Text></Pressable>{order.purchase_amount_minor !== null && (order.purchase_amount_minor <= order.budget_ceiling_minor || order.purchase_approved_at !== null) && <Pressable disabled={busy || !online || operationsAreStale} onPress={() => void confirmPurchase(order.id)} style={[s.acceptOffer,(busy || !online || operationsAreStale)&&s.disabled]} accessibilityRole="button"><Text style={s.acceptOfferText}>تأكيد الشراء بعد الدفع ←</Text></Pressable>}</>}{!operationsAreStale && order.status === 'awaiting_approval' && <View style={s.driverWaitNotice}><Text style={s.driverWaitTitle}>لا تشتري بعد</Text><Text style={s.driverWaitCopy}>المبلغ المقترح {numberFormatter.format(order.purchase_amount_minor ?? 0)} ل.س، وبانتظار موافقة العميل.</Text></View>}{!operationsAreStale && order.status === 'purchased' && <><Text style={s.offerExpiry}>مشتريات: {numberFormatter.format(order.purchase_amount_minor ?? 0)} ل.س</Text><Pressable disabled={busy || !online || operationsAreStale} onPress={() => void startDelivery(order.id)} style={[s.acceptOffer,(busy || !online || operationsAreStale)&&s.disabled]} accessibilityRole="button"><Text style={s.acceptOfferText}>بدء التوصيل ←</Text></Pressable></>}{order.status === 'delivering' && <><Pressable disabled={busy || !online || operationsAreStale} onPress={() => void confirmDeliveryWithPhoto(order.id)} style={[s.acceptOffer,(busy || !online || operationsAreStale)&&s.disabled]} accessibilityRole="button"><Text style={s.acceptOfferText}>📷 تصوير التسليم وإنهاء الطلب</Text></Pressable></>}</View>)}</>}
    {!activeOrders.length && <View style={s.noOffers}><View style={s.emptyIconWrap}><SymbolView name={{ios:'shippingbox.fill',android:'local_shipping',web:'local_shipping'}} tintColor={c.primary} size={26}/></View><Text style={s.noOffersTitle}>ما عندك طلبات نشطة</Text><Text style={s.noOffersCopy}>بعد قبول عرض، تفاصيله وخطوات التوصيل بتظهر هون.</Text></View>}</View></>}
    </></StaggeredSections>}
    {screen==='home'&&(()=>{const live=offers.find(o=>o.id!==dismissedOfferId);const open=!!live&&profile.is_online&&online&&!pageLoading;const can=!(busy||!profile.is_online||!online||operationsAreStale||!live?.order.address);return <Modal visible={open} transparent animationType="slide" onRequestClose={()=>setDismissedOfferId(live?.id??null)}>
      <Pressable style={s.sheetBackdrop} onPress={()=>setDismissedOfferId(live?.id??null)} accessibilityLabel="إغلاق"><Pressable style={s.sheet} onPress={()=>{}}>
        {live&&<>
        <View style={s.sheetHandle}/>
        <View style={s.sheetHead}>
          <View style={[s.nTile,s.nTileUnread]}><SymbolView name={{ios:'bolt.fill',android:'bolt',web:'bolt'}} tintColor={c.primary} size={24}/></View>
          <View style={{flex:1,minWidth:0}}><Text style={s.sheetKicker}>عرض جديد</Text><Text style={s.sheetTitle}>وصلك عرض توصيل</Text></View>
          <Pressable onPress={()=>setDismissedOfferId(live.id)} style={s.sheetClose} accessibilityRole="button" accessibilityLabel="إغلاق"><SymbolView name={{ios:'xmark',android:'close',web:'close'}} tintColor={c.muted} size={16}/></Pressable>
        </View>
        <View style={[s.sheetBox,s.liveOfferBox]}>
          <View style={s.nFooter}><View style={s.driverOrderCategoryPill}><Text style={s.driverOrderCategoryPillText}>{live.order.category}</Text></View><View style={s.driverFeeHighlight}><Text style={s.driverFeeLabel}>أجرة التوصيل</Text><Text style={s.driverFeeValue}>{numberFormatter.format(live.order.delivery_fee_minor)} ل.س</Text></View></View>
          <Text numberOfLines={3} style={[s.sheetBody,{marginTop:12}]}>{live.order.request_text}</Text><OrderImageGallery orderId={live.order.id} defaultOpen/>
          <View style={s.nDivider}/>
          <View style={s.driverOfferSectionTitle}><SymbolView name={{ios:'mappin.and.ellipse',android:'location_on',web:'location_on'}} tintColor={c.primary} size={17}/><Text style={s.dropoffTitle}>التسليم</Text></View>
          <Text style={s.dropoffText}>{live.order.address?`${live.order.address.neighborhood}، ${live.order.address.city}`:'عم نحمل عنوان التوصيل…'}</Text>
          <OfferCountdown expiresAt={live.expires_at}/>
        </View>
        <Pressable disabled={!can} onPress={()=>void accept(live.id)} style={[s.sheetCta,!can&&s.disabled]} accessibilityRole="button"><Text style={s.sheetCtaText}>قبول العرض الآن</Text></Pressable>
        <View style={s.offerActions}><Pressable disabled={busy||!online||operationsAreStale} onPress={()=>void decline(live.id)} style={[s.declineOffer,(busy||!online||operationsAreStale)&&s.disabled]} accessibilityRole="button"><Text style={s.declineOfferText}>رفض</Text></Pressable><Pressable onPress={()=>{setDismissedOfferId(live.id);setOrderSection('offers');onOpenOrders()}} style={s.declineOffer} accessibilityRole="button"><Text style={s.declineOfferText}>عرض التفاصيل</Text></Pressable></View>
        </>}
      </Pressable></Pressable>
    </Modal>})()}
    {screen==='home'&&<Modal visible={balanceOpen} transparent animationType="slide" onRequestClose={()=>setBalanceOpen(false)}>
      <Pressable style={s.sheetBackdrop} onPress={()=>setBalanceOpen(false)} accessibilityLabel="إغلاق"><Pressable style={s.sheet} onPress={()=>{}}>
        <View style={s.sheetHandle}/>
        <View style={s.sheetHead}>
          <View style={{flex:1,minWidth:0}}><Text style={s.sheetTitle}>تفاصيل العمولة المستحقة</Text></View>
          <Pressable onPress={()=>setBalanceOpen(false)} style={s.sheetClose} accessibilityRole="button" accessibilityLabel="إغلاق"><SymbolView name={{ios:'xmark',android:'close',web:'close'}} tintColor={c.muted} size={16}/></Pressable>
        </View>
        <View style={[s.sheetBox,{alignItems:'center',paddingVertical:22}]}>
          <Text style={s.balanceLabel}>{walletBalance!==null&&walletBalance>0?'رصيدك لدى لَبّيك':'الرصيد المستحق للدفع'}</Text>
          <Text style={s.balanceValue}>{walletUnavailable?'—':walletBalance===null?'…':numberFormatter.format(Math.abs(walletBalance))} <Text style={s.balanceUnit}>ل.س</Text></Text>
          <View style={[s.balanceBadge,walletBalance!==null&&walletBalance<0&&s.balanceBadgeDue]}><Text style={[s.balanceBadgeText,walletBalance!==null&&walletBalance<0&&s.balanceBadgeTextDue]}>{walletUnavailable?'تعذر تحميل الرصيد. أعد المحاولة.':walletBalance===null?(online?'عم نتحقق من رصيدك…':'الرصيد يظهر عند الاتصال.'):walletBalance<0?'عليك دفعها بعد تسوية الطلبات':walletBalance>0?'إلك رصيد بالمحفظة':'✓ حسابك مسوّى بالكامل'}</Text></View>
        </View>
        <Pressable onPress={()=>setBalanceOpen(false)} style={s.sheetCta} accessibilityRole="button"><Text style={s.sheetCtaText}>حسناً</Text></Pressable>
      </Pressable></Pressable>
    </Modal>}
  </View>;
}

function DriverApplicationFlow({ userId, initialToken }: { userId: string; initialToken?: string }) {
  const { styles: s } = useMobileTheme();
  const online = useInternetAvailable();
  const [status, setStatus] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState(initialToken ?? '');
  const [vehicle, setVehicle] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useToastMessage();
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    if (!supabase || !online) return;
    supabase.from('driver_profiles').select('review_status').eq('user_id', userId).maybeSingle().then(({ data }) => { setStatus(data?.review_status ?? null); setChecked(true); });
  }, [online, userId]);
  const apply = async () => {
    if (!supabase) return;
    const token = inviteCode.replace(/\s/g, '').toLowerCase();
    if (token.length !== 64 || !/^[a-f0-9]{64}$/.test(token)) { setMessage('رمز الدعوة لازم يكون كامل وصالح.'); return; }
    setBusy(true); setMessage('');
    const { data, error } = await supabase.rpc('redeem_driver_invite', { p_token: token, p_vehicle_description: vehicle.trim() || undefined });
    setBusy(false);
    if (error) { setMessage('الدعوة غير صالحة أو منتهية أو مستخدمة من قبل. راجع الرمز مع فريق لَبّيك.'); return; }
    setStatus(data); setInviteCode(''); setMessage('وصل طلب انضمامك لفريق لَبّيك. رح نراجع معلوماتك.');
  };
  if (!checked) return <View accessibilityRole="progressbar" accessibilityLabel="تحميل حالة طلب الانضمام" style={[s.driverApplyCard, { minHeight: 166, justifyContent: 'center', gap: 14 }]}><SkeletonBlock width="46%" height={18} /><SkeletonBlock width="82%" height={12} /><SkeletonBlock width="66%" height={12} /></View>;
  if (status === 'approved') return <DriverOperations userId={userId}/>;
  return <View style={s.driverApplyCard}><View style={s.driverApplyMark}><Text style={s.driverApplyIcon}>♙</Text></View><Text style={s.driverApplyTitle}>انضم لفريق السائقين</Text>{status ? <><Text style={s.driverApplyCopy}>{status === 'pending' ? 'طلبك قيد المراجعة. رح يتواصل معك الفريق بعد التحقق.' : status === 'approved' ? 'تم اعتماد حسابك. واجهة السائق قيد التجهيز.' : status === 'suspended' ? 'حساب السائق موقوف حالياً. تواصل مع فريق لَبّيك.' : 'تمت مراجعة الطلب. تواصل مع الفريق إذا بدك تعرف التفاصيل.'}</Text><Text style={s.driverStatus}>{status === 'pending' ? 'بانتظار المراجعة' : status === 'approved' ? 'سائق معتمد' : status === 'suspended' ? 'موقوف' : 'مرفوض'}</Text></> : <><Text style={s.driverApplyCopy}>إذا وصلك رمز دعوة من فريق لَبّيك، دخّله حتى نبدأ مراجعة طلبك.</Text><Text style={s.label}>رمز الدعوة</Text><TextInput value={inviteCode} onChangeText={setInviteCode} autoCapitalize="none" autoCorrect={false} textAlign="left" placeholder="64 حرفاً" placeholderTextColor="#839188" style={s.field} accessibilityLabel="رمز دعوة السائق"/><Text style={s.label}>نوع المركبة <Text style={s.optional}>اختياري</Text></Text><TextInput value={vehicle} onChangeText={setVehicle} placeholder="دراجة، سيارة..." placeholderTextColor="#839188" style={s.field} accessibilityLabel="نوع المركبة" maxLength={160}/><Pressable disabled={busy} onPress={() => void apply()} style={[s.saveAddress,busy&&s.disabled]} accessibilityRole="button"><Text style={s.saveAddressText}>{busy?'عم نتحقق…':'إرسال طلب الانضمام'} <Text style={s.submitArrow}>←</Text></Text></Pressable>{message ? <Text accessibilityRole="alert" style={s.formMessage}>{message}</Text> : null}</>}</View>;
}

type DriverProfileDraft = { name: string; phone: string; age: string; avatarPath: string | null; avatarUrl: string | null; avatarDraft: ProfileAvatarDraft | null };
function DriverWorkspace({ userId, email, onSignOut, theme, onToggleTheme }: { userId: string; email: string; onSignOut: () => void; theme: 'dark' | 'light'; onToggleTheme: () => void }) {
  const { colors: c, styles: s } = useMobileTheme();
  const network = useNetworkState();
  const online = useInternetAvailable();
  const [tab, setTab] = useState<'home' | 'orders' | 'notifications' | 'profile'>('home');
  const [visitedTabs, setVisitedTabs] = useState({ home: true, orders: false, notifications: false, profile: true });
  const [operationsScreen, setOperationsScreen] = useState<'home' | 'orders'>('home');
  const [notificationCount,setNotificationCount]=useState(0);
  const [profile, setProfile] = useState<DriverProfileDraft>({ name: '', phone: '', age: '', avatarPath: null, avatarUrl: null, avatarDraft: null });
  const [editingProfile, setEditingProfile] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [avatarDraft, setAvatarDraft] = useState<ProfileAvatarDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileLoadError, setProfileLoadError] = useState('');
  const profileLoaded = useRef(false);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [, setMessage] = useToastMessage();
  const [tabScale] = useState(() => new Animated.Value(1));
  const [activeTabAnimation, setActiveTabAnimation] = useState<'home' | 'orders' | 'notifications' | 'profile'>('home');
  useEffect(() => {
    if (!supabase || !online) return;
    let active = true;
    const refreshUnreadCount = async () => {
      const { count, error } = await supabase!.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
      if (active && !error) setNotificationCount(count ?? 0);
    };
    void refreshUnreadCount();
    const channel = supabase.channel(`driver-notification-count-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, () => { void refreshUnreadCount(); })
      .subscribe();
    return () => { active = false; void supabase?.removeChannel(channel); };
  }, [online, userId]);
  useEffect(() => {
    if (!supabase) { setLoading(false); setProfileLoadError('تعذر الاتصال بالخادم.'); return; }
    if (!online) {
      // Network state starts unknown on mobile. Keep the page skeleton until it
      // resolves so an empty profile is never mistaken for an incomplete one.
      if (typeof network.isConnected !== 'boolean') return;
      if (!profileLoaded.current) {
        setLoading(false);
        setProfileLoadError('تعذر تحميل ملف السائق. تحقق من اتصال الإنترنت؛ ستظهر بياناتك عند عودته.');
      }
      return;
    }
    let active = true;
    setLoading(true);
    setProfileLoadError('');
    void Promise.all([
      supabase.from('profiles').select('display_name,avatar_path').eq('id', userId).maybeSingle(),
      supabase.from('driver_profiles').select('phone_e164,age').eq('user_id', userId).maybeSingle(),
    ]).then(async ([account, driver]) => {
      if (!active) return;
      if (account.error || driver.error) throw account.error ?? driver.error;
      const avatarPath = account.data?.avatar_path ?? null;
      const avatar = avatarPath ? await supabase!.storage.from('profile-avatars').createSignedUrl(avatarPath, 60 * 60 * 24 * 30) : null;
      if (!active) return;
      const loaded: DriverProfileDraft = {
        name: account.data?.display_name ?? '',
        phone: (driver.data?.phone_e164 ?? '').replace(/^\+963/, ''),
        age: driver.data?.age == null ? '' : String(driver.data.age),
        avatarPath,
        avatarUrl: avatar?.data?.signedUrl ?? null,
        avatarDraft: null,
      };
      setProfile(loaded); setName(loaded.name); setPhone(loaded.phone); setAge(loaded.age);
      profileLoaded.current = true;
    }).catch(() => { if (active && !profileLoaded.current) setProfileLoadError('ما قدرنا نحمّل بيانات الملف. أعد المحاولة.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [online, network.isConnected, profileRefreshKey, userId]);
  const profileComplete = profile.name.trim().length >= 2 && /^9\d{8}$/.test(profile.phone) && Number(profile.age) >= 18 && Number(profile.age) <= 80;
  const goTab = (next: 'home' | 'orders' | 'notifications' | 'profile') => {
    setVisitedTabs((current) => ({ ...current, [next]: true }));
    if (next === 'home' || next === 'orders') setOperationsScreen(next);
    setTab(next); setActiveTabAnimation(next); tabScale.setValue(0.84);
    Animated.spring(tabScale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 7 }).start();
  };
  const choosePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.78, exif: false });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) { setMessage('حجم الصورة أكبر من 5 ميغابايت. اختار صورة أصغر.'); return; }
    const mimeType = asset.mimeType?.toLowerCase() ?? 'image/jpeg';
    const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' } as Record<string, string>)[mimeType];
    if (!extension) { setMessage('اختار صورة JPEG أو PNG أو WebP أو HEIC.'); return; }
    setAvatarDraft({ uri: asset.uri, mimeType, extension }); setMessage('اختيرت الصورة. احفظ الملف الشخصي لتثبيتها.');
  };
  const save = async () => {
    const normalizedPhone = normalizeDigits(phone).slice(0, 9);
    const parsedAge = Number(normalizeDigits(age));
    if (name.trim().length < 2) { setMessage('اكتب اسمك الكامل حتى يتعرف عليك الزبون.'); return; }
    if (!/^9\d{8}$/.test(normalizedPhone)) { setMessage('أدخل رقم موبايل سوري من 9 أرقام يبدأ بـ 9.'); return; }
    if (!Number.isInteger(parsedAge) || parsedAge < 18 || parsedAge > 80) { setMessage('العمر لازم يكون بين 18 و80 سنة.'); return; }
    if (!supabase || !online) { setMessage('حفظ الملف يحتاج اتصالاً بالإنترنت.'); return; }
    setBusy(true); setMessage('');
    let uploadedAvatarPath: string | null = null;
    if (avatarDraft) {
      try {
        const body = await fetch(avatarDraft.uri).then((response) => response.arrayBuffer());
        const path = `${userId}/${newRequestKey()}.${avatarDraft.extension}`;
        const { error } = await supabase.storage.from('profile-avatars').upload(path, body, { contentType: avatarDraft.mimeType, cacheControl: '3600', upsert: false });
        if (error) throw error;
        uploadedAvatarPath = path;
      } catch { setBusy(false); setMessage('ما قدرنا نرفع الصورة. جرّب صورة ثانية.'); return; }
    }
    const { error: accountError } = await supabase.from('profiles').update({ display_name: name.trim(), ...(uploadedAvatarPath ? { avatar_path: uploadedAvatarPath } : {}) }).eq('id', userId);
    if (accountError) {
      if (uploadedAvatarPath) await supabase.storage.from('profile-avatars').remove([uploadedAvatarPath]);
      setBusy(false); setMessage('ما قدرنا نحفظ الاسم والصورة. حاول مرة ثانية.'); return;
    }
    const { error: driverError } = await supabase.from('driver_profiles').update({ phone_e164: `+963${normalizedPhone}`, age: parsedAge }).eq('user_id', userId);
    if (driverError) { setBusy(false); setMessage('انحفظ الاسم والصورة، بس ما قدرنا نحفظ رقم الهاتف والعمر. أعد المحاولة.'); return; }
    let avatarUrl = profile.avatarUrl;
    if (uploadedAvatarPath) {
      const { data } = await supabase.storage.from('profile-avatars').createSignedUrl(uploadedAvatarPath, 60 * 60 * 24 * 30);
      avatarUrl = data?.signedUrl ?? null;
      if (profile.avatarPath) await supabase.storage.from('profile-avatars').remove([profile.avatarPath]);
    }
    const saved = { name: name.trim(), phone: normalizedPhone, age: String(parsedAge), avatarPath: uploadedAvatarPath ?? profile.avatarPath, avatarUrl, avatarDraft: null };
    setProfile(saved); setPhone(normalizedPhone); setAge(String(parsedAge)); setAvatarDraft(null); setBusy(false); setMessage('تم حفظ تعديلات ملفك.'); setEditingProfile(false);
  };
  const avatar = avatarDraft?.uri ?? profile.avatarUrl;
  const initial = (profile.name.trim()[0] ?? email[0] ?? 'س').toLocaleUpperCase('ar');
  return <SafeAreaView style={s.safe}>
    <View accessibilityRole="main" style={{ flex: 1 }}>
      <View style={s.header}>
        <Pressable onPress={() => goTab('profile')} accessibilityRole="button" accessibilityLabel="فتح الملف الشخصي للسائق" style={s.driverHeaderProfile}>
          <View style={s.driverHeaderAvatar}>{avatar ? <Image source={{ uri: avatar }} cachePolicy="none" style={s.avatarImage} contentFit="cover"/> : <Text style={s.accountAvatarLargeText}>{initial}</Text>}</View>
          <Text style={s.driverHeaderHint}>حسابي</Text>
        </Pressable>
        <View style={s.brand}><View style={s.brandMark}><Image source={require('../../assets/images/labbayk-delivery-logo.png')} style={s.brandLogo} contentFit="contain" accessibilityLabel="شعار لَبّيك"/></View><View><Text style={s.brandName}>لَبّيك</Text><Text style={s.brandTag}>مساحة السائق</Text></View></View>
      </View>
      <ScrollView style={s.bodyScroll} contentContainerStyle={s.driverContent} keyboardShouldPersistTaps="handled">
        <StaggeredSections transitionKey={`${tab}-${loading ? 'loading' : 'ready'}`} animateSingle>
        {tab === 'home' ? <>
          {loading ? <View accessibilityRole="progressbar" accessibilityLabel="تحميل ملف السائق" style={{gap:12}}><View style={[s.driverOnboardingCard,{minHeight:230,justifyContent:'center',gap:16}]}><SkeletonBlock width={54} height={54} style={{alignSelf:'flex-end',borderRadius:17}}/><SkeletonBlock width="43%" height={12}/><SkeletonBlock width="66%" height={25}/><SkeletonBlock width="91%" height={12}/><SkeletonBlock width="76%" height={12}/><SkeletonBlock width="100%" height={48} style={{alignSelf:'auto',borderRadius:13,marginTop:5}}/></View><View style={s.driverStatsRow}><View style={[s.driverStat,{minHeight:68}]}><SkeletonBlock width="48%" height={13}/></View><View style={[s.driverStat,{minHeight:68}]}><SkeletonBlock width="48%" height={13}/></View></View></View> : profileLoadError ? <View style={s.driverOnboardingCard}><Text style={s.driverOnboardingTitle}>ما قدرنا نحمّل ملفك</Text><Text style={s.driverOnboardingCopy}>{profileLoadError}</Text><Pressable disabled={!online} onPress={() => { setLoading(true); setProfileRefreshKey((value) => value + 1); }} style={[s.driverOnboardingButton,!online&&s.disabled]} accessibilityRole="button"><Text style={s.driverOnboardingButtonText}>{online?'إعادة المحاولة':'بانتظار الاتصال'}</Text></Pressable></View> : !profileComplete ? <View style={s.driverOnboardingCard}>
            <View style={s.driverOnboardingIcon}><SymbolView name={{ ios: 'person.text.rectangle.fill', android: 'badge', web: 'badge' }} tintColor="#0B1411" size={27}/></View>
            <Text style={s.driverOnboardingStep}>الخطوة الأولى · قبل استقبال الطلبات</Text>
            <Text style={s.driverOnboardingTitle}>كمّل ملف السائق</Text>
            <Text style={s.driverOnboardingCopy}>ضيف اسمك، رقم موبايل سوري، وعمرك. بعدها منفعّل خيار التوفر وبتوصلك طلبات دمشق وريفها.</Text>
            <View style={s.driverOnboardingList}><Text style={s.driverOnboardingListItem}>١  الاسم والبريد الإلكتروني</Text><Text style={s.driverOnboardingListItem}>٢  رقم الموبايل مع نداء سوريا ‎+963</Text><Text style={s.driverOnboardingListItem}>٣  العمر · لازم يكون 18 سنة أو أكثر</Text><Text style={s.driverOnboardingListItem}>٤  صورة شخصية · فيك تضيفها من حسابك</Text></View>
            <Pressable onPress={() => goTab('profile')} style={s.driverOnboardingButton} accessibilityRole="button"><Text style={s.driverOnboardingButtonText}>إكمال ملفي الآن <Text style={s.submitArrow}>←</Text></Text></Pressable>
          </View> : <>
            <View style={s.homeGreeting}><Text style={s.homeGreetingTitle}>مرحباً {profile.name.trim().split(/\s+/)[0] || 'بالسائق'} 👋</Text><Text style={s.homeGreetingSub}>الرادار بيشتغل بس تكون متاح، وبنفتش لك على طلب.</Text></View>
          </>}
        </> : tab === 'orders' ? <>
          <View style={s.driverPageIntro}><Text style={s.driverHeroEyebrow}>تشغيلك اليومي</Text><Text style={s.accountPageTitle}>الطلبات</Text><Text style={s.accountPageSubtitle}>العروض الجديدة والطلبات اللي عم توصلها.</Text></View>
          {loading && <View accessibilityRole="progressbar" accessibilityLabel="تحميل الطلبات" style={{gap:12}}>{[0,1].map((item)=><View key={item} style={[s.driverOrdersSkeleton,{minHeight:140,marginBottom:0}]}><View style={s.driverSkeletonTop}><View style={s.driverSkeletonPill}/><View style={s.driverSkeletonLine}/></View><View style={[s.driverSkeletonLine,{width:'88%'}]}/><View style={[s.driverSkeletonLine,{width:'61%'}]}/><View style={[s.driverSkeletonButton,{alignSelf:'flex-end'}]}/></View>)}</View>}
          {profileLoadError && <View style={[s.driverOnboardingCard,{marginTop:12}]}><Text style={s.driverOnboardingTitle}>ما قدرنا نحمّل بياناتك</Text><Text style={s.driverOnboardingCopy}>{profileLoadError}</Text><Pressable disabled={!online} onPress={() => { setLoading(true); setProfileRefreshKey((value) => value + 1); }} style={[s.driverOnboardingButton,!online&&s.disabled]} accessibilityRole="button"><Text style={s.driverOnboardingButtonText}>{online?'إعادة المحاولة':'بانتظار الاتصال'}</Text></Pressable></View>}
        </> : tab === 'profile' ? <>
          <View style={s.driverPageIntro}><Text style={s.driverHeroEyebrow}>بياناتك الأساسية</Text><Text style={s.accountPageTitle}>ملف السائق</Text><Text style={s.accountPageSubtitle}>الزبون وفريق لَبّيك بيستخدموا هالمعلومات للتواصل.</Text></View>
          <View style={s.driverProfileCard}>
            {loading ? <View accessibilityRole="progressbar" accessibilityLabel="تحميل الملف الشخصي" style={{gap:15,paddingVertical:8}}><SkeletonBlock width={94} height={94} style={{alignSelf:'center',borderRadius:47}}/><SkeletonBlock width="37%" height={13}/><SkeletonBlock width="100%" height={48} style={{alignSelf:'auto',borderRadius:12}}/><SkeletonBlock width="31%" height={13}/><SkeletonBlock width="100%" height={48} style={{alignSelf:'auto',borderRadius:12}}/><SkeletonBlock width="100%" height={48} style={{alignSelf:'auto',borderRadius:12}}/></View> : profileLoadError ? <View><Text style={s.driverIdentityName}>ما قدرنا نحمّل ملفك</Text><Text style={[s.driverOnboardingCopy,{marginTop:8}]}>{profileLoadError}</Text><Pressable disabled={!online} onPress={() => { setLoading(true); setProfileRefreshKey((value) => value + 1); }} style={[s.driverOnboardingButton,{marginTop:14},!online&&s.disabled]} accessibilityRole="button"><Text style={s.driverOnboardingButtonText}>{online?'إعادة المحاولة':'بانتظار الاتصال'}</Text></Pressable></View> : editingProfile ? <>
              <Pressable onPress={() => { setName(profile.name); setPhone(profile.phone); setAge(profile.age); setAvatarDraft(null); setEditingProfile(false); }} style={s.backNavigation} accessibilityRole="button"><Text style={s.backNavigationText}>→ العودة إلى الملف الشخصي</Text></Pressable>
              <Text style={s.profileSectionTitle}>تعديل ملف السائق</Text>
              <View style={s.driverPhotoRing}>{avatar ? <Image source={{ uri: avatar }} cachePolicy="none" style={s.driverPhotoImage} contentFit="cover" accessibilityLabel="صورة السائق"/> : <Text style={s.driverPhotoInitial}>{initial}</Text>}</View>
              <Pressable onPress={() => void choosePhoto()} disabled={busy} style={s.driverPhotoButton} accessibilityRole="button"><SymbolView name={{ ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' }} tintColor={c.primary} size={16}/><Text style={s.driverPhotoButtonText}>{avatar ? 'تغيير الصورة' : 'إضافة صورة شخصية'}</Text></Pressable>
              <Text style={[s.label,s.driverRightText]}>الاسم الكامل</Text><TextInput value={name} onChangeText={setName} maxLength={120} textAlign="right" placeholder="الاسم كما يظهر للزبائن" placeholderTextColor={c.muted} style={s.driverInput} accessibilityLabel="الاسم الكامل للسائق"/>
              <Text style={[s.label,s.driverRightText]}>البريد الإلكتروني</Text><View style={[s.driverReadOnlyField,s.driverRightContent]}><Text selectable style={s.driverEmailText}>{email}</Text><Text style={s.driverFieldHint}>بريد تسجيل الدخول · غير قابل للتعديل</Text></View>
              <Text style={[s.label,s.driverRightText]}>رقم الموبايل السوري <Text style={s.driverRequired}>إلزامي</Text></Text><View style={s.driverPhoneRow}><TextInput value={formatSyrianMobile(phone)} onChangeText={(value) => setPhone(normalizeDigits(value).slice(0, 9))} keyboardType="phone-pad" maxLength={11} textAlign="right" placeholder="944 123 456" placeholderTextColor={c.muted} style={s.driverPhoneInput} accessibilityLabel="رقم الموبايل السوري"/><View style={s.driverCountryCode}><Text style={s.driverCountryCodeText}>+963</Text><Text style={s.driverCountryFlag}>🇸🇾</Text></View></View><Text style={s.driverFieldHint}>اكتب 9 أرقام، مثل 944 123 456. لا تكتب الصفر الأول.</Text>
              <Text style={s.label}>العمر <Text style={s.driverRequired}>إلزامي · 18 سنة أو أكثر</Text></Text><TextInput value={age} onChangeText={(value) => setAge(normalizeDigits(value).slice(0, 2))} keyboardType="number-pad" maxLength={2} textAlign="right" placeholder="العمر بالسنوات" placeholderTextColor={c.muted} style={s.driverInput} accessibilityLabel="عمر السائق"/>
              <Pressable disabled={busy || loading} onPress={() => void save()} style={[s.driverSaveButton, (busy || loading) && s.disabled]} accessibilityRole="button"><Text style={s.driverSaveButtonText}>{busy ? 'عم نحفظ بياناتك…' : 'حفظ التعديلات'}</Text></Pressable>
            </> : <>
              <View style={s.driverIdentityRow}>
                <View style={s.driverIdentityAvatar}>{avatar ? <Image source={{ uri: avatar }} cachePolicy="none" style={s.driverPhotoImage} contentFit="cover" accessibilityLabel="صورة السائق"/> : <Text style={s.driverPhotoInitial}>{initial}</Text>}</View>
                <View style={s.driverIdentityCopy}><View style={s.driverRoleTag}><Text style={s.driverRoleTagText}>سائق توصيل</Text></View><Text style={s.driverIdentityName} numberOfLines={2}>{profile.name || 'أضف اسمك'}</Text><Text selectable style={s.driverIdentityEmail}>{email}</Text></View>
              </View>
              <View style={s.driverIdentityFacts}><View style={s.driverIdentityFact}><Text style={s.driverIdentityFactLabel}>رقم الهاتف</Text><Text style={[s.driverIdentityFactValue,{writingDirection:'ltr'}]}>{profile.phone ? `+963 ${formatSyrianMobile(profile.phone)}` : 'غير مضاف'}</Text></View><View style={s.driverIdentityFact}><Text style={s.driverIdentityFactLabel}>العمر</Text><Text style={s.driverIdentityFactValue}>{profile.age ? `${profile.age} سنة` : 'غير مضاف'}</Text></View></View>
              <Pressable onPress={() => { setName(profile.name); setPhone(profile.phone); setAge(profile.age); setAvatarDraft(null); setEditingProfile(true); }} style={[s.profileSectionAction,s.profileSectionActionPrimary]} accessibilityRole="button"><Text style={[s.profileSectionActionText,s.profileSectionActionTextPrimary]}>تعديل الملف الشخصي</Text><SymbolView name={{ ios: 'pencil', android: 'edit', web: 'edit' }} tintColor={theme === 'light' ? '#17210F' : c.background} size={17}/></Pressable>
            </>}
          </View>
          {!editingProfile&&<>
            <Pressable onPress={onToggleTheme} style={s.profileThemeRow} accessibilityRole="button" accessibilityLabel={theme === 'dark' ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}><View style={s.profileThemeIcon}><SymbolView name={{ ios: theme === 'dark' ? 'sun.max.fill' : 'moon.fill', android: theme === 'dark' ? 'light_mode' : 'dark_mode', web: theme === 'dark' ? 'light_mode' : 'dark_mode' }} tintColor={c.primary} size={20}/></View><View style={s.profileThemeCopy}><Text style={s.profileThemeTitle}>المظهر · {theme === 'dark' ? 'داكن' : 'فاتح'}</Text><Text style={s.profileThemeHint}>اضغط للتبديل إلى الوضع {theme === 'dark' ? 'الفاتح' : 'الداكن'}</Text></View><Text style={s.profileThemeStateText}>تغيير</Text></Pressable>
            <LegalLinksSection theme={theme}/>
            <Pressable onPress={onSignOut} style={s.profileLogout} accessibilityRole="button"><SymbolView name={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' }} tintColor={c.danger} size={18}/><Text style={s.profileLogoutText}>تسجيل الخروج</Text></Pressable>
          </>}
        </> : null}
        </StaggeredSections>
        {(visitedTabs.home || visitedTabs.orders) && !loading && !profileLoadError && (operationsScreen === 'orders' || profileComplete) && <View style={tab === 'home' || tab === 'orders' ? undefined : s.hidden}>
          <DriverOperations key={userId} userId={userId} screen={operationsScreen} profileComplete={profileComplete} onCompleteProfile={() => goTab('profile')} onOpenOrders={() => goTab('orders')}/>
        </View>}
        {tab === 'notifications' && <View style={s.driverPageIntro}><Text style={s.driverHeroEyebrow}>تحديثات طلباتك</Text><Text style={s.accountPageTitle}>التنبيهات</Text><Text style={s.accountPageSubtitle}>كل تنبيه لحاله مع وقت وصوله ورقم الطلب. اضغط عليه لتفتح الطلب.</Text></View>}
        {visitedTabs.notifications && <View style={tab === 'notifications' ? undefined : s.hidden}><EntranceSection transitionKey={tab === 'notifications' ? 'notifications-visible' : 'notifications-hidden'}><NotificationInbox userId={userId} standalone onUnreadCountChange={setNotificationCount} onOpenOrder={() => goTab('orders')}/></EntranceSection></View>}
      </ScrollView>
      <View style={s.driverFooter}>{([{ key: 'home', label: 'الرئيسية', ios: 'house.fill', android: 'home' }, { key: 'orders', label: 'الطلبات', ios: 'shippingbox.fill', android: 'local_shipping' }, { key: 'notifications', label: 'التنبيهات', ios: 'bell.fill', android: 'notifications' }, { key: 'profile', label: 'حسابي', ios: 'person.crop.circle.fill', android: 'person' }] as const).map(({ key, label, ios, android }) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={key === 'notifications' && notificationCount > 0 ? `${label}، ${notificationCount} تنبيه غير مقروء` : label} accessibilityState={{ selected: tab === key }} onPress={() => goTab(key)} style={[s.driverFooterButton, tab === key && s.driverFooterButtonActive]}><View style={s.driverFooterIconWrap}><Animated.View style={[s.footerIcon, { transform: [{ scale: activeTabAnimation === key ? tabScale : 1 }] }]}><SymbolView name={{ ios, android, web: android }} tintColor={tab === key ? (theme === 'light' ? '#17210F' : c.background) : c.muted} size={20}/></Animated.View>{key==='notifications'&&notificationCount>0?<View style={s.driverTabBadge}><Text style={s.driverTabBadgeText}>{notificationCount>99?'99+':notificationCount}</Text></View>:null}</View><Text style={[s.driverFooterLabel, tab === key && s.driverFooterLabelActive]}>{label}</Text></Pressable>)}</View>
    </View>
  </SafeAreaView>;
}

function SignedInHome({ userId, email, inviteToken, openOrderId, onSignOut, theme, onToggleTheme }: { userId: string; email: string; inviteToken?: string; openOrderId?: string; onSignOut: () => void; theme: 'dark' | 'light'; onToggleTheme: () => void }) {
  const { styles: s } = useMobileTheme();
  const online = useInternetAvailable();
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let active = true;
    void hasRegisteredPushToken(userId).then((registered) => {
      if (!active || registered || Platform.OS === 'web') return;
      void enablePushNotifications(userId);
    });
    return () => { active = false; };
  }, [userId]);
  useEffect(() => {
    if (!supabase || !online) return;
    let active = true;
    void (async () => {
      try {
        const [{ data: driver }, { data: roleRows }] = await Promise.all([
          supabase!.from('driver_profiles').select('review_status').eq('user_id', userId).maybeSingle(),
          supabase!.from('user_roles').select('role').eq('user_id', userId),
        ]);
        if (active) { setReviewStatus(driver?.review_status ?? null); setRoles(roleRows?.map((row) => row.role) ?? []); }
      } finally { if (active) setChecked(true); }
    })();
    return () => { active = false; };
  }, [online, userId]);
  if (supabase && online && !checked) return <SafeAreaView style={s.safe}><View accessibilityRole="progressbar" accessibilityLabel="تحميل مساحة حسابك" style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 18 }}><View style={[s.brand, { alignSelf: 'flex-end' }]}><View style={s.brandMark}><Image source={require('../../assets/images/labbayk-delivery-logo.png')} style={s.brandLogo} contentFit="contain" accessibilityLabel="شعار لَبّيك" /></View><View><Text style={s.brandName}>لَبّيك</Text><Text style={s.brandTag}>عم نجهّز مساحتك</Text></View></View><View style={[s.formCard, { minHeight: 164, justifyContent: 'center', gap: 16 }]}><SkeletonBlock width="46%" height={22} /><SkeletonBlock width="88%" height={12} /><SkeletonBlock width="67%" height={12} /></View><View style={[s.formCard, { minHeight: 92, justifyContent: 'center', gap: 14 }]}><SkeletonBlock width="62%" height={13} /><SkeletonBlock width="82%" height={11} /></View></View></SafeAreaView>;
  if (roles.includes('super_admin')) return <AdminWorkspace userId={userId} email={email} onSignOut={onSignOut} theme={theme} onToggleTheme={onToggleTheme}/>;
  if (reviewStatus !== 'approved') return <CustomerHome key={inviteToken ?? 'customer-home'} userId={userId} email={email} inviteToken={inviteToken} openOrderId={openOrderId} showDriverFlow={!!inviteToken || !!reviewStatus} onSignOut={onSignOut} theme={theme} onToggleTheme={onToggleTheme}/>;
  return <DriverWorkspace userId={userId} email={email} onSignOut={onSignOut} theme={theme} onToggleTheme={onToggleTheme}/>;
}

type AdminMobileOrder = Pick<Database['public']['Tables']['orders']['Row'], 'id'|'customer_id'|'category'|'request_text'|'status'|'delivery_fee_minor'|'delivery_quote_set_at'|'driver_id'|'budget_ceiling_minor'|'created_at'>;
type AdminMobileDriver = Pick<Database['public']['Tables']['driver_profiles']['Row'], 'user_id'|'vehicle_description'>;

function AdminWorkspace({ userId, email, onSignOut, theme, onToggleTheme }: { userId: string; email: string; onSignOut: () => void; theme: 'dark'|'light'; onToggleTheme: () => void }) {
  const { colors: color, styles: style } = useMobileTheme();
  const online = useInternetAvailable();
  const [orders, setOrders] = useState<AdminMobileOrder[]>([]);
  const [drivers, setDrivers] = useState<AdminMobileDriver[]>([]);
  const [fees, setFees] = useState<Record<string,string>>({});
  const [reasons, setReasons] = useState<Record<string,string>>({});
  const [selected, setSelected] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(true);
  const [busyOrder, setBusyOrder] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const [orderResult, driverResult] = await Promise.all([
      supabase.from('orders').select('id,customer_id,category,request_text,status,delivery_fee_minor,delivery_quote_set_at,driver_id,budget_ceiling_minor,created_at').order('created_at',{ascending:false}).limit(40),
      supabase.from('driver_profiles').select('user_id,vehicle_description').eq('review_status','approved').eq('is_online',true).order('created_at'),
    ]);
    if (orderResult.error || driverResult.error) setMessage('تعذر تحميل الطلبات أو السائقين. حدّث الصفحة عند عودة الاتصال.');
    else { setOrders(orderResult.data ?? []); setDrivers(driverResult.data ?? []); }
    setLoading(false);
  }, []);

  useEffect(() => { if (online) void refresh(); }, [online, refresh]);
  useEffect(() => {
    if (!supabase) return;
    const channel=supabase.channel(`admin-mobile-orders-${userId}`).on('postgres_changes',{event:'*',schema:'public',table:'orders'},()=>void refresh()).on('postgres_changes',{event:'*',schema:'public',table:'driver_profiles'},()=>void refresh()).subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [refresh,userId]);

  const priceAndRoute = async (order: AdminMobileOrder) => {
    if (!supabase) return;
    const fee=Number(fees[order.id]); const reason=(reasons[order.id]??'').trim(); const driverId=selected[order.id]||null;
    if (!Number.isSafeInteger(fee)||fee<0||fee>100000000) { setMessage('أدخل أجرة توصيل صحيحة.'); return; }
    setBusyOrder(order.id); setMessage('');
    const {data,error}=await supabase.rpc('admin_price_and_dispatch_order',{p_order_id:order.id,p_fee_minor:fee,p_driver_id:driverId,p_reason:reason});
    setBusyOrder('');
    if(error){setMessage('ما قدرنا نحفظ الأجرة أو نرسل الطلب. تأكد من توفر السائق وحاول مرة ثانية.');return;}
    await refresh();
    setMessage(driverId?'تم تحديد الأجرة وإسناد الطلب للسائق المحدد.':data?`تم إرسال العرض إلى ${data} سائق متاح؛ أول من يقبل يحصل على الطلب.`:'تم حفظ الأجرة، ولا يوجد سائق متاح حالياً. أعد الإرسال عند توفر سائق.');
  };

  const card={backgroundColor:color.surface,borderColor:color.border,borderWidth:1,borderRadius:18,padding:15,marginBottom:12} as const;
  const input={minHeight:46,paddingHorizontal:12,borderRadius:12,borderWidth:1,borderColor:color.border,backgroundColor:color.raised,color:color.text,textAlign:'right' as const,fontSize:14} as const;
  const button=(active=false)=>({minHeight:44,alignItems:'center' as const,justifyContent:'center' as const,paddingHorizontal:12,borderRadius:12,backgroundColor:active?color.primary:color.raised,borderWidth:1,borderColor:active?color.primary:color.border});
  return <SafeAreaView style={[style.safe,{flex:1}]}><View style={{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingVertical:10,borderBottomWidth:1,borderBottomColor:color.border}}><View><Text style={{color:color.text,fontSize:20,fontWeight:'900',textAlign:'right'}}>لَبّيك · الإدارة</Text><Text style={{color:color.muted,fontSize:11,textAlign:'right',marginTop:3}}>{email}</Text></View><View style={{flexDirection:'row',gap:8}}><Pressable onPress={onToggleTheme} style={button()}><Text style={{color:color.text,fontSize:12}}>الوضع</Text></Pressable><Pressable onPress={onSignOut} style={button()}><Text style={{color:color.text,fontSize:12}}>خروج</Text></Pressable></View></View>
    <ScrollView contentContainerStyle={{padding:16,paddingBottom:40}}><View style={[card,{backgroundColor:color.raised}]}><Text style={{color:color.text,fontSize:19,fontWeight:'900',textAlign:'right'}}>طلبات الإدارة</Text><Text style={{color:color.muted,fontSize:12,lineHeight:20,textAlign:'right',marginTop:6}}>حدد أجرة التوصيل ثم اسند الطلب لسائق بعينه أو أرسله للجميع. أول سائق يقبل العرض العام يحصل عليه.</Text><Pressable onPress={()=>void refresh()} style={[button(),{marginTop:11}]}><Text style={{color:color.text,fontWeight:'800'}}>تحديث القائمة</Text></Pressable></View>
      {message?<Text accessibilityRole="alert" style={{color:color.primary,textAlign:'right',marginBottom:12}}>{message}</Text>:null}
      {loading?<ActivityIndicator color={color.primary}/>:orders.length?orders.map(order=><View key={order.id} style={card}><View style={{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'}}><Text style={{color:color.text,fontSize:15,fontWeight:'900'}}>{order.category}</Text><Text style={{color:color.muted,fontSize:10}}>#{order.id.slice(0,8)}</Text></View><Text style={{color:color.text,fontSize:13,lineHeight:21,textAlign:'right',marginTop:7}}>{order.request_text}</Text><Text style={{color:color.muted,fontSize:10,textAlign:'right',marginTop:6}}>العميل {order.customer_id?.slice(0,8)??'محذوف'} · ميزانية الشراء {numberFormatter.format(order.budget_ceiling_minor)} ل.س</Text>
        {order.driver_id?<Text style={{color:color.primary,textAlign:'right',marginTop:10}}>أجرة التوصيل {numberFormatter.format(order.delivery_fee_minor)} ل.س · السائق {order.driver_id.slice(0,8)}</Text>:<><Text style={{color:color.muted,fontSize:11,textAlign:'right',marginTop:10}}>{order.delivery_quote_set_at?`الأجرة المحددة ${numberFormatter.format(order.delivery_fee_minor)} ل.س`:'بانتظار تحديد أجرة التوصيل'}</Text>{['requested','quoted','searching'].includes(order.status)&&<><TextInput value={fees[order.id]??(order.delivery_quote_set_at?String(order.delivery_fee_minor):'')} onChangeText={value=>setFees(v=>({...v,[order.id]:value}))} keyboardType="number-pad" placeholder="أجرة التوصيل · ل.س" placeholderTextColor={color.muted} style={[input,{marginTop:10}]} accessibilityLabel="أجرة التوصيل"/><TextInput value={reasons[order.id]??''} onChangeText={value=>setReasons(v=>({...v,[order.id]:value}))} placeholder="سبب التسعير · اختياري" placeholderTextColor={color.muted} style={[input,{marginTop:8}]} accessibilityLabel="سبب التسعير"/>
          <Pressable onPress={()=>setSelected(v=>({...v,[order.id]:''}))} style={[button(!selected[order.id]),{marginTop:10}]}><Text style={{color:!selected[order.id]?color.background:color.text,fontSize:12,fontWeight:'800'}}>إرسال لكل السائقين المتاحين</Text></Pressable>
          {drivers.map(driver=><Pressable key={driver.user_id} onPress={()=>setSelected(v=>({...v,[order.id]:driver.user_id}))} style={[button(selected[order.id]===driver.user_id),{marginTop:7}]}><Text style={{color:selected[order.id]===driver.user_id?color.background:color.text,fontSize:12,fontWeight:'800'}}>إسناد إلى {driver.vehicle_description||'سائق'} · {driver.user_id.slice(0,8)}</Text></Pressable>)}
          <Pressable disabled={busyOrder===order.id||!online} onPress={()=>void priceAndRoute(order)} style={[button(true),{marginTop:10,opacity:busyOrder===order.id||!online?0.55:1}]}><Text style={{color:color.background,fontSize:13,fontWeight:'900'}}>{busyOrder===order.id?'عم نحفظ ونرسل…':selected[order.id]?'تحديد الأجرة وإسناد السائق':'تحديد الأجرة وإرسال العرض'}</Text></Pressable></>}</>}
        </View>):<Text style={{color:color.muted,textAlign:'center',padding:25}}>ما في طلبات حالياً.</Text>}
    </ScrollView>
  </SafeAreaView>;
}

function CustomerHome({ onSignOut, userId, email, inviteToken, openOrderId, showDriverFlow, theme, onToggleTheme }: { onSignOut: () => void; userId: string; email: string; inviteToken?: string; openOrderId?: string; showDriverFlow: boolean; theme: 'dark' | 'light'; onToggleTheme: () => void }) {
  const { colors: c, styles: s } = useMobileTheme();
  const online = useInternetAvailable();
  const [request, setRequest] = useState('');
  const [category, setCategory] = useState('');
  const [budgetCeiling, setBudgetCeiling] = useState('');
  const [tab, setTab] = useState(() => inviteToken ? 'profile' : 'home');
  const [tabHistory, setTabHistory] = useState<string[]>([]);
  const [notificationCount,setNotificationCount]=useState(0);
  const [notificationOrderId,setNotificationOrderId]=useState<string|null>(null);
  const [addressSummary, setAddressSummary] = useState('ما تحدد لسه');
  const [addressId, setAddressId] = useState('');
  const addressIdRef = useRef('');
  const [selectedAddress, setSelectedAddress] = useState<Pick<Address, 'id'|'label'|'street'|'city'|'neighborhood'|'contact_phone'|'building'|'landmark'> | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profileNameDraft, setProfileNameDraft] = useState('');
  const [profileAvatarPath, setProfileAvatarPath] = useState<string | null>(null);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [profileAvatarDraft, setProfileAvatarDraft] = useState<ProfileAvatarDraft | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [, setProfileMessage] = useToastMessage();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const ordersLoaded = useRef(false);
  const [notificationsRefreshKey, setNotificationsRefreshKey] = useState(0);
  const [ordersSyncedAt, setOrdersSyncedAt] = useState('');
  const [ordersAreStale, setOrdersAreStale] = useState(false);
  const [orderActionBusy, setOrderActionBusy] = useState('');
  const [orderActionMessage, setOrderActionMessage] = useToastMessage();
  const [sending, setSending] = useState(false);
  const [requestMessage, setRequestMessage] = useToastMessage();
  const [orderImages, setOrderImages] = useState<OrderImage[]>([]);
  const [pendingOrderId, setPendingOrderId] = useState('');
  const requestKey = useRef(newRequestKey());
  const [draftLoadedFor, setDraftLoadedFor] = useState('');
  const draftReady = draftLoadedFor === userId;
  const [draftSaveError, setDraftSaveError] = useState(false);
  const [tabScale] = useState(() => new Animated.Value(1));
  const [activeTabAnimation, setActiveTabAnimation] = useState('home');
  const navigate = (nextTab: string) => {
    if (nextTab !== 'orders') setNotificationOrderId(null);
    if (nextTab !== tab) setTabHistory((history) => [...history, tab]);
    setTab(nextTab);
    setActiveTabAnimation(nextTab);
    tabScale.setValue(0.82);
    Animated.spring(tabScale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 7 }).start();
  };
  useEffect(() => {
    if (openOrderId) navigate('orders');
  }, [openOrderId]);
  const goBack = () => {
    const previous = tabHistory[tabHistory.length - 1] ?? 'home';
    setTabHistory((history) => history.slice(0, -1));
    setTab(previous);
    setActiveTabAnimation(previous);
  };
  const draftDirty = useRef(false);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.from('driver_profiles').select('user_id').eq('user_id', userId).maybeSingle().then(({ data }) => {
      if (active && data) setTab((current) => current === 'home' ? 'profile' : current);
    });
    return () => { active = false; };
  }, [userId]);
  useEffect(() => {
    let active = true;
    draftDirty.current = false;
    void loadCustomerOrderDraft(userId).then((draft) => {
      if (!active) return;
      if (draft && !draftDirty.current) {
        setRequest(draft.request);
        setCategory(draft.category);
        setBudgetCeiling(draft.budgetCeiling);
        addressIdRef.current = draft.addressId;
        setAddressId(draft.addressId);
        requestKey.current = draft.idempotencyKey;
        setPendingOrderId(draft.pendingOrderId ?? '');
        setOrderImages((draft.images ?? []).map((image) => ({ ...image, uri: '' })));
      }
      setDraftLoadedFor(userId);
    });
    return () => { active = false; };
  }, [userId]);
  useEffect(() => {
    if (!draftReady) return;
    const timeout = setTimeout(() => {
      void saveCustomerOrderDraft(userId, { schemaVersion: 1, savedAt: new Date().toISOString(), request, category, budgetCeiling, addressId, idempotencyKey: requestKey.current, pendingOrderId: pendingOrderId || undefined, images: orderImages.map(({ id, mimeType, extension, uploaded }) => ({ id, mimeType, extension, uploaded })) })
        .then(() => setDraftSaveError(false))
        .catch(() => setDraftSaveError(true));
    }, 250);
    return () => clearTimeout(timeout);
  }, [userId, draftReady, request, category, budgetCeiling, addressId, pendingOrderId, orderImages]);
  useEffect(() => {
    if (!draftReady || tab !== 'home' || !supabase || !online) return;
    let active = true;
    void supabase.from('addresses').select('id,label,city,neighborhood,is_default,street,contact_phone,building,landmark').eq('user_id', userId).order('is_default', { ascending: false }).order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) { setRequestMessage('ما قدرنا نحمّل عنوان التوصيل. العنوان المحفوظ ما تغيّر؛ جرّب تحدّث الصفحة.'); return; }
        const rows = data ?? [];
        const currentAddressId = addressIdRef.current;
        const address = rows.find((row) => row.id === currentAddressId) ?? rows[0];
        const nextAddressId = address?.id ?? '';
        if (currentAddressId && currentAddressId !== nextAddressId) requestKey.current = newRequestKey();
        if (currentAddressId !== nextAddressId) { addressIdRef.current = nextAddressId; setAddressId(nextAddressId); }
        setSelectedAddress((current) => current?.id === address?.id ? current : address ?? null);
        const nextSummary = address ? `${address.label} · ${address.neighborhood}` : 'ما تحدد لسه';
        setAddressSummary((current) => current === nextSummary ? current : nextSummary);
      });
    return () => { active = false; };
  }, [draftReady, online, tab, userId, setRequestMessage]);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.from('profiles').select('display_name,avatar_path').eq('id', userId).maybeSingle().then(async ({ data }) => {
      if (!active) return;
      const name = data?.display_name ?? '';
      const avatarPath = data?.avatar_path ?? null;
      setProfileName(name); setProfileNameDraft(name); setProfileAvatarPath(avatarPath);
      if (!avatarPath) { setProfileAvatarUrl(null); return; }
      const { data: signedAvatar } = await supabase!.storage.from('profile-avatars').createSignedUrl(avatarPath, 60 * 60 * 24 * 30);
      if (active) setProfileAvatarUrl(signedAvatar?.signedUrl ?? null);
    });
    return () => { active = false; };
  }, [userId]);
  const pickProfileAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.78, exif: false });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) { setProfileMessage('حجم الصورة أكبر من 5 ميغابايت. اختار صورة أصغر.'); return; }
    const mimeType = asset.mimeType?.toLowerCase() ?? 'image/jpeg';
    const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' } as Record<string, string>)[mimeType];
    if (!extension) { setProfileMessage('اختار صورة JPEG أو PNG أو WebP أو HEIC.'); return; }
    setProfileAvatarDraft({ uri: asset.uri, mimeType, extension });
    setProfileMessage('اختيرت الصورة. احفظ التعديلات لتثبيتها.');
  };
  const saveProfile = async () => {
    if (!supabase || !online) { setProfileMessage('تعديل الحساب يحتاج اتصالاً بالإنترنت.'); return; }
    if (profileNameDraft.trim().length < 2) { setProfileMessage('اكتب اسمك بشكل صحيح.'); return; }
    setProfileBusy(true); setProfileMessage('');
    let uploadedAvatarPath: string | null = null;
    if (profileAvatarDraft) {
      try {
        const body = await fetch(profileAvatarDraft.uri).then((response) => response.arrayBuffer());
        const path = `${userId}/${newRequestKey()}.${profileAvatarDraft.extension}`;
        const { error: uploadError } = await supabase.storage.from('profile-avatars').upload(path, body, { contentType: profileAvatarDraft.mimeType, cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;
        uploadedAvatarPath = path;
      } catch {
        setProfileBusy(false); setProfileMessage('ما قدرنا نرفع الصورة. جرّب صورة ثانية أو أعد المحاولة.'); return;
      }
    }
    const { data, error } = await supabase.from('profiles').update({ display_name: profileNameDraft.trim(), ...(uploadedAvatarPath ? { avatar_path: uploadedAvatarPath } : {}) }).eq('id', userId).select('display_name,avatar_path').single();
    if (error || !data) {
      if (uploadedAvatarPath) await supabase.storage.from('profile-avatars').remove([uploadedAvatarPath]);
      setProfileBusy(false); setProfileMessage('ما قدرنا نحفظ التعديلات. جرّب مرة ثانية.'); return;
    }
    const previousAvatarPath = profileAvatarPath;
    setProfileName(data.display_name); setProfileNameDraft(data.display_name); setProfileAvatarPath(data.avatar_path); setProfileAvatarDraft(null);
    if (uploadedAvatarPath && data.avatar_path) {
      const { data: signedAvatar } = await supabase.storage.from('profile-avatars').createSignedUrl(data.avatar_path, 60 * 60 * 24 * 30);
      setProfileAvatarUrl(signedAvatar?.signedUrl ?? null);
      if (previousAvatarPath && previousAvatarPath !== data.avatar_path) await supabase.storage.from('profile-avatars').remove([previousAvatarPath]);
    }
    setProfileBusy(false); setProfileMessage('تم حفظ تعديلات الحساب.'); goBack();
  };
  const applyCustomerOrders = useCallback((rows: CustomerOrder[]) => {
    setOrders(rows);
    setOrdersAreStale(false);
    void saveCustomerOrdersSnapshot(userId, rows).then((snapshot) => { if (snapshot) setOrdersSyncedAt(snapshot.syncedAt); }).catch(() => {});
  }, [userId]);
  const fetchCustomerOrders = useCallback(async () => {
    if (!supabase || !online) return null;
    const { data, error } = await supabase.from('orders').select('id,status,category,request_text,delivery_fee_minor,delivery_quote_set_at,delivery_quote_approved_at,budget_ceiling_minor,purchase_amount_minor,purchase_approved_at,created_at').order('created_at', { ascending: false }).limit(30);
    return error ? null : data ?? [];
  }, [online]);
  useEffect(() => {
    if (tab !== 'orders') return;
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let hasServerOrders = false;
    if (!ordersLoaded.current) setOrdersLoading(true);
    void loadCustomerOrdersSnapshot(userId).then((snapshot: CustomerOrderSnapshot | null) => {
      if (!active) return;
      if (!snapshot) { if (!online) { setOrdersAreStale(true); ordersLoaded.current = true; setOrdersLoading(false); } return; }
      if (hasServerOrders) return;
      setOrders(snapshot.orders.map((order) => ({ ...order, request_text: '' })));
      setOrdersSyncedAt(snapshot.syncedAt);
      // The snapshot is a fallback while online data loads; avoid briefly
      // showing the offline notice before the server response is known.
      if (!online) setOrdersAreStale(true);
      ordersLoaded.current = true;
      setOrdersLoading(false);
    });
    const refresh = async () => {
      const rows = await fetchCustomerOrders();
      if (active && rows) { hasServerOrders = true; ordersLoaded.current = true; applyCustomerOrders(rows); }
      else if (active) setOrdersAreStale(true);
      if (active && online) setOrdersLoading(false);
    };
    void refresh();
    if (!online || !supabase) return () => { active = false; };
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { refreshTimer = null; void refresh(); }, 250);
    };
    const channel = supabase.channel(`customer-orders-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_events' }, scheduleRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, scheduleRefresh)
      .subscribe();
    const appStateSubscription = AppState.addEventListener('change', (state) => { if (state === 'active') scheduleRefresh(); });
    return () => { active = false; appStateSubscription.remove(); if (refreshTimer) clearTimeout(refreshTimer); void supabase?.removeChannel(channel); };
  }, [online, tab, userId, fetchCustomerOrders, applyCustomerOrders]);
  const submitOrder = async () => {
    const budget = Number(budgetCeiling);
    if (!draftReady) { setRequestMessage('عم نسترجع مسودتك المحفوظة. جرّب بعد لحظة.'); return; }
    if (!online) { setRequestMessage('إرسال الطلب يحتاج اتصالاً. مسودتك محفوظة على هالجهاز.'); return; }
    if (!supabase) return;
    if (orderImages.some((image) => !image.uploaded && !image.uri)) { setRequestMessage('أعد اختيار الصور التي تحتاج رفعاً، ثم أرسل الطلب لإكماله.'); return; }
    if (!pendingOrderId && !addressReadyForOrder) { setRequestMessage('أضف عنوان تسليم بدمشق أو ريف دمشق حتى نكمل الطلب.'); return; }
    if (!pendingOrderId && (!addressId || !category || !request.trim())) { setRequestMessage('اختار العنوان والقسم واكتب تفاصيل طلبك.'); return; }
    if (!pendingOrderId && (!Number.isSafeInteger(budget) || budget < 1 || budget > 100000000)) { setRequestMessage('حدد سقف ميزانية صحيح بالليرة السورية حتى ما يضطر السائق يدفع مبلغ غير متفق عليه.'); return; }
    await saveCustomerOrderDraft(userId, { schemaVersion: 1, savedAt: new Date().toISOString(), request, category, budgetCeiling, addressId, idempotencyKey: requestKey.current, pendingOrderId: pendingOrderId || undefined, images: orderImages.map(({ id, mimeType, extension, uploaded }) => ({ id, mimeType, extension, uploaded })) }).catch(() => setDraftSaveError(true));
    setSending(true); setRequestMessage('');
    let orderId = pendingOrderId;
    if (!orderId) {
      const { data, error } = await supabase.rpc('create_customer_order', { p_idempotency_key: requestKey.current, p_address_id: addressId, p_category: category, p_request_text: request.trim(), p_budget_ceiling_minor: budget });
      if (error || !data) {
        setSending(false);
        setRequestMessage(error?.message.includes('Damascus and Rif Dimashq') ? 'التوصيل متاح حالياً بدمشق وريف دمشق فقط. عدّل عنوان التسليم.' : 'ما قدرنا نرسل الطلب. تأكد من العنوان والاتصال وحاول مرة ثانية.');
        return;
      }
      orderId = data;
      setPendingOrderId(orderId);
      await saveCustomerOrderDraft(userId, { schemaVersion: 1, savedAt: new Date().toISOString(), request, category, budgetCeiling, addressId, idempotencyKey: requestKey.current, pendingOrderId: orderId, images: orderImages.map(({ id, mimeType, extension, uploaded }) => ({ id, mimeType, extension, uploaded })) }).catch(() => setDraftSaveError(true));
    }
    let existingImageNames = new Set<string>();
    if (orderImages.length) {
      const { data: files, error } = await supabase.storage.from('order-images').list(orderId, { limit: 3, sortBy: { column: 'name', order: 'asc' } });
      if (error) {
        setSending(false);
        setRequestMessage('وصل طلبك، بس ما قدرنا نتحقق من الصور المرفوعة. اضغط إرسال الطلب مرة ثانية للمتابعة بأمان.');
        return;
      }
      existingImageNames = new Set((files ?? []).map((file) => file.name));
    }
    for (const image of orderImages) {
      if (image.uploaded) continue;
      try {
        const imageName = `${image.id}.${image.extension}`;
        if (existingImageNames.has(imageName)) {
          const uploadedImage = { ...image, uploaded: true };
          const updatedImages = orderImages.map((item) => item.id === image.id ? uploadedImage : item);
          setOrderImages(updatedImages);
          await saveCustomerOrderDraft(userId, { schemaVersion: 1, savedAt: new Date().toISOString(), request, category, budgetCeiling, addressId, idempotencyKey: requestKey.current, pendingOrderId: orderId, images: updatedImages.map(({ id, mimeType, extension, uploaded }) => ({ id, mimeType, extension, uploaded })) }).catch(() => setDraftSaveError(true));
          continue;
        }
        const body = await fetch(image.uri).then((response) => response.arrayBuffer());
        if (body.byteLength > 5 * 1024 * 1024) { setSending(false); setRequestMessage('حجم الصورة أكبر من 5 ميغابايت. استبدلها بصورة أصغر قبل المتابعة.'); return; }
        const { error } = await supabase.storage.from('order-images').upload(`${orderId}/${imageName}`, body, { contentType: image.mimeType, cacheControl: '3600', upsert: false });
        if (error) throw error;
        existingImageNames.add(imageName);
        const uploadedImage = { ...image, uploaded: true };
        const updatedImages = orderImages.map((item) => item.id === image.id ? uploadedImage : item);
        setOrderImages(updatedImages);
        await saveCustomerOrderDraft(userId, { schemaVersion: 1, savedAt: new Date().toISOString(), request, category, budgetCeiling, addressId, idempotencyKey: requestKey.current, pendingOrderId: orderId, images: updatedImages.map(({ id, mimeType, extension, uploaded }) => ({ id, mimeType, extension, uploaded })) }).catch(() => setDraftSaveError(true));
      } catch {
        setSending(false);
        setRequestMessage('وصل طلبك، بس ما قدرنا نرفع كل الصور. اضغط إرسال الطلب مرة ثانية لنكمل الرفع بدون إنشاء طلب جديد.');
        return;
      }
    }
    setSending(false);
    await clearCustomerOrderDraft(userId);
    requestKey.current = newRequestKey(); setRequest(''); setCategory(''); setBudgetCeiling(''); setOrderImages([]); setPendingOrderId(''); setRequestMessage('وصلنا طلبك! الإدارة رح تحدد أجرة التوصيل وتتابع إسناده لسائق.'); navigate('orders');
  };
  const pickOrderImages = async () => {
    if (sending) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 3 - orderImages.length, quality: 0.65, exif: false });
    if (result.canceled) return;
    const accepted = result.assets.flatMap((asset) => {
      const mimeType = asset.mimeType?.toLowerCase() ?? 'image/jpeg';
      const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' } as Record<string, string>)[mimeType];
      return extension && (asset.fileSize === undefined || asset.fileSize <= 5 * 1024 * 1024) ? [{ id: newRequestKey(), uri: asset.uri, mimeType, extension, uploaded: false }] : [];
    });
    setOrderImages((current) => [...current, ...accepted].slice(0, 3));
    if (accepted.length < result.assets.length) setRequestMessage('الصور المدعومة: JPEG وPNG وWebP وHEIC، وبحجم أقصى 5 ميغابايت للصورة.');
    else if (accepted.length) setRequestMessage('انضافت الصور لطلبك. فيك تبدّلها أو تحذفها قبل الإرسال.');
  };
  const replaceOrderImage = async (imageId: string) => {
    if (sending) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.65, exif: false });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const mimeType = asset.mimeType?.toLowerCase() ?? 'image/jpeg';
    const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' } as Record<string, string>)[mimeType];
    if (!extension) { setRequestMessage('اختار صورة JPEG أو PNG أو WebP أو HEIC.'); return; }
    if (asset.fileSize !== undefined && asset.fileSize > 5 * 1024 * 1024) { setRequestMessage('حجم الصورة أكبر من 5 ميغابايت. اختار صورة أصغر.'); return; }
    const existingImage = orderImages.find((image) => image.id === imageId);
    if (pendingOrderId && existingImage && existingImage.extension !== extension) { setRequestMessage('اختار صورة بنفس صيغة الملف الأصلي حتى نكمل الرفع دون تكرار الصورة.'); return; }
    setOrderImages((current) => current.map((image) => image.id === imageId ? { ...image, uri: asset.uri, mimeType, extension, uploaded: false } : image));
    setRequestMessage('تبدّلت الصورة.');
  };
  const removeOrderImage = (imageId: string) => {
    setOrderImages((current) => current.filter((image) => image.id !== imageId));
    setRequestMessage('انحذفت الصورة من الطلب.');
  };
  const cancelOrder = async (orderId: string) => {
    if (!supabase) return;
    setOrderActionBusy(orderId); setOrderActionMessage('');
    const { error } = await supabase.rpc('cancel_customer_order', { p_order_id: orderId, p_reason: 'إلغاء بطلب العميل من التطبيق' });
    setOrderActionBusy('');
    if (error) { setOrderActionMessage('ما قدرنا نلغي الطلب بهالمرحلة. تواصل مع الدعم إذا بلش الشراء.'); return; }
    setOrderActionMessage('انلغى الطلب قبل إتمام الشراء.');
    const rows = await fetchCustomerOrders(); if (rows) await applyCustomerOrders(rows);
  };
  const hasAddress = !!addressId;
  const addressReadyForOrder = hasAddress;
  const accountInitial = (profileName.trim()[0] || email.trim()[0] || 'ح').toLocaleUpperCase('ar');
  const displayedOrders = notificationOrderId ? [...orders].sort((left,right) => Number(right.id === notificationOrderId) - Number(left.id === notificationOrderId)) : orders;
  return <SafeAreaView style={s.safe}>
    <View accessibilityRole="main" style={{flex:1}}>
      <View style={s.header}><View style={s.brand}><View style={s.brandMark}><Image source={require('../../assets/images/labbayk-delivery-logo.png')} style={s.brandLogo} contentFit="contain" accessibilityLabel="شعار لَبّيك"/></View><View><Text style={s.brandName}>لَبّيك</Text><Text style={s.brandTag}>اطلب، والباقي علينا.</Text></View></View><View style={s.headerActions}><Pressable onPress={() => navigate('profile')} style={s.accountAvatar} accessibilityRole="button" accessibilityLabel="فتح حسابي">{profileAvatarUrl ? <Image source={{uri:profileAvatarUrl}} cachePolicy="none" style={s.avatarImage} contentFit="cover" accessibilityLabel="صورة الحساب"/> : <Text style={s.accountAvatarText}>{accountInitial}</Text>}</Pressable></View></View>
      <ScrollView key={tab} style={s.bodyScroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <StaggeredSections transitionKey={`${tab}-${tab === 'orders' && ordersLoading ? 'loading' : 'ready'}`}>
      {tab === 'addresses' ? <EntranceSection transitionKey={tab}><AddressBook userId={userId} onBack={goBack} backLabel={`العودة إلى ${tabHistory[tabHistory.length - 1] === 'profile' ? 'حسابي' : 'الرئيسية'}`} onAddressSaved={(address) => { addressIdRef.current = address.id; setAddressId(address.id); setAddressSummary(`${address.label} · ${address.neighborhood}`); setSelectedAddress(address); }} /></EntranceSection> : tab === 'home' ? <>
      {selectedAddress && <Pressable style={s.address} onPress={() => navigate('addresses')} accessibilityRole="button" accessibilityLabel={`تغيير عنوان التوصيل: ${addressSummary}`} accessibilityHint="يفتح تفاصيل العنوان لتعديله"><View style={s.pin}><SymbolView name={{ios:'house.fill',android:'home',web:'home'}} tintColor={theme === 'light' ? '#385616' : c.primary} size={17}/></View><View style={s.addressCopy}><Text style={s.addressEyebrow}>عنوان التوصيل الحالي</Text><Text style={s.addressName} numberOfLines={1}>{addressSummary}</Text></View><View style={s.addressChangeButton}><SymbolView name={{ios:'pencil',android:'edit',web:'edit'}} tintColor="#0B1411" size={14}/><Text numberOfLines={1} style={s.addressChange}>تغيير</Text></View></Pressable>}
      <View style={s.hero}>
        <View style={s.heroCopy}><Text style={s.heroEyebrow}>لَبّيك لاحتياجات يومك</Text><Text style={s.heroTitle}>كل شي ناقصك، بطلب واحد.</Text><Text style={s.heroDescription}>اكتب طلبك ومنهتم بالباقي.</Text></View>
        <View style={s.heroArt} accessibilityElementsHidden><View style={s.heroOrbit}><View style={s.heroCore}><Image source={require('../../assets/images/labbayk-delivery-logo.png')} style={s.heroLogo} contentFit="contain" accessibilityLabel="شعار لَبّيك"/></View><View style={s.heroPin}><Text style={s.heroPinText}>⌖</Text></View><View style={s.heroSpark}/><View style={s.heroDot}/></View></View>
        <View style={s.heroFoot}><View style={s.heroDash}/><Text style={s.heroFootText}>من حارتك لباب بيتك</Text></View>
      </View>
      <View style={s.formCard}><View style={s.formHeader}><View style={s.formStep}><Text style={s.formStepText}>01</Text></View><View style={s.formHeaderCopy}><Text style={s.formTitle}>شو بدك نجيبلك؟</Text><Text style={s.formSubtitle}>اكتب طلبك بالتفصيل، والصورة بتساعدنا نفهمك أسرع.</Text></View><View style={s.cashBadge}><Text style={s.cashBadgeText}>دفع كاش</Text></View></View>{draftSaveError ? <Text style={s.formMessage}>تعذّر حفظ المسودة على هذا الجهاز.</Text> : null}
        <View style={s.formSection}><Text style={s.label}>تفاصيل الطلب</Text><TextInput editable={draftReady && !pendingOrderId} value={request} onChangeText={(value) => { draftDirty.current = true; setRequest(value); }} maxLength={4000} multiline textAlignVertical="top" placeholder="مثال: جرة غاز ممتلئة مع توصيلها للبيت..." placeholderTextColor="#809087" style={[s.input,s.orderRequestInput]} accessibilityLabel="اكتب تفاصيل طلبك" /></View>
        <View style={s.formSection}><View style={s.sectionHead}><Text style={s.label}>اختار القسم</Text><Text style={s.sectionHint}>بيساعدنا نجهّز طلبك</Text></View><View style={[s.chips,s.categoryChips]}>{categories.map((item) => <Pressable key={item} disabled={!draftReady || !!pendingOrderId} onPress={() => { draftDirty.current = true; setCategory(item); if (!request) setRequest(item + ': '); }} style={[s.chip, category === item && s.chipActive]} accessibilityRole="button" accessibilityState={{ selected: category === item, disabled: !draftReady || !!pendingOrderId }}><Text style={[s.chipText, category === item && s.chipTextActive]}>{category === item ? '✓  ' : ''}{item}</Text></Pressable>)}</View></View>
        <View style={s.formSection}><View style={s.sectionHead}><Text style={s.label}>أعلى ميزانية للمشتريات</Text><Text style={s.sectionHint}>حتى يضلّ السعر بإيدك</Text></View><View style={s.moneyField}><TextInput editable={draftReady && !pendingOrderId} value={budgetCeiling ? numberFormatter.format(Number(budgetCeiling)) : ''} onChangeText={(value) => { draftDirty.current = true; setBudgetCeiling(normalizeDigits(value)); }} keyboardType="number-pad" textAlign="left" placeholder="100,000" placeholderTextColor="#809087" style={s.moneyInput} accessibilityLabel="سقف الميزانية بالليرة السورية"/><View style={s.currencyBadge}><Text style={s.currencyBadgeText}>ل.س</Text></View></View><Text style={s.budgetHint}>مثال: 100,000 ليرة سورية</Text></View>
        <View style={s.photoSection}><View style={s.photoHead}><View><Text style={s.label}>صور تساعدنا نفهم طلبك</Text><Text style={s.sectionHint}>اختياري · حتى 3 صور</Text></View><Text style={s.photoCount}>{orderImages.length}/3</Text></View>
          {!!orderImages.length && <View style={s.uploadedPhotoList}>{orderImages.map((image, index) => <View key={image.id} style={s.uploadedPhotoTile}>{image.uri ? <Image source={{ uri: image.uri }} cachePolicy="none" style={s.uploadedPhotoPreview} contentFit="cover" accessibilityLabel={`صورة ${index + 1} من الطلب`}/> : <View style={[s.uploadedPhotoPreview,{alignItems:'center',justifyContent:'center',padding:6}]}><Text style={s.orderImageStatusText}>{image.uploaded ? 'مرفقة بالطلب' : 'أعد اختيار الصورة'}</Text></View>}<View style={s.uploadedPhotoStatus}><View style={[s.imageStatusDot,image.uploaded&&s.imageStatusUploaded]}/><Text style={s.orderImageStatusText}>{image.uploaded ? 'تم الرفع' : image.uri ? 'جاهزة' : 'بانتظار الاختيار'}</Text></View><View style={s.imageActions}><Pressable disabled={sending || (!!pendingOrderId && image.uploaded)} onPress={() => void replaceOrderImage(image.id)} style={s.replaceImageButton} accessibilityRole="button" accessibilityLabel={`${image.uri ? 'استبدال' : 'اختيار'} الصورة ${index + 1}`}><Text style={s.replaceImageText}>{image.uri ? '↻ استبدال' : 'اختيار الصورة'}</Text></Pressable><Pressable disabled={sending || !!pendingOrderId} onPress={() => removeOrderImage(image.id)} style={s.removeImageButton} accessibilityRole="button" accessibilityLabel={`حذف الصورة ${index + 1}`}><Text style={s.removeImageText}>× حذف</Text></Pressable></View></View>)}</View>}
          {orderImages.length < 3 && <Pressable onPress={() => void pickOrderImages()} disabled={sending} style={s.addImageCard} accessibilityRole="button"><View style={s.addImageIcon}><Text style={s.attachmentIcon}>＋</Text></View><View style={s.addImageCopy}><Text style={s.addImageTitle}>إضافة صورة</Text><Text style={s.addImageHint}>من معرض الصور · JPEG أو PNG</Text></View><Text style={s.addImageArrow}>←</Text></Pressable>}
        </View>
      </View>
      <View style={s.note}><Text style={s.noteIcon}>ⓘ</Text><Text style={s.noteText}>بعد إرسال الطلب، الإدارة بتحدد أجرة التوصيل وبتعيّن سائق أو بتبعته للسائقين المتاحين. الدفع كاش عند الاستلام.</Text></View>
      <Pressable disabled={sending || !draftReady || !online} onPress={() => { if (!hasAddress) { navigate('addresses'); return; } void submitOrder(); }} style={[s.submit, (sending || !draftReady || !online)&&s.disabled]} accessibilityRole="button"><Text style={s.submitText}>{!hasAddress?'إضافة عنوان تسليم':!online?'بانتظار الاتصال':sending?'عم نرسل الطلب والصور…':pendingOrderId?'إكمال رفع الصور وإرسال الطلب':'إرسال الطلب'} <Text style={s.submitArrow}>←</Text></Text></Pressable>
      {requestMessage ? <Text accessibilityRole="alert" style={s.requestMessage}>{requestMessage}</Text> : null}
      </> : tab === 'orders' ? <View style={s.orderPage}><StaggeredSections transitionKey={`${tab}-orders`}>
        <View style={[s.ordersIntro,s.ordersIntroCard]}>
          <View style={s.ordersIntroTop}>
            <View style={s.ordersEyebrowLine}><View style={s.ordersEyebrowDot}/><Text style={s.ordersEyebrow}>متابعة الطلبات</Text></View>
            <Pressable onPress={goBack} style={s.ordersBackButton} accessibilityRole="button" accessibilityLabel={`العودة إلى ${tabHistory[tabHistory.length - 1] === 'profile' ? 'حسابي' : 'الرئيسية'}`}><SymbolView name={{ios:'arrow.left',android:'arrow_back',web:'arrow_back'}} tintColor={theme === 'light' ? '#385616' : c.primary} size={15}/><Text style={s.ordersBackButtonText}>{tabHistory[tabHistory.length - 1] === 'profile' ? 'حسابي' : 'الرئيسية'}</Text></Pressable>
          </View>
          <View style={s.ordersIntroMain}>
            <View style={s.ordersIntroCopy}>
              <Text style={s.ordersTitle}>طلباتي</Text>
              <Text style={s.ordersDescription}>كل طلب وتفاصيله وتحديثاته بمكان واحد.</Text>
            </View>
            <View style={s.ordersIntroTools}>
              <View style={s.ordersCountBadge}>{ordersLoading ? <SkeletonBlock width={21} height={22} style={{ alignSelf: 'auto' }} /> : <Text style={s.ordersCountValue}>{orders.length}</Text>}<Text style={s.ordersCountLabel}>طلب</Text></View>
              <Pressable onPress={() => { if (ordersLoading) return; if (!online) { setOrderActionMessage('التحديث يحتاج اتصالاً بالإنترنت.'); return; } setNotificationsRefreshKey((value) => value + 1); setOrdersLoading(true); void fetchCustomerOrders().then((rows) => { if (rows) { applyCustomerOrders(rows); setOrderActionMessage('تم تحديث الطلبات.'); } else setOrderActionMessage('ما قدرنا نحدّث الطلبات. جرّب مرة ثانية.'); }).finally(() => setOrdersLoading(false)); }} accessibilityRole="button" accessibilityLabel="تحديث الطلبات والتنبيهات" style={s.ordersRefreshButton}>
                <SymbolView name={{ios:'arrow.clockwise',android:'refresh',web:'refresh'}} tintColor={c.primary} size={19}/>
              </Pressable>
            </View>
          </View>
        </View>
        {ordersAreStale && <View style={s.offlineOrders}>
          <Text style={s.offlineOrdersTitle}>{ordersSyncedAt ? 'بيانات محفوظة وقديمة للعرض فقط' : 'ما في نسخة محفوظة من طلباتك'}</Text>
          <Text style={s.offlineOrdersCopy}>{ordersSyncedAt ? 'آخر مزامنة ' + shortDateTimeFormatter.format(new Date(ordersSyncedAt)) + ' · الموافقات والإلغاء تحتاج اتصال.' : 'اتصل بالإنترنت حتى نحمّل أحدث حالة لطلباتك.'}</Text>
          {online && <Pressable onPress={() => { void fetchCustomerOrders().then((rows) => rows && applyCustomerOrders(rows)); }} accessibilityRole="button" style={s.retryOrdersButton}>
            <Text style={s.retryOrdersText}>تحديث الطلبات ↻</Text>
          </Pressable>}
        </View>}
        {orderActionMessage ? <Text accessibilityRole="status" style={s.formMessage}>{orderActionMessage}</Text> : null}
        {ordersLoading ? <OrdersSkeleton styles={s} /> : orders.length ? displayedOrders.map((order) => <View key={order.id} style={[s.orderCard,order.id===notificationOrderId&&s.notificationOrderCard]}>
          {order.id===notificationOrderId&&<Text style={s.notificationOrderLabel}>الطلب المرتبط بهذا الإشعار</Text>}
          <View style={s.orderCardHead}>
            <View style={s.orderMeta}>
              <Text style={s.orderMetaId}>طلب #{order.id.slice(0,8)}</Text>
              <Text style={s.orderDate}>{shortDateTimeFormatter.format(new Date(order.created_at))}</Text>
            </View>
            <View style={[s.orderStatusPill,order.status==='cancelled'&&s.orderStatusCancelled]}>
              <View style={[s.orderStatusDot,order.status==='cancelled'&&s.orderStatusDotCancelled]}/>
              <Text style={[s.orderStatus,order.status==='cancelled'&&s.orderStatusTextCancelled]}>{orderStatus[order.status] ?? order.status}</Text>
            </View>
          </View>
          <View style={s.orderRequestBlock}>
            <Text style={s.orderCategory}>{order.category}</Text>
            <Text style={s.orderRequest} numberOfLines={3}>{ordersAreStale ? 'تفاصيل الطلب تظهر عند رجوع الاتصال.' : order.request_text}</Text>
          </View>
          {!ordersAreStale && <OrderImageGallery orderId={order.id}/>}
          <View style={s.orderFacts}>
            <View style={s.orderFact}>
              <Text style={s.orderFactLabel}>أجرة التوصيل</Text>
              <Text style={s.orderFactValue}>{ordersAreStale ? 'يظهر عند الاتصال' : order.delivery_quote_set_at ? numberFormatter.format(order.delivery_fee_minor) + ' ل.س' : 'بانتظار تحديدها من الإدارة'}</Text>
            </View>
            <View style={s.orderFact}>
              <Text style={s.orderFactLabel}>ميزانية المشتريات</Text>
              <Text style={s.orderFactValue}>{ordersAreStale ? 'يظهر عند الاتصال' : numberFormatter.format(order.budget_ceiling_minor) + ' ل.س'}</Text>
            </View>
          </View>
          {!ordersAreStale && order.purchase_amount_minor !== null && <Text style={s.purchaseAmountLine}>المبلغ بعد الشراء: {numberFormatter.format(order.purchase_amount_minor)} ل.س</Text>}
          {order.status === 'delivering' && <Text style={s.offerExpiry}>السائق بالطريق لعندك. رح يصوّر التسليم ويأكده بنفسه، ما بتحتاج تسوي شي.</Text>}
          {(order.status === 'delivered' || order.status === 'settled') && !ordersAreStale && <OrderImageGallery orderId={order.id} bucket="delivery-proofs" label="صورة التسليم"/>}
          {(['requested','quoted','searching','accepted','assigned','awaiting_approval'].includes(order.status) || (order.status === 'shopping' && order.purchase_amount_minor === null)) && <Pressable disabled={orderActionBusy === order.id || !online || ordersAreStale} onPress={() => void cancelOrder(order.id)} style={[s.cancelOrder, (orderActionBusy === order.id || !online || ordersAreStale) && s.disabled]} accessibilityRole="button"><Text style={s.cancelOrderText}>إلغاء الطلب</Text></Pressable>}
          <SupportIssueForm orderId={order.id} status={order.status} disabled={ordersAreStale}/>
        </View>) : <View style={s.empty}>
          <Text style={s.emptyMark}>≋</Text>
          <Text style={s.emptyTitle}>{ordersAreStale ? 'ما في طلبات محفوظة للعرض' : 'ما عندك طلبات حالياً'}</Text>
          <Text style={s.emptyCopy}>{ordersAreStale ? 'اتصل بالإنترنت حتى نحمّل أحدث حالة.' : 'أول طلب إلك رح يظهر هون.'}</Text>
          <Pressable onPress={() => navigate('home')} style={s.profileAction} accessibilityRole="button"><Text style={s.profileActionText}>ابدأ طلب جديد <Text style={s.submitArrow}>←</Text></Text></Pressable>
        </View>}
      </StaggeredSections></View> : tab === 'notifications' ? <View style={s.profilePage}><View style={s.accountIntro}><Text style={s.accountPageTitle}>التنبيهات</Text><Text style={s.accountPageSubtitle}>آخر التحديثات على طلباتك.</Text></View></View> : tab === 'profile-edit' ? <View style={s.profilePage}><StaggeredSections transitionKey={`${tab}-edit`}>
        <Pressable onPress={() => navigate('profile')} style={s.backNavigation} accessibilityRole="button"><Text style={s.backNavigationText}>→ العودة إلى حسابي</Text></Pressable>
        <Text style={s.pageTitle}>تعديل الملف الشخصي</Text>
        <Text style={s.pageDescription}>حدّث اسمك وصورتك. بريدك الإلكتروني للعرض فقط.</Text>
        <View style={s.profileCard}>
          <View style={s.profileEditPhotoWrap}>
            {profileAvatarDraft ? <Image source={{ uri: profileAvatarDraft.uri }} cachePolicy="none" style={s.profileEditPhoto} contentFit="cover" accessibilityLabel="معاينة الصورة الجديدة"/> : profileAvatarUrl ? <Image source={{ uri: profileAvatarUrl }} cachePolicy="none" style={s.profileEditPhoto} contentFit="cover" accessibilityLabel="صورة الحساب"/> : <Text style={s.profileEditInitial}>{accountInitial}</Text>}
          </View>
          <Pressable onPress={() => void pickProfileAvatar()} disabled={profileBusy} style={[s.profilePhotoButton, profileBusy && s.disabled]} accessibilityRole="button"><Text style={s.profilePhotoButtonText}>{profileAvatarDraft || profileAvatarPath ? 'تغيير الصورة' : 'اختيار صورة'}</Text></Pressable>
          <View style={s.accountRoleTag}><Text style={s.accountRoleTagText}>{showDriverFlow ? 'متقدم لمساحة السائق' : 'حساب عميل'}</Text></View>
          <Text style={s.label}>البريد الإلكتروني</Text>
          <View style={s.readOnlyEmail}><Text selectable style={s.readOnlyEmailText}>{email}</Text><Text style={s.readOnlyEmailHint}>بريد تسجيل الدخول · غير قابل للتعديل</Text></View>
          <Text style={s.label}>اسم صاحب الحساب</Text>
          <TextInput value={profileNameDraft} onChangeText={setProfileNameDraft} maxLength={120} placeholder="اكتب اسمك" placeholderTextColor="#839188" textAlign="right" style={s.field} accessibilityLabel="اسم صاحب الحساب"/>
          <Pressable disabled={profileBusy} onPress={() => void saveProfile()} style={[s.saveAddress, profileBusy && s.disabled]} accessibilityRole="button"><Text style={s.saveAddressText}>{profileBusy ? 'عم نحفظ…' : 'حفظ التعديلات'}</Text></Pressable>
        </View>
      </StaggeredSections></View> : <View style={s.profilePage}><StaggeredSections transitionKey={`${tab}-profile`}>
        <View style={s.accountIntro}><Text style={s.accountPageTitle}>حسابي</Text><Text style={s.accountPageSubtitle}>معلوماتك وعنوانك وإعدادات التطبيق بمكان واحد.</Text></View>
        <View style={s.profileSectionCard}>
          <View style={s.profileSectionHeading}><View style={s.profileHeadingIcon}><SymbolView name={{ ios: 'person.crop.circle.fill', android: 'account_circle', web: 'account_circle' }} tintColor={c.primary} size={21}/></View><Text style={s.profileSectionTitle}>الملف الشخصي</Text></View>
          <View style={s.profileIdentityRow}>
            <View style={s.customerIdentityAvatar}>{profileAvatarUrl ? <Image source={{ uri: profileAvatarUrl }} cachePolicy="none" style={s.avatarImage} contentFit="cover" accessibilityLabel="صورة الحساب"/> : <Text style={s.accountAvatarLargeText}>{accountInitial}</Text>}</View>
            <View style={s.profileIdentityCopy}><View style={s.accountRoleTag}><Text style={s.accountRoleTagText}>{showDriverFlow ? 'متقدم لمساحة السائق' : 'حساب عميل'}</Text></View><Text style={s.profileIdentityName} numberOfLines={2}>{profileName || 'حساب لَبّيك'}</Text><Text style={s.profileEmail} numberOfLines={1}>{email}</Text></View>
          </View>
          <Pressable onPress={() => { setProfileNameDraft(profileName); setProfileAvatarDraft(null); navigate('profile-edit'); }} style={[s.profileSectionAction,s.profileSectionActionPrimary]} accessibilityRole="button"><Text style={[s.profileSectionActionText,s.profileSectionActionTextPrimary]}>تعديل الملف الشخصي</Text><SymbolView name={{ ios: 'pencil', android: 'edit', web: 'edit' }} tintColor={theme === 'light' ? '#17210F' : c.background} size={17}/></Pressable>
        </View>
        <View style={s.profileSectionCard}>
          <View style={s.profileSectionHeading}><View style={s.profileHeadingIcon}><SymbolView name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }} tintColor={c.primary} size={21}/></View><Text style={s.profileSectionTitle}>عنوان التوصيل</Text></View>
          {selectedAddress ? <View style={s.profileAddressSummary}><Text style={s.profileAddressName}>{selectedAddress.label}</Text><Text style={s.profileAddressLine}>{selectedAddress.neighborhood}، {selectedAddress.city}</Text><Text style={s.profileAddressLine}>{selectedAddress.street}{selectedAddress.building ? '، بناء ' + selectedAddress.building : ''}</Text><Text style={s.profileAddressPhone}>للتواصل: {selectedAddress.contact_phone}</Text></View> : <View style={s.profileAddressEmpty}><Text style={s.profileAddressEmptyTitle}>ما أضفت عنوان توصيل بعد</Text><Text style={s.profileAddressLine}>أضف عنوانك حتى يصير إرسال الطلب أسرع.</Text></View>}
          <Pressable onPress={() => navigate('addresses')} style={[s.profileSectionAction, !selectedAddress && s.profileSectionActionPrimary]} accessibilityRole="button"><Text style={[s.profileSectionActionText, !selectedAddress && s.profileSectionActionTextPrimary]}>{selectedAddress ? 'إدارة العناوين' : 'إضافة عنوان توصيل'}</Text><SymbolView name={{ ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' }} tintColor={!selectedAddress ? c.background : c.primary} size={17}/></Pressable>
        </View>
        <View style={s.profileSectionCard}>
          <View style={s.profileSectionHeading}><View style={s.profileHeadingIcon}><SymbolView name={{ ios: 'circle.lefthalf.filled', android: 'contrast', web: 'contrast' }} tintColor={c.primary} size={21}/></View><Text style={s.profileSectionTitle}>المظهر</Text></View>
          <Pressable onPress={onToggleTheme} style={s.profileThemeRow} accessibilityRole="button" accessibilityLabel={theme === 'dark' ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}><View style={s.profileThemeIcon}><SymbolView name={{ ios: theme === 'dark' ? 'sun.max.fill' : 'moon.fill', android: theme === 'dark' ? 'light_mode' : 'dark_mode', web: theme === 'dark' ? 'light_mode' : 'dark_mode' }} tintColor={c.primary} size={20}/></View><View style={s.profileThemeCopy}><Text style={s.profileThemeTitle}>الوضع {theme === 'dark' ? 'الداكن' : 'الفاتح'}</Text><Text style={s.profileThemeHint}>اضغط للتبديل إلى الوضع {theme === 'dark' ? 'الفاتح' : 'الداكن'}</Text></View><View style={s.profileThemeState}><Text style={s.profileThemeStateText}>{theme === 'dark' ? 'داكن' : 'فاتح'}</Text></View></Pressable>
        </View>
        <LegalLinksSection theme={theme}/>
        <Pressable onPress={onSignOut} style={s.profileLogout} accessibilityRole="button"><SymbolView name={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' }} tintColor={c.danger} size={19}/><Text style={s.profileLogoutText}>تسجيل الخروج</Text></Pressable>
        {showDriverFlow && <DriverApplicationFlow key={inviteToken ?? 'driver-application'} userId={userId} initialToken={inviteToken}/>}
      </StaggeredSections></View>}
      </StaggeredSections>
      <View style={tab === 'notifications' ? undefined : s.hidden}>
        <NotificationInbox userId={userId} refreshKey={notificationsRefreshKey} standalone={tab === 'notifications'} onUnreadCountChange={setNotificationCount} onOpenOrder={(orderId) => { setNotificationOrderId(orderId); navigate('orders'); }}/>
      </View>
      </ScrollView>
      <View style={s.footer}>
        {[{ key: 'home', label: 'الرئيسية', symbol: 'house.fill' }, { key: 'orders', label: 'طلباتي', symbol: 'list.bullet.rectangle' }, { key: 'notifications', label: 'التنبيهات', symbol: 'bell.fill' }, { key: 'profile', label: 'حسابي', symbol: 'person.crop.circle.fill' }].map(({ key, label, symbol }) => {
          const materialSymbol = (key === 'home' ? 'home' : key === 'orders' ? 'receipt_long' : key === 'notifications' ? 'notifications' : 'person') as AndroidSymbol;
          const selected = tab === key || ((tab === 'addresses' || tab === 'profile-edit') && key === 'profile');
          return <Pressable key={key} accessibilityRole="button" accessibilityLabel={key === 'notifications' && notificationCount > 0 ? `${label}، ${notificationCount} غير مقروء` : label} accessibilityState={{ selected }} onPress={() => navigate(key)} style={[s.footerButton, selected && s.footerButtonActive]}>
            <View style={s.footerIconWrap}><Animated.View style={[s.footerIcon, { transform: [{ scale: activeTabAnimation === key ? tabScale : 1 }] }]}><SymbolView name={{ ios: symbol as SFSymbol, android: materialSymbol, web: materialSymbol }} tintColor={selected ? (theme === 'light' ? '#17210F' : c.background) : c.muted} size={21}/></Animated.View>{key === 'notifications' && notificationCount > 0 ? <View style={s.navigationNotificationBadge}><Text style={s.navigationNotificationBadgeText}>{notificationCount > 99 ? '99+' : notificationCount}</Text></View> : null}</View>
            <Text style={[s.footerItem, selected && s.footerActive]}>{label}</Text>
          </Pressable>;
        })}
      </View>
    </View>
  </SafeAreaView>;
}

function useInternetAvailable() {
  const network = useNetworkState();
  return network.isConnected === true && network.isInternetReachable !== false;
}

function OrderImageGallery({ orderId, bucket = 'order-images', label = 'صور الطلب', defaultOpen = false }: { orderId: string; bucket?: 'order-images' | 'delivery-proofs'; label?: string; defaultOpen?: boolean }) {
  const { styles: s } = useMobileTheme();
  const online = useInternetAvailable();
  const [urls, setUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(defaultOpen);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!expanded || !supabase || !online) return;
    let active = true;
    setLoading(true);
    void supabase.storage.from(bucket).list(orderId, { limit: 3, sortBy: { column: 'name', order: 'asc' } }).then(async ({ data, error }) => {
      if (error || !data?.length) { if (active) { setUrls([]); setLoading(false); } return; }
      const { data: signed, error: signedError } = await supabase!.storage.from(bucket).createSignedUrls(data.map((file) => `${orderId}/${file.name}`), 600);
      if (active) {
        setUrls(signedError ? [] : (signed ?? []).flatMap((item) => item.signedUrl ? [item.signedUrl] : []));
        setLoading(false);
      }
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bucket, expanded, online, orderId]);
  return <View style={s.orderGallery}>
    <Pressable onPress={() => setExpanded((current) => !current)} accessibilityRole="button" accessibilityState={{ expanded }} style={{ minHeight: 38, justifyContent: 'center' }}>
      <Text style={s.orderGalleryTitle}>{expanded ? `إخفاء ${label} ↑` : `عرض ${label} ↓`}</Text>
    </Pressable>
    {expanded && (loading ? <ActivityIndicator color={c.primary}/> : urls.length ? <View style={s.uploadedPhotoList}>{urls.map((uri) => <Pressable key={uri} onPress={() => setSelectedUrl(uri)} accessibilityRole="button" accessibilityLabel="فتح صورة الطلب"><Image source={{ uri }} cachePolicy="none" style={s.orderGalleryImage} contentFit="cover" accessibilityLabel="صورة من الطلب"/></Pressable>)}</View> : <Text style={s.orderGalleryTitle}>{online ? 'ما في صور مرفقة بهالطلب.' : 'الاتصال مطلوب لعرض الصور.'}</Text>)}
    <Modal visible={selectedUrl !== null} transparent animationType="fade" onRequestClose={() => setSelectedUrl(null)}><Pressable onPress={() => setSelectedUrl(null)} style={{flex:1,alignItems:'center',justifyContent:'center',padding:18,backgroundColor:'rgba(0,0,0,0.94)'}}><Text style={{position:'absolute',top:54,right:20,color:'#fff',fontSize:16,fontWeight:'800'}}>إغلاق ✕</Text>{selectedUrl?<Image source={{uri:selectedUrl}} cachePolicy="none" style={{width:'100%',height:'82%'}} contentFit="contain" accessibilityLabel="صورة الطلب بالحجم الكامل"/>:null}</Pressable></Modal>
  </View>;
}

function NetworkStatusBanner() {
  const { colors: c } = useMobileTheme();
  const online = useInternetAvailable();
  const [backendHealth, setBackendHealth] = useState<BackendHealth>(getBackendHealth);
  useEffect(() => subscribeBackendHealth(setBackendHealth), []);
  const message = !online
    ? 'ما في اتصال بالإنترنت. الإجراءات تحتاج اتصالاً، والمسودة تُحفظ محلياً عند نجاح الحفظ.'
    : backendHealth === 'unreachable'
      ? 'تعذّر الاتصال بالخادم. جرّب التحديث بعد قليل؛ قد لا تكون البيانات المعروضة حديثة.'
      : backendHealth === 'degraded'
        ? 'الخادم يستجيب ببطء أو يواجه مشكلة مؤقتة. جرّب التحديث بعد قليل.'
        : '';
  if (!message) return null;
  const light = c.background === lightPalette.background;
  return <View accessibilityRole="alert" style={{ backgroundColor: light ? '#FFF5D9' : '#3A2D18', borderBottomWidth: 1, borderBottomColor: light ? '#E7D39B' : '#745C2C', paddingHorizontal: 16, paddingVertical: 10 }}>
    <Text style={{ color: light ? '#735500' : '#FFE2A0', textAlign: 'center', fontSize: 12, lineHeight: 19 }}>{message}</Text>
  </View>;
}

export default function HomeScreen() {
  const { invite: rawInvite, openOrder: rawOpenOrder } = useLocalSearchParams<{ invite?: string | string[]; openOrder?: string | string[] }>();
  const router = useRouter();
  const inviteFromLink = Array.isArray(rawInvite) ? rawInvite[0] : rawInvite;
  const openOrderId = Array.isArray(rawOpenOrder) ? rawOpenOrder[0] : rawOpenOrder;
  const [inviteToken, setInviteToken] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const colors = theme === 'light' ? lightPalette : tokens.color;
  const styles = useMemo(() => stylesForTheme(styleDefinitions as unknown as Record<string, Record<string, unknown>>, theme), [theme]);
  const themeContext = useMemo(() => ({ colors, styles }), [colors, styles]);
  const applyTheme = useCallback((nextTheme: 'dark' | 'light') => {
    setTheme(nextTheme);
    void AsyncStorage.setItem(mobileThemeKey, nextTheme).catch(() => {});
  }, []);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(mobileThemeKey).then((savedTheme) => {
      if (active && savedTheme === 'light') setTheme('light');
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (typeof document !== 'undefined') { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; }
  }, [theme]);
  useEffect(() => {
    if (!inviteFromLink) return;
    if (/^[a-f0-9]{64}$/i.test(inviteFromLink)) setInviteToken(inviteFromLink.toLowerCase());
    void router.replace('/');
  }, [inviteFromLink, router]);
  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    let active = true;
    const readyTimeout = setTimeout(() => { if (active) setReady(true); }, 5000);
    void supabase.auth.getSession()
      .then(({ data }) => { if (active) setSession(data.session); })
      .catch(() => { if (active) setSession(null); })
      .finally(() => { clearTimeout(readyTimeout); if (active) setReady(true); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, value) => { if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true); setSession(value); });
    return () => { active = false; clearTimeout(readyTimeout); subscription.unsubscribe(); };
  }, []);
  const screen = !supabaseConfigured
    ? <AuthScreen inviteToken={inviteToken || undefined} theme={theme} />
    : !ready
      ? <SafeAreaView style={styles.safe}><ActivityIndicator color={colors.primary} /></SafeAreaView>
      : passwordRecovery
        ? <PasswordRecoveryScreen onDone={() => setPasswordRecovery(false)} theme={theme} />
      : !session
        ? <AuthScreen inviteToken={inviteToken || undefined} theme={theme} />
        : <SignedInHome userId={session.user.id} email={session.user.email ?? ''} inviteToken={inviteToken || undefined} openOrderId={openOrderId} onSignOut={async () => { await Promise.allSettled([clearCustomerOrderDraft(session.user.id), clearCustomerOrdersSnapshot(session.user.id), clearDriverOrdersSnapshot(session.user.id), unregisterPushNotifications(session.user.id), Image.clearDiskCache()]); await supabase?.auth.signOut(); }} theme={theme} onToggleTheme={() => applyTheme(theme === 'dark' ? 'light' : 'dark')} />;
  return <MobileThemeContext.Provider value={themeContext}><ToastProvider theme={theme}><View style={{ flex: 1, backgroundColor: colors.background }}><NetworkStatusBanner />{screen}</View></ToastProvider></MobileThemeContext.Provider>;
}

const styleDefinitions = {
  driverOrderTabs:{flexDirection:'row-reverse',gap:6,marginTop:12,marginBottom:8,padding:6,borderRadius:22,borderWidth:1,borderColor:c.border,backgroundColor:c.raised},driverOrderTab:{flex:1,minWidth:0,minHeight:58,flexDirection:'row-reverse',alignItems:'center',gap:7,paddingHorizontal:9,borderRadius:12,backgroundColor:'transparent',borderWidth:1,borderColor:'transparent'},driverOrderTabSelected:{backgroundColor:c.primary,borderColor:c.primary},driverOrderTabIcon:{width:30,height:30,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:c.surface},driverOrderTabIconSelected:{backgroundColor:'#17210F'},driverOrderTabCopy:{flex:1,minWidth:0},driverOrderTabTitle:{color:c.text,fontSize:13,fontWeight:'900',textAlign:'right'},driverOrderTabTitleSelected:{color:'#17210F'},driverOrderTabHint:{color:c.muted,fontSize:10.5,textAlign:'right',marginTop:3},driverOrderTabHintSelected:{color:'#385616'},driverOrderTabCount:{minWidth:23,height:23,paddingHorizontal:6,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:c.surface,color:c.primary,fontSize:11,fontWeight:'900',textAlign:'center'},driverOrderTabCountSelected:{backgroundColor:'#17210F',color:c.primary},
  driverIncomingCard:{padding:16,marginTop:10,marginBottom:12,borderRadius:22,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},driverActiveCard:{padding:15,marginTop:10,marginBottom:12,borderRadius:18,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},driverIncomingTop:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:10},driverOrderCategoryPill:{paddingHorizontal:10,paddingVertical:7,borderRadius:12,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},driverOrderCategoryPillText:{color:c.text,fontSize:12,fontWeight:'800'},driverFeeHighlight:{alignItems:'flex-end'},driverFeeLabel:{color:c.muted,fontSize:11,textAlign:'right'},driverFeeValue:{color:c.primary,fontSize:23,fontWeight:'900',textAlign:'right',marginTop:2},driverOfferRequest:{color:c.text,fontSize:14,lineHeight:22,fontWeight:'700',textAlign:'right',marginTop:12},driverOfferDestination:{marginTop:13,paddingVertical:4,paddingRight:12,marginRight:8,borderRightWidth:2,borderStyle:'dashed',borderRightColor:c.border},driverOfferSectionTitle:{flexDirection:'row-reverse',alignItems:'center',gap:6},driverDestinationAddress:{color:c.text,fontSize:12,fontWeight:'700',lineHeight:19,textAlign:'right',marginTop:6},driverOfferBudget:{marginTop:9,paddingHorizontal:12,paddingVertical:10,borderRadius:13,backgroundColor:c.raised},driverOfferExpiryRow:{flexDirection:'row-reverse',alignItems:'center',gap:6,marginTop:9},driverOrdersHint:{flexDirection:'row-reverse',alignItems:'center',gap:9,marginTop:10,padding:11,borderRadius:13,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},driverOrdersHintText:{flex:1,color:c.text,fontSize:11,lineHeight:18,textAlign:'right'},driverActiveHead:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:9},driverStatusChip:{maxWidth:'62%',paddingHorizontal:10,paddingVertical:6,borderRadius:12,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},driverStatusChipText:{color:c.primary,fontSize:10,fontWeight:'800',textAlign:'center'},driverOrderFacts:{flexDirection:'row-reverse',gap:8,marginTop:12},driverOrderFact:{flex:1,minWidth:0,padding:11,borderRadius:13,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},driverOrderFactLabel:{color:c.muted,fontSize:10,textAlign:'right'},driverOrderFactValue:{color:c.text,fontSize:12,fontWeight:'900',textAlign:'right',marginTop:4},driverWaitNotice:{marginTop:12,padding:12,borderRadius:13,backgroundColor:'#352D1D',borderWidth:1,borderColor:'#826B39'},driverWaitTitle:{color:'#F5D98F',fontSize:12,fontWeight:'900',textAlign:'right'},driverWaitCopy:{color:'#E4D4AA',fontSize:11,lineHeight:18,textAlign:'right',marginTop:4},driverEmptyIcon:{width:46,height:46,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:c.raised,marginBottom:4},
  driverIdentityRow:{flexDirection:'row-reverse',alignItems:'center',gap:14,paddingBottom:16,borderBottomWidth:1,borderBottomColor:c.border},driverIdentityAvatar:{width:82,height:82,flexShrink:0,overflow:'hidden',alignItems:'center',justifyContent:'center',borderRadius:41,borderWidth:2.5,borderColor:c.primary,backgroundColor:c.raised},driverIdentityCopy:{flex:1,minWidth:0,alignItems:'flex-start',gap:5},driverRoleTag:{paddingHorizontal:9,paddingVertical:4,borderRadius:10,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},driverRoleTagText:{color:c.primary,fontSize:10,fontWeight:'900'},driverIdentityName:{color:c.text,fontSize:18,fontWeight:'900',textAlign:'right'},driverIdentityEmail:{width:'100%',color:c.muted,fontSize:12,textAlign:'right',writingDirection:'ltr'},driverIdentityFacts:{flexDirection:'row-reverse',gap:9,marginTop:14},driverIdentityFact:{flex:1,minWidth:0,padding:12,borderRadius:13,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},driverIdentityFactLabel:{color:c.muted,fontSize:10,textAlign:'right'},driverIdentityFactValue:{color:c.text,fontSize:12,fontWeight:'800',textAlign:'right',marginTop:5},
  ordersIntroCard:{padding:17,borderRadius:22,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},ordersEyebrowLine:{flexDirection:'row-reverse',alignItems:'center',gap:7},ordersEyebrowDot:{width:8,height:8,borderRadius:4,backgroundColor:c.primary},
  addressEyebrow:{color:c.muted,fontSize:10,fontWeight:'700',textAlign:'right'},addressChangeButton:{minWidth:88,minHeight:38,flexShrink:0,flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:5,paddingHorizontal:12,borderRadius:12,backgroundColor:'#B7FF30',borderWidth:1,borderColor:'#A3E51E'},
  notificationItemHeading:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:8},notificationUnreadPill:{minHeight:21,alignItems:'center',justifyContent:'center',paddingHorizontal:8,borderRadius:11,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},notificationUnreadPillText:{color:c.primary,fontSize:10,fontWeight:'900'},
  formHeader:{flexDirection:'row-reverse',alignItems:'center',gap:11,paddingBottom:16,borderBottomWidth:1,borderBottomColor:'#33473b'},formStep:{width:38,height:38,borderRadius:13,backgroundColor:'#B7FF30',alignItems:'center',justifyContent:'center'},formStepText:{color:'#0B1411',fontSize:12,fontWeight:'900'},formHeaderCopy:{flex:1},formTitle:{color:c.text,fontSize:18,fontWeight:'900',textAlign:'right'},formSubtitle:{color:c.muted,fontSize:12,lineHeight:17,textAlign:'right',marginTop:3},cashBadge:{borderRadius:18,paddingHorizontal:10,paddingVertical:6,backgroundColor:'#25382d',borderWidth:1,borderColor:'#405449'},cashBadgeText:{color:'#DFFFAD',fontSize:10,fontWeight:'800'},formSection:{marginTop:19},sectionHead:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',marginBottom:9},sectionHeadLabel:{color:c.text,fontSize:13,fontWeight:'800',textAlign:'right'},sectionHint:{color:'#8fa196',fontSize:11,textAlign:'right'},orderRequestInput:{minHeight:124,backgroundColor:'#121d16',borderColor:'#3b5143',borderRadius:16,fontSize:15,lineHeight:23,textAlign:'right'},categoryChips:{marginTop:0,flexDirection:'row-reverse',gap:9},moneyField:{minHeight:64,flexDirection:'row-reverse',alignItems:'center',gap:11,paddingHorizontal:14,borderRadius:15,borderWidth:1,borderColor:'#42564a',backgroundColor:'#111c16'},moneyInput:{flex:1,minWidth:0,paddingVertical:12,color:c.text,fontSize:20,fontWeight:'800',fontFamily:'Tajawal_800ExtraBold'},currencyBadge:{paddingHorizontal:12,paddingVertical:8,borderRadius:10,backgroundColor:'#283b2d'},currencyBadgeText:{color:'#DFFFAD',fontSize:13,fontWeight:'900'},budgetHint:{color:'#8fa196',fontSize:11,marginTop:7,textAlign:'right'},photoSection:{marginTop:20,paddingTop:17,borderTopWidth:1,borderTopColor:'#33473b'},photoHead:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',marginBottom:12},photoCount:{color:'#DFFFAD',fontSize:12,fontWeight:'800',paddingHorizontal:10,paddingVertical:6,borderRadius:12,backgroundColor:'#26382c'},uploadedPhotoList:{flexDirection:'row-reverse',flexWrap:'wrap',gap:10,marginBottom:10},uploadedPhotoTile:{width:144,padding:7,borderRadius:16,borderWidth:1,borderColor:'#405449',backgroundColor:'#15231a'},uploadedPhotoPreview:{width:'100%',height:102,borderRadius:11,backgroundColor:'#223128'},uploadedPhotoStatus:{position:'absolute',top:13,right:13,flexDirection:'row-reverse',alignItems:'center',gap:5,paddingHorizontal:7,paddingVertical:5,borderRadius:10,backgroundColor:'rgba(11,20,17,.88)'},imageStatusDot:{width:6,height:6,borderRadius:3,backgroundColor:'#F6C76A'},imageStatusUploaded:{backgroundColor:'#B7FF30'},orderImageStatusText:{color:'#fff',fontSize:9,fontWeight:'700'},imageActions:{flexDirection:'row-reverse',gap:6,marginTop:7},replaceImageButton:{flex:1,minHeight:42,alignItems:'center',justifyContent:'center',borderRadius:10,backgroundColor:'#263b2c',borderWidth:1,borderColor:'#547044'},replaceImageText:{color:'#DFFFAD',fontSize:10,fontWeight:'800'},removeImageButton:{flex:1,minHeight:42,alignItems:'center',justifyContent:'center',borderRadius:10,backgroundColor:'#302321',borderWidth:1,borderColor:'#65423a'},removeImageText:{color:'#FFC1AD',fontSize:10,fontWeight:'800'},addImageCard:{minHeight:76,flexDirection:'row-reverse',alignItems:'center',gap:11,paddingHorizontal:13,borderWidth:1,borderStyle:'dashed',borderColor:'#567148',borderRadius:15,backgroundColor:'#17251b'},addImageIcon:{width:42,height:42,borderRadius:13,backgroundColor:'#2c4128',alignItems:'center',justifyContent:'center'},addImageCopy:{flex:1},addImageTitle:{color:'#EAF5EC',fontSize:13,fontWeight:'800',textAlign:'right'},addImageHint:{color:'#91A397',fontSize:10,marginTop:3,textAlign:'right'},addImageArrow:{color:c.primary,fontSize:17},
  tabIconBadge:{width:36,height:36,borderRadius:13,alignItems:'center',justifyContent:'center'},tabIconBadgeActive:{backgroundColor:c.primary},tabIconBadgeIdle:{backgroundColor:'#1D2B24',borderWidth:1,borderColor:'#30443A'},savedManualNotice:{marginTop:12,padding:14,borderRadius:14,borderWidth:1,borderColor:'#826b39',backgroundColor:'#292418'},savedManualTitle:{color:'#f5d98f',fontSize:13,fontWeight:'800',textAlign:'right'},savedManualCopy:{color:'#e4d4aa',fontSize:12,lineHeight:18,textAlign:'right',marginTop:4},formLocationHint:{color:'#B9C7BE',fontSize:12,lineHeight:18,marginTop:-5,marginBottom:15,textAlign:'right'},
  safe: { flex: 1, backgroundColor: c.background }, bodyScroll:{flex:1}, content: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 12, paddingBottom: 28 },
  themeToggle:{width:44,height:44,borderRadius:14,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},headerActions:{position:'absolute',left:14,top:10,flexDirection:'row',alignItems:'center',gap:6},backNavigation:{minHeight:40,alignSelf:'flex-end',flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:7,paddingHorizontal:12,marginBottom:8,borderRadius:12,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},backNavigationText:{color:c.primary,fontSize:12,fontWeight:'800',textAlign:'right'},
  header: { position:'relative',width:'100%',maxWidth:520,alignSelf:'center',height:64,borderBottomWidth:1,borderBottomColor:'#1a2820',backgroundColor:c.background,zIndex:5 }, brand: { position:'absolute',right:22,top:8,flexDirection: 'row-reverse', alignItems: 'center', gap: 9 }, brandMark: { width: 48, height: 48, borderRadius: 13, overflow:'hidden', backgroundColor:'#fff', alignItems: 'center', justifyContent: 'center' }, brandLogo:{width:'100%',height:'100%'}, brandMarkText: { fontSize: 25, fontWeight: '800', color: c.background }, brandName: { color: c.text, fontSize: 17, fontWeight: '800' }, brandTag: { color: c.muted, fontSize: 11, marginTop: 1 }, accountAvatar:{position:'relative',left:0,top:0,width:48,height:48,borderRadius:24,overflow:'hidden',alignItems:'center',justifyContent:'center',backgroundColor:'#27372D',borderWidth:1.5,borderColor:'#B7FF30'},accountAvatarText:{color:'#DFFFAD',fontSize:17,fontWeight:'800'},avatarImage:{width:'100%',height:'100%'},
  address: { flexDirection: 'row-reverse', alignItems: 'center', gap: 9, marginTop: 7, marginBottom: 1, minHeight: 48, paddingVertical: 7, paddingHorizontal: 11, backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border }, pin: { width: 30, height: 30, flexShrink: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: c.raised, borderRadius: 10 }, pinGlyph: { color: c.primary, fontSize: 17 }, addressCopy: { flex: 1, minWidth: 0 }, addressName: { color: c.text, fontSize: 12, fontWeight: '700', textAlign: 'right' }, addressChange: { color: '#0B1411', fontSize: 12, fontWeight: '900', flexShrink: 0 },
  hero: { minHeight: 206, borderRadius: 24, backgroundColor: '#B7FF30', marginTop: 23, marginBottom: 19, padding: 20, overflow: 'hidden', justifyContent: 'center' }, heroCopy: { width: '57%', marginLeft: 'auto', zIndex: 2 }, heroEyebrow: { color: '#43552C', fontSize: 12, fontWeight: '700' }, heroTitle: { color: '#0B1411', fontSize: 23, lineHeight: 31, fontWeight: '800', marginTop: 10 }, heroDescription: { color: '#2F3F27', fontSize: 13, marginTop: 7 }, heroFoot: { position: 'absolute', right: 20, bottom: 17, flexDirection: 'row', alignItems: 'center', gap: 7 }, heroDash: { width: 18, height: 2, backgroundColor: '#526936', borderRadius: 2 }, heroFootText: { color: '#3F512A', fontSize: 11, fontWeight: '700' }, heroArt: { position: 'absolute', left: -7, top: 1, bottom: 0, width: '40%', alignItems: 'center', justifyContent: 'center' }, heroOrbit: { width: 134, height: 134, borderRadius: 67, borderWidth: 1, borderColor: 'rgba(11,20,17,.14)', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-14deg' }] }, heroCore: { width: 84, height: 84, borderRadius: 28, backgroundColor: '#fff', transform: [{ rotate: '14deg' }], alignItems: 'center', justifyContent: 'center', overflow:'hidden', shadowColor: '#31451B', shadowOpacity: .18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 }, heroLogo:{width:80,height:80,borderRadius:23}, heroPin: { position: 'absolute', right: 3, top: 9, height: 35, width: 35, borderRadius: 12, backgroundColor: '#18251A', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '14deg' }] }, heroPinText: { fontSize: 19, color: '#B7FF30' }, heroSpark: { position: 'absolute', left: 5, top: 26, height: 10, width: 10, borderRadius: 4, backgroundColor: '#F7FFE9', transform: [{ rotate: '30deg' }] }, heroDot: { position: 'absolute', right: 24, bottom: 10, height: 8, width: 8, borderRadius: 4, backgroundColor: '#4D622D' },
  formCard: { padding: 17, borderRadius: 18, backgroundColor: c.surface, borderColor: c.border, borderWidth: 1 }, draftNotice: { color: '#b6c3ba', fontSize: 10, marginBottom: 13, textAlign: 'left' }, label: { color: c.text, fontSize: 13, fontWeight: '700', marginBottom: 11, textAlign: 'right' }, input: { fontFamily: 'Tajawal_400Regular', minHeight: 98, borderWidth: 1, borderColor: '#405449', borderRadius: 12, backgroundColor: '#17231c', padding: 13, color: c.text, fontSize: 15, lineHeight: 23, textAlign: 'right' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }, chip: { paddingHorizontal: 16, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 18, borderWidth: 1, borderColor: '#405348', backgroundColor: '#223128' }, chipActive: { backgroundColor: '#344629', borderColor: c.primary }, chipText: { fontSize: 12, color: '#d4ddd7' }, chipTextActive: { color: '#e1ffc0', fontWeight: '700' }, divider: { height: 1, backgroundColor: c.border, marginTop: 16 }, attachment: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 8 }, orderImageList: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 8 }, orderImageTile: { width: 76, height: 76, borderRadius: 11, overflow: 'hidden', backgroundColor: '#223128' }, orderImagePreview: { width: 76, height: 76 }, orderImageStatus: { position: 'absolute', bottom: 2, right: 2, color: '#fff', fontSize: 9, backgroundColor: '#16221b', paddingHorizontal: 4, borderRadius: 4 }, orderImageRemove: { position: 'absolute', top: 2, right: 4, color: '#fff', fontSize: 18, textShadowColor: '#000', textShadowRadius: 3 }, offlineOrders: { padding: 13, marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: '#745C2C', backgroundColor: '#3A2D18', gap: 4 }, offlineOrdersTitle: { color: '#FFE2A0', fontSize: 12, fontWeight: '700' }, offlineOrdersCopy: { color: '#E9D8AA', fontSize: 11, lineHeight: 17 }, orderGallery: { marginTop: 10, gap: 6 }, orderGalleryTitle: { color: c.muted, fontSize: 11 }, orderGalleryImage: { width: 84, height: 84, borderRadius: 10, backgroundColor: '#223128' }, attachmentIcon: { color: c.primary, fontSize: 21 }, attachmentText: { color: c.text, fontSize: 13, fontWeight: '600' }, optional: { color: c.muted, fontSize: 11, fontWeight: '400' }, endArrow: { color: c.muted, marginLeft: 'auto' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 15, paddingHorizontal: 2 }, noteIcon: { color: '#99bd75', fontSize: 15 }, noteText: { color: c.muted, fontSize: 12, lineHeight: 19, flex: 1 }, submit: { height: 54, marginTop: 20, backgroundColor: c.primary, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, submitText: { color: c.background, fontSize: 15, fontWeight: '800' }, submitArrow: { fontSize: 17 }, pending: { color: '#819087', textAlign: 'center', fontSize: 10, lineHeight: 16, marginTop: 9 }, footer: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8, paddingBottom: 6, paddingHorizontal: 12, backgroundColor: c.background }, footerButton: { flex: 1, minWidth: 0, minHeight: 54, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, borderRadius: 14, paddingHorizontal: 2 }, footerButtonActive: { backgroundColor: c.primary }, footerIconWrap: { position: 'relative', width: 25, height: 25, alignItems: 'center', justifyContent: 'center' }, footerIcon: { width: 25, height: 25, alignItems: 'center', justifyContent: 'center' }, footerActive: { color: c.background, fontSize: 10, fontWeight: '800' }, footerItem: { color: c.muted, fontSize: 10, fontWeight: '700', textAlign: 'center' }, navigationNotificationBadge: { position: 'absolute', right: -5, top: -5, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderRadius: 9, backgroundColor: c.primary, borderWidth: 1, borderColor: c.background }, navigationNotificationBadgeText: { color: c.background, fontSize: 8, fontWeight: '900' }, empty: { minHeight: 320, marginTop: 26, borderWidth: 1, borderColor: c.border, borderRadius: 18, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', padding: 24 }, emptyMark: { color: c.primary, backgroundColor: '#344629', overflow: 'hidden', borderRadius: 16, padding: 10, fontSize: 26, fontWeight: '800' }, emptyTitle: { color: c.text, fontWeight: '700', fontSize: 16, marginTop: 18 }, emptyCopy: { color: c.muted, fontSize: 12, marginTop: 7 }, signOut: { marginTop: 22, borderWidth: 1, borderColor: c.danger, borderRadius: 10, paddingHorizontal: 18, minHeight: 44, justifyContent: 'center' }, signOutText: { color: c.danger, fontWeight: '700', fontSize: 13 },
  addressPage:{marginTop:24},addressPageHeader:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:4},backLink:{flexDirection:'row',alignItems:'center',gap:8,minHeight:44,alignSelf:'flex-start'},backArrow:{fontSize:18,color:c.primary},backText:{fontSize:12,color:'#D3EFA4',fontWeight:'700'},pageTitle:{color:c.text,fontSize:25,fontWeight:'800',textAlign:'right',marginTop:0,flexShrink:1},pageDescription:{color:c.muted,fontSize:13,textAlign:'right',marginTop:5,marginBottom:17},savedAddress:{flexDirection:'row-reverse',alignItems:'center',gap:11,padding:14,marginBottom:10,borderRadius:15,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},savedPin:{width:36,height:36,borderRadius:12,backgroundColor:'#344629',alignItems:'center',justifyContent:'center'},savedCopy:{flex:1,alignItems:'flex-start'},savedLabel:{color:c.text,fontSize:14,fontWeight:'700',textAlign:'right'},savedDetail:{color:c.muted,fontSize:11,marginTop:3,textAlign:'right'},deleteAddress:{minWidth:44,minHeight:44,padding:0,alignItems:"center",justifyContent:"center"},deleteText:{color:c.danger,fontSize:11,fontWeight:'700'},sectionTitle:{color:c.text,fontWeight:'800',fontSize:16,marginBottom:17,textAlign:'right'},zoneList:{gap:8,marginBottom:17},zoneOption:{minHeight:44,paddingHorizontal:12,paddingVertical:8,justifyContent:"center",alignItems:'flex-end',borderWidth:1,borderColor:'#405348',borderRadius:12,backgroundColor:'#1A2920'},zoneSelected:{borderColor:c.primary,backgroundColor:'#283922'},zoneName:{color:c.text,fontWeight:'700',fontSize:13,textAlign:'right'},zoneNameSelected:{color:'#DFFFAD'},zoneMeta:{color:c.muted,fontSize:11,marginTop:4},field:{fontFamily:'Tajawal_400Regular',minHeight:48,borderWidth:1,borderColor:'#405449',borderRadius:12,backgroundColor:'#17231c',paddingHorizontal:12,color:c.text,fontSize:14,marginBottom:14},inlineFields:{flexDirection:'row',gap:10},inline:{flex:1},saveAddress:{minHeight:50,borderRadius:13,backgroundColor:c.primary,alignItems:'center',justifyContent:'center',marginTop:5},disabled:{opacity:0.6},saveAddressText:{color:c.background,fontWeight:'800',fontSize:14},noZones:{padding:18,borderRadius:14,backgroundColor:'#17251C',borderWidth:1,borderColor:c.border,alignItems:'center'},noZonesTitle:{color:c.text,fontWeight:'700',fontSize:14},formMessage:{color:'#F6C76A',textAlign:'right',fontSize:12,marginTop:12,lineHeight:19},profileAction:{minHeight:44,borderRadius:12,borderWidth:1,borderColor:c.border,backgroundColor:'#1A2920',paddingHorizontal:15,justifyContent:'center',marginTop:20},profileActionText:{color:'#DFFFAE',fontSize:13,fontWeight:'700'},addressBackButton:{minHeight:38,alignSelf:'center',flexDirection:'row-reverse',alignItems:'center',gap:7,paddingHorizontal:12,borderRadius:12,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},addressBackArrow:{color:c.primary,fontSize:17,fontWeight:'800'},addressBackText:{color:c.primary,fontSize:12,fontWeight:'800'},addressHistoryHero:{flexDirection:'row-reverse',alignItems:'center',gap:12,padding:15,marginTop:12,marginBottom:15,borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},addressHistoryIcon:{width:46,height:46,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:c.raised},addressHistoryCopy:{flex:1,alignItems:'flex-start'},addressHistoryEyebrow:{color:c.accent,fontSize:10,fontWeight:'800',textAlign:'right'},addressHistoryTitle:{color:c.text,fontSize:19,fontWeight:'900',textAlign:'right',marginTop:2},addressHistorySubtitle:{color:c.muted,fontSize:11,lineHeight:17,textAlign:'right',marginTop:3},addressHistoryCount:{minWidth:48,alignItems:'center',justifyContent:'center',paddingHorizontal:8,paddingVertical:7,borderRadius:13,backgroundColor:c.raised},addressHistoryCountNumber:{color:c.primary,fontSize:17,fontWeight:'900'},addressHistoryCountLabel:{color:c.muted,fontSize:9,fontWeight:'700'},addressHistoryButton:{minHeight:70,flexDirection:'row-reverse',alignItems:'center',gap:12,paddingHorizontal:14,marginBottom:17,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},addressHistoryButtonIcon:{width:42,height:42,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:c.raised},addressHistoryButtonCopy:{flex:1,alignItems:'flex-start'},addressHistoryButtonTitle:{color:c.text,fontSize:14,fontWeight:'900',textAlign:'right'},addressHistoryButtonHint:{color:c.muted,fontSize:10,lineHeight:15,textAlign:'right',marginTop:3},addressHistoryButtonEnd:{width:30,height:30,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:c.raised},addressHistoryArrow:{color:c.primary,fontSize:17,fontWeight:'900'},historyAddressCard:{padding:14,marginBottom:11,borderRadius:17,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},historyAddressTop:{flexDirection:'row-reverse',alignItems:'center',gap:10},historyAddressDivider:{height:1,backgroundColor:c.border,marginVertical:11},historyAddressDetail:{color:c.text,fontSize:12,lineHeight:19,textAlign:'right'},historyAddressPhone:{color:c.muted,fontSize:11,marginTop:7,textAlign:'right'},historyEmpty:{minHeight:190,alignItems:'center',justifyContent:'center',padding:22,marginTop:5,borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},historyEmptyIcon:{width:48,height:48,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:c.raised,marginBottom:7},
  ordersIntro:{marginTop:4,marginBottom:12},ordersIntroCopy:{flex:1,minWidth:0},ordersIntroTop:{minHeight:38,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:9},ordersIntroMain:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:12},ordersIntroTools:{flexDirection:'row',alignItems:'center',gap:8},ordersBackButton:{minHeight:36,justifyContent:'center',paddingHorizontal:10,borderRadius:11,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},ordersBackButtonText:{color:c.primary,fontSize:11,fontWeight:'800',textAlign:'right'},ordersEyebrow:{color:c.accent,fontSize:12,fontWeight:'800',textAlign:'right'},ordersTitle:{color:c.text,fontSize:25,fontWeight:'900',textAlign:'right'},ordersDescription:{color:c.muted,fontSize:12,lineHeight:18,textAlign:'right',marginTop:4},ordersCountBadge:{width:58,height:58,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:c.raised,borderWidth:1,borderColor:c.border},ordersCountValue:{color:c.primary,fontSize:22,fontWeight:'900'},ordersCountLabel:{color:c.muted,fontSize:10,fontWeight:'700',marginTop:-2},ordersRefreshButton:{width:44,height:44,flexShrink:0,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:c.raised,borderWidth:1,borderColor:c.border},
  notificationCard:{borderRadius:18,padding:14,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,marginBottom:14},notificationHeader:{flexDirection:'row',alignItems:'center',gap:10},notificationSummary:{flex:1,minWidth:0,minHeight:54,flexDirection:'row',alignItems:'center',gap:9},notificationIcon:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:c.raised,borderWidth:1,borderColor:c.border},notificationCopy:{flex:1,minWidth:0},notificationTitle:{color:c.text,fontSize:14,fontWeight:'900',textAlign:'right'},notificationSubtitle:{color:c.muted,fontSize:11,marginTop:3,textAlign:'right'},notificationCount:{minWidth:30,height:28,paddingHorizontal:8,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:c.raised,borderWidth:1,borderColor:c.border},notificationCountText:{color:c.primary,fontSize:12,fontWeight:'900'},notificationExpandIcon:{width:32,height:32,borderRadius:11,alignItems:'center',justifyContent:'center',backgroundColor:c.raised,borderWidth:1,borderColor:c.border},notificationMarkAll:{minHeight:42,alignSelf:'flex-start',flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:8,paddingHorizontal:13,marginTop:10,borderRadius:13,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},notificationMarkAllText:{color:c.primary,fontSize:12,fontWeight:'800'},notificationList:{borderTopWidth:1,borderTopColor:c.border,marginTop:9},notificationItem:{minHeight:76,flexDirection:'row-reverse',alignItems:'flex-start',gap:10,paddingVertical:12,borderBottomWidth:1,borderBottomColor:c.border},notificationItemRead:{opacity:.62},notificationDot:{width:9,height:9,borderRadius:5,marginTop:5,backgroundColor:c.primary},notificationDotRead:{backgroundColor:c.muted},notificationItemCopy:{flex:1},notificationItemTitle:{color:c.text,fontSize:13,fontWeight:'800',textAlign:'right'},notificationItemBody:{color:c.muted,fontSize:12,lineHeight:18,marginTop:4,textAlign:'right'},notificationItemMeta:{color:c.muted,fontSize:10,marginTop:6,textAlign:'right'},notificationEmpty:{color:c.muted,fontSize:12,textAlign:'center',paddingVertical:16},
  ordersLoading:{minHeight:190,alignItems:'center',justifyContent:'center',gap:10},retryOrdersButton:{minHeight:44,alignSelf:'flex-start',justifyContent:'center',marginTop:8,paddingHorizontal:12,borderRadius:12,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},retryOrdersText:{color:c.primary,fontSize:12,fontWeight:'800'},
  orderCardHead:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:10},orderMeta:{flex:1,alignItems:'flex-start'},orderMetaId:{color:c.muted,fontSize:10,fontWeight:'700'},orderStatusPill:{minHeight:34,maxWidth:'67%',flexDirection:'row-reverse',alignItems:'center',gap:7,paddingHorizontal:10,borderRadius:18,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},orderStatusDot:{width:8,height:8,borderRadius:4,backgroundColor:c.primary},orderStatusCancelled:{backgroundColor:c.raised,borderColor:c.danger},orderStatusDotCancelled:{backgroundColor:c.danger},orderStatusTextCancelled:{color:c.danger},orderRequestBlock:{marginTop:13,padding:13,borderRadius:14,backgroundColor:c.raised},orderFacts:{flexDirection:'row-reverse',gap:9,marginTop:12},orderFact:{flex:1,minWidth:0,padding:11,borderRadius:13,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},orderFactLabel:{color:c.muted,fontSize:10,textAlign:'right'},orderFactValue:{color:c.text,fontSize:12,fontWeight:'800',textAlign:'right',marginTop:5},purchaseAmountLine:{color:c.accent,fontSize:11,fontWeight:'800',textAlign:'right',marginTop:10},
  requestMessage:{color:'#DFFFAD',fontSize:12,textAlign:'center',lineHeight:20,marginTop:11},orderPage:{marginTop:23},orderCard:{borderRadius:15,padding:15,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,marginBottom:10},notificationOrderCard:{borderColor:c.primary,borderWidth:2},notificationOrderLabel:{alignSelf:'flex-start',color:c.background,backgroundColor:c.primary,fontSize:10,fontWeight:'900',paddingHorizontal:9,paddingVertical:5,borderRadius:9,marginBottom:10},orderTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10},orderCategory:{color:c.text,fontWeight:'800',fontSize:14},orderStatus:{color:c.primary,fontSize:10,fontWeight:'800',flexShrink:1},orderRequest:{color:c.muted,fontSize:13,lineHeight:20,marginTop:6,textAlign:'right'},orderBottom:{borderTopWidth:1,borderTopColor:c.border,marginTop:12,paddingTop:10,flexDirection:'row',justifyContent:'space-between',gap:8},orderDate:{color:c.muted,fontSize:10},orderFee:{color:'#B7D58D',fontSize:10},reviewActions:{flexDirection:'row',gap:9,marginTop:12},approvePurchase:{flex:1,minHeight:42,borderRadius:11,backgroundColor:c.primary,alignItems:'center',justifyContent:'center'},rejectPurchase:{flex:1,minHeight:44,borderRadius:11,borderWidth:1,borderColor:'#755544',backgroundColor:'#28221e',alignItems:'center',justifyContent:'center'},rejectPurchaseText:{color:'#ffc6a9',fontSize:12,fontWeight:'700'},deliveryCode:{color:c.primary,fontSize:28,fontWeight:'800',letterSpacing:8,textAlign:'center',paddingVertical:8,marginTop:8,backgroundColor:'#263621',borderRadius:12},profilePage:{marginTop:23,gap:13},driverApplyCard:{borderRadius:18,padding:17,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},driverApplyMark:{width:38,height:38,borderRadius:12,backgroundColor:'#344629',alignItems:'center',justifyContent:'center',marginBottom:12},driverApplyIcon:{color:c.primary,fontSize:19},driverApplyTitle:{color:c.text,fontSize:16,fontWeight:'800',textAlign:'right'},driverApplyCopy:{color:c.muted,fontSize:12,lineHeight:20,textAlign:'right',marginTop:6,marginBottom:16},driverStatus:{alignSelf:'flex-start',marginTop:13,borderRadius:20,overflow:'hidden',paddingHorizontal:12,paddingVertical:6,backgroundColor:'#2d4028',color:'#DFFFAD',fontSize:11,fontWeight:'700'},
  driverPanel:{borderRadius:20,padding:16,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},driverPanelTop:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:12},driverRefresh:{width:44,height:44,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#233229'},driverRefreshGlyph:{fontSize:20,color:c.primary},driverStatsRow:{flexDirection:'row-reverse',gap:10,marginBottom:14},driverStat:{flex:1,minHeight:68,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',paddingHorizontal:13,borderRadius:14,backgroundColor:'#18261e',borderWidth:1,borderColor:'#304439'},driverStatValue:{color:c.primary,fontSize:22,fontWeight:'900'},driverStatLabel:{color:'#B8C7BD',fontSize:11,fontWeight:'700'},driverWelcome:{marginTop:14,marginBottom:16,padding:18,borderRadius:20,backgroundColor:'#17271d',borderWidth:1,borderColor:'#344a38'},driverAppearanceCard:{padding:13,marginBottom:14,borderRadius:17,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},driverSettingsTitle:{color:c.text,fontSize:13,fontWeight:'900',textAlign:'right',marginBottom:9},driverWelcomeKicker:{color:c.primary,fontSize:11,fontWeight:'800',textAlign:'right'},driverWelcomeTitle:{color:c.text,fontSize:22,fontWeight:'900',textAlign:'right',marginTop:5},driverWelcomeCopy:{color:c.muted,fontSize:12,lineHeight:19,textAlign:'right',marginTop:5},driverContent:{width:'100%',maxWidth:520,alignSelf:'center',paddingHorizontal:20,paddingTop:4,paddingBottom:32},driverLogout:{position:'relative',left:0,top:0,minWidth:48,minHeight:40,paddingHorizontal:11,borderRadius:12,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center',backgroundColor:'#17231c'},driverLogoutText:{color:'#DFFFAD',fontSize:11,fontWeight:'800'},availabilityButton:{minHeight:68,flexDirection:'row-reverse',alignItems:'center',justifyContent:'flex-start',gap:11,paddingHorizontal:14,borderRadius:15,backgroundColor:'#202c25',borderWidth:1,borderColor:'#46534a',marginTop:10,marginBottom:16},availabilityOn:{backgroundColor:'#213323',borderColor:'#A5D46A'},availabilityDot:{width:12,height:12,borderRadius:6,backgroundColor:'#87978b'},availabilityDotOn:{backgroundColor:'#B7FF30'},availabilityCopy:{flex:1,alignItems:'flex-start',gap:4},availabilityText:{fontSize:13,fontWeight:'800',color:'#D1D9D3',textAlign:'right'},availabilityTextOn:{color:'#DFFFAD'},availabilityHint:{color:'#99AA9E',fontSize:10,textAlign:'right'},availabilityArrow:{color:c.primary,fontSize:17,fontWeight:'800'},driverOffersHead:{flexDirection:'row-reverse',alignItems:'center',gap:9,marginTop:17,marginBottom:12},offerCount:{color:c.primary,fontSize:11,fontWeight:'800'},offerCard:{borderRadius:16,padding:15,backgroundColor:'#17241C',borderWidth:1,borderColor:'#34473A',marginBottom:11},offerExpiry:{color:'#F0CC83',fontSize:10,marginTop:8},acceptOffer:{flex:1.5,minHeight:50,borderRadius:15,backgroundColor:c.primary,alignItems:'center',justifyContent:'center'},acceptOfferText:{color:'#0B1411',fontWeight:'900',fontSize:14},declineOffer:{flex:1,minHeight:50,borderRadius:15,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},declineOfferText:{color:c.muted,fontSize:14,fontWeight:'800'},cancelOrder:{minHeight:44,borderRadius:10,borderWidth:1,borderColor:'#63443a',alignItems:'center',justifyContent:'center',marginTop:10,backgroundColor:'#261d1a'},cancelOrderText:{color:'#ffc6a9',fontSize:11,fontWeight:'700'},noOffers:{minHeight:210,borderRadius:22,backgroundColor:c.surface,borderWidth:1.5,borderStyle:'dashed',borderColor:c.border,alignItems:'center',justifyContent:'center',padding:18,marginBottom:15},noOffersGlyph:{color:c.primary,fontSize:23},noOffersTitle:{color:c.text,fontWeight:'900',fontSize:18,marginTop:14},noOffersCopy:{color:c.muted,textAlign:'center',fontSize:14,lineHeight:23,marginTop:6},dropoff:{borderTopWidth:1,borderTopColor:c.border,marginTop:12,paddingTop:11},dropoffTitle:{color:'#DFFFAD',fontSize:11,fontWeight:'800'},dropoffText:{color:'#C4D0C8',fontSize:11,lineHeight:18,marginTop:4},dropoffPhone:{color:c.primary,fontSize:12,fontWeight:'800',marginTop:6,textAlign:'left'},
  profileCard:{borderRadius:18,padding:17,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},profileCardTop:{flexDirection:'row-reverse',alignItems:'center',gap:12,marginBottom:18},accountAvatarLarge:{width:52,height:52,borderRadius:26,overflow:'hidden',alignItems:'center',justifyContent:'center',backgroundColor:'#2b3c30',borderWidth:1,borderColor:c.primary},accountAvatarLargeText:{color:'#DFFFAD',fontSize:21,fontWeight:'800'},profileEmail:{color:c.muted,fontSize:12,marginTop:3,textAlign:'right'},profileEditPhotoWrap:{width:96,height:96,alignSelf:'center',marginTop:3,marginBottom:12,borderRadius:48,overflow:'hidden',alignItems:'center',justifyContent:'center',backgroundColor:'#2b3c30',borderWidth:2,borderColor:c.primary},profileEditPhoto:{width:'100%',height:'100%'},profileEditInitial:{color:'#DFFFAD',fontSize:34,fontWeight:'900'},profilePhotoButton:{minHeight:44,alignSelf:'center',justifyContent:'center',paddingHorizontal:16,marginBottom:19,borderRadius:13,borderWidth:1,borderColor:c.border,backgroundColor:c.raised},profilePhotoButtonText:{color:c.primary,fontSize:12,fontWeight:'800'},readOnlyEmail:{minHeight:52,justifyContent:'center',paddingHorizontal:13,marginBottom:16,borderRadius:12,borderWidth:1,borderColor:c.border,backgroundColor:c.raised},readOnlyEmailText:{color:c.text,fontSize:14,textAlign:'left'},readOnlyEmailHint:{color:c.muted,fontSize:10,textAlign:'right',marginTop:3},appearanceSetting:{minHeight:62,flexDirection:'row-reverse',alignItems:'center',gap:11,padding:11,borderRadius:14,borderWidth:1,borderColor:c.border,backgroundColor:c.raised},appearanceIcon:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:c.surface},appearanceCopy:{flex:1,alignItems:'flex-start'},appearanceTitle:{color:c.text,fontSize:13,fontWeight:'800',textAlign:'right'},appearanceHint:{color:c.muted,fontSize:10,marginTop:3,textAlign:'right'},appearanceArrow:{color:c.primary,fontSize:17,fontWeight:'800'},missingAddress:{flexDirection:'row-reverse',flexWrap:'wrap',alignItems:'center',gap:12,marginTop:14,marginBottom:16,padding:15,borderRadius:18,borderWidth:1,borderColor:'#456139',backgroundColor:'#1b2b20'},missingAddressIcon:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#2e4327'},missingAddressGlyph:{color:c.primary,fontSize:22},missingAddressCopy:{flex:1,minWidth:170},missingAddressTitle:{color:c.text,fontSize:15,fontWeight:'800',textAlign:'right'},missingAddressText:{color:c.muted,fontSize:12,lineHeight:18,textAlign:'right',marginTop:3},missingAddressButton:{width:'100%',minHeight:48,borderRadius:13,backgroundColor:c.primary,alignItems:'center',justifyContent:'center'},missingAddressButtonText:{color:c.background,fontSize:14,fontWeight:'800'},inputDisabled:{opacity:.48},chipDisabled:{opacity:.42},addressActions:{alignItems:'center'},editAddressText:{color:'#DFFFAD',fontSize:11,fontWeight:'700'},cancelEdit:{minHeight:44,alignItems:'center',justifyContent:'center',marginTop:7},
  accountIntro:{marginTop:2,marginBottom:3},accountPageTitle:{color:c.text,fontSize:26,fontWeight:'900',textAlign:'right'},accountPageSubtitle:{color:c.muted,fontSize:13,textAlign:'right',marginTop:4},profileSectionCard:{borderRadius:19,padding:15,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},profileSectionHeading:{flexDirection:'row-reverse',alignItems:'center',gap:9,marginBottom:14},profileHeadingIcon:{width:34,height:34,borderRadius:11,alignItems:'center',justifyContent:'center',backgroundColor:c.raised},profileSectionTitle:{color:c.text,fontWeight:'800',fontSize:16,textAlign:'right',flex:1},profileSectionTag:{color:c.primary,fontSize:10,fontWeight:'800',paddingHorizontal:9,paddingVertical:5,borderRadius:12,backgroundColor:c.raised,overflow:'hidden'},accountRoleTag:{alignSelf:'flex-start',paddingHorizontal:9,paddingVertical:5,borderRadius:11,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},accountRoleTagText:{color:c.primary,fontSize:10,fontWeight:'800'},customerIdentityAvatar:{width:68,height:68,borderRadius:34,overflow:'hidden',alignItems:'center',justifyContent:'center',backgroundColor:c.raised,borderWidth:2,borderColor:c.primary},profileIdentityRow:{flexDirection:'row-reverse',alignItems:'center',gap:12,paddingBottom:13,borderBottomWidth:1,borderBottomColor:c.border},profileIdentityCopy:{flex:1,alignItems:'flex-start',minWidth:0},profileIdentityName:{color:c.text,fontSize:16,fontWeight:'800',textAlign:'right',marginTop:7},profileSectionAction:{minHeight:46,marginTop:12,paddingHorizontal:13,borderRadius:13,borderWidth:1,borderColor:c.border,backgroundColor:c.raised,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:10},profileSectionActionText:{color:c.primary,fontSize:13,fontWeight:'800'},profileSectionActionPrimary:{backgroundColor:c.primary,borderColor:c.primary,justifyContent:'center'},profileSectionActionTextPrimary:{color:c.background},profileAddressSummary:{padding:13,borderRadius:14,backgroundColor:c.raised,borderWidth:1,borderColor:c.border,alignItems:'flex-start'},profileAddressName:{color:c.text,fontSize:14,fontWeight:'800',textAlign:'right'},profileAddressLine:{color:c.muted,fontSize:12,lineHeight:19,textAlign:'right',marginTop:3},profileAddressPhone:{color:c.accent,fontSize:11,fontWeight:'700',textAlign:'right',marginTop:7},profileAddressEmpty:{paddingVertical:3,alignItems:'flex-start'},profileAddressEmptyTitle:{color:c.text,fontSize:13,fontWeight:'800',textAlign:'right'},profileThemeRow:{minHeight:66,flexDirection:'row-reverse',alignItems:'center',gap:11,padding:11,borderRadius:14,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},profileThemeIcon:{width:40,height:40,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:c.surface},profileThemeCopy:{flex:1,alignItems:'flex-start'},profileThemeTitle:{color:c.text,fontSize:13,fontWeight:'800',textAlign:'right'},profileThemeHint:{color:c.muted,fontSize:11,marginTop:3,textAlign:'right'},profileThemeState:{minWidth:48,minHeight:30,alignItems:'center',justifyContent:'center',paddingHorizontal:9,borderRadius:10,backgroundColor:c.raised},profileThemeStateText:{color:c.primary,fontSize:11,fontWeight:'800'},profileLogout:{minHeight:48,marginTop:12,flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:9,paddingHorizontal:14,borderRadius:14,borderWidth:1,borderColor:c.danger,backgroundColor:c.raised},profileLogoutText:{color:c.danger,fontSize:13,fontWeight:'800'},
  driverHeaderProfile:{position:'absolute',left:18,top:6,minWidth:58,minHeight:52,alignItems:'center',justifyContent:'center',gap:2},driverHeaderAvatar:{width:42,height:42,borderRadius:21,overflow:'hidden',alignItems:'center',justifyContent:'center',backgroundColor:c.raised,borderWidth:2,borderColor:c.primary},driverHeaderHint:{color:c.muted,fontSize:9,fontWeight:'700'},driverHero:{minHeight:92,flexDirection:'row-reverse',alignItems:'center',gap:14,padding:15,marginTop:10,marginBottom:12,borderRadius:24,backgroundColor:'#213D29',borderWidth:1,borderColor:'#57763D',overflow:'hidden'},driverHeroOrb:{width:54,height:54,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#B7FF30'},driverHeroCopy:{flex:1,alignItems:'flex-start'},driverHeroEyebrow:{color:c.primary,fontSize:12,fontWeight:'900',textAlign:'right'},driverHeroTitle:{color:c.text,fontSize:19,fontWeight:'900',textAlign:'right',marginTop:5},driverHeroSubtitle:{color:c.muted,fontSize:11,lineHeight:18,textAlign:'right',marginTop:5},driverPageIntro:{width:'100%',marginTop:14,marginBottom:18,paddingHorizontal:2,alignItems:'flex-end'},driverProfileLoading:{minHeight:75,alignItems:'center',justifyContent:'center',gap:8,marginBottom:12,borderRadius:16,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},driverProfileCard:{padding:17,marginTop:4,marginBottom:18,borderRadius:22,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},driverPhotoRing:{width:104,height:104,alignSelf:'center',overflow:'hidden',alignItems:'center',justifyContent:'center',marginTop:5,borderRadius:52,borderWidth:3,borderColor:c.primary,backgroundColor:c.raised},driverPhotoImage:{width:'100%',height:'100%'},driverPhotoInitial:{color:c.primary,fontSize:38,fontWeight:'900'},driverPhotoButton:{minHeight:42,alignSelf:'center',flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:7,paddingHorizontal:13,marginTop:10,marginBottom:18,borderRadius:13,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},driverPhotoButtonText:{color:c.primary,fontSize:12,fontWeight:'800'},driverRightText:{width:'100%',textAlign:'right'},driverRightContent:{alignItems:'flex-end'},driverInput:{minHeight:54,marginTop:7,marginBottom:14,paddingHorizontal:14,borderRadius:14,borderWidth:1,borderColor:c.border,backgroundColor:c.raised,color:c.text,fontSize:15,fontWeight:'700',fontFamily:'Tajawal_700Bold',textAlign:'right'},driverReadOnlyField:{minHeight:58,justifyContent:'center',paddingHorizontal:13,marginTop:7,marginBottom:14,borderRadius:14,borderWidth:1,borderColor:c.border,backgroundColor:c.raised},driverEmailText:{color:c.text,fontSize:13,textAlign:'right',writingDirection:'ltr'},driverFieldHint:{width:'100%',color:c.muted,fontSize:10,textAlign:'right',marginTop:5},driverPhoneRow:{minHeight:56,flexDirection:'row',alignItems:'center',gap:9,marginTop:7,borderRadius:14,borderWidth:1,borderColor:c.border,backgroundColor:c.raised,paddingHorizontal:10},driverPhoneInput:{flex:1,minWidth:0,minHeight:50,paddingHorizontal:6,color:c.text,fontSize:16,fontWeight:'800',textAlign:'right',writingDirection:'ltr'},driverCountryCode:{minHeight:38,flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:10,borderRadius:11,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},driverCountryCodeText:{color:c.text,fontSize:13,fontWeight:'900'},driverCountryFlag:{fontSize:17},driverRequired:{color:c.accent,fontSize:10,fontWeight:'800'},driverSaveButton:{minHeight:54,alignItems:'center',justifyContent:'center',marginTop:8,marginBottom:16,borderRadius:15,backgroundColor:c.primary},driverSaveButtonText:{color:c.background,fontSize:15,fontWeight:'900'},completeDriverProfile:{minHeight:56,alignItems:'center',justifyContent:'center',marginTop:12,marginBottom:14,paddingHorizontal:12,borderRadius:15,backgroundColor:c.primary},completeDriverProfileText:{color:c.background,fontSize:13,fontWeight:'900',textAlign:'center'},driverOrdersShortcut:{minHeight:69,flexDirection:'row-reverse',alignItems:'center',gap:11,paddingHorizontal:13,marginTop:3,marginBottom:13,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},driverShortcutIcon:{width:42,height:42,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:c.raised},driverShortcutTitle:{color:c.text,fontSize:13,fontWeight:'900',textAlign:'right'},driverShortcutCopy:{color:c.muted,fontSize:10,marginTop:4,textAlign:'right'},driverOnboardingCard:{width:'100%',marginTop:18,padding:20,borderRadius:23,borderWidth:1,borderColor:'#597344',backgroundColor:'#1B2B20'},driverOnboardingIcon:{width:58,height:58,alignSelf:'flex-end',alignItems:'center',justifyContent:'center',marginBottom:16,borderRadius:19,backgroundColor:c.primary},driverOnboardingStep:{color:c.accent,fontSize:11,fontWeight:'900',textAlign:'right'},driverOnboardingTitle:{color:c.text,fontSize:25,fontWeight:'900',textAlign:'right',marginTop:5},driverOnboardingCopy:{color:c.muted,fontSize:13,lineHeight:22,textAlign:'right',marginTop:8},driverOnboardingList:{gap:12,marginTop:21,padding:15,borderRadius:16,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},driverOnboardingListItem:{color:c.text,fontSize:12,lineHeight:20,fontWeight:'700',textAlign:'right'},driverOnboardingButton:{minHeight:56,alignItems:'center',justifyContent:'center',marginTop:19,borderRadius:15,backgroundColor:c.primary},driverOnboardingButtonText:{color:c.background,fontSize:14,fontWeight:'900'},

  driverHomePanel:{padding:0,borderWidth:0,borderRadius:0,backgroundColor:'transparent'},driverAvailabilityHero:{padding:16,marginBottom:14,borderRadius:21,borderWidth:1,borderColor:'#3C5843',backgroundColor:'#17251C'},driverAvailabilityHeroOn:{borderColor:c.primary,backgroundColor:'#1E3323'},driverAvailabilityHeroTop:{minHeight:60,flexDirection:'row-reverse',alignItems:'center',gap:12,marginBottom:13},driverAvailabilityHeroIcon:{width:46,height:46,alignItems:'center',justifyContent:'center',borderRadius:15,backgroundColor:c.raised},driverAvailabilityHeroIconOn:{backgroundColor:c.primary},driverAvailabilityHeroCopy:{flex:1,alignItems:'flex-end'},driverAvailabilityState:{color:c.text,fontSize:17,fontWeight:'900',textAlign:'right'},driverAvailabilityStateOn:{color:'#DFFFAD'},driverAvailabilityHint:{color:c.muted,fontSize:11,textAlign:'right',marginTop:4},driverAvailabilityAction:{minHeight:56,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:10,paddingHorizontal:14,borderRadius:14,backgroundColor:c.primary},driverAvailabilityActionOn:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border},driverAvailabilityActionText:{color:c.background,fontSize:13,fontWeight:'900'},driverAvailabilityActionTextOn:{color:c.text},driverSwitchTrack:{width:48,height:28,justifyContent:'center',padding:3,borderRadius:15,backgroundColor:'#26362D'},driverSwitchTrackOn:{backgroundColor:'#486D34'},driverSwitchThumb:{width:22,height:22,alignSelf:'flex-start',borderRadius:11,backgroundColor:'#A6B5AA'},driverSwitchThumbOn:{alignSelf:'flex-end',backgroundColor:'#B7FF30'},driverAvailabilityOffline:{color:'#F0CC83',fontSize:10,textAlign:'right',marginTop:10},driverCommissionSummary:{minHeight:68,flexDirection:'row-reverse',alignItems:'center',gap:11,paddingHorizontal:13,marginBottom:13,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},driverCommissionBadge:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:c.raised},driverCommissionTitle:{color:c.text,fontSize:12,fontWeight:'900',textAlign:'right'},driverCommissionCopy:{color:c.muted,fontSize:10,lineHeight:16,textAlign:'right',marginTop:4},driverOrdersSkeleton:{minHeight:132,padding:15,marginBottom:15,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,justifyContent:'center'},driverSkeletonTop:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',marginBottom:15},driverSkeletonPill:{width:76,height:19,borderRadius:10,backgroundColor:c.raised},driverSkeletonLine:{height:10,width:'43%',borderRadius:6,backgroundColor:c.raised,marginBottom:10,alignSelf:'flex-end'},driverSkeletonButton:{width:116,height:36,alignSelf:'flex-start',marginTop:3,borderRadius:11,backgroundColor:c.raised},driverFooter:{flexDirection:'row-reverse',alignItems:'center',gap:3,borderTopWidth:1,borderTopColor:c.border,paddingTop:6,paddingBottom:6,paddingHorizontal:5,backgroundColor:c.background},driverFooterButton:{flex:1,minWidth:0,minHeight:58,alignItems:'center',justifyContent:'center',gap:1,borderRadius:14,paddingHorizontal:2},driverFooterButtonActive:{backgroundColor:c.primary},driverFooterIconWrap:{width:26,height:27,alignItems:'center',justifyContent:'center'},driverFooterLabel:{color:c.muted,fontSize:10,fontWeight:'700',textAlign:'center'},driverFooterLabelActive:{color:c.background,fontSize:10,fontWeight:'900'},driverTabBadge:{position:'absolute',right:-5,top:-4,minWidth:16,height:16,alignItems:'center',justifyContent:'center',paddingHorizontal:3,borderRadius:8,backgroundColor:c.danger,borderWidth:1,borderColor:c.background},driverTabBadgeText:{color:'#fff',fontSize:8,fontWeight:'900'},hidden:{display:'none'},notificationSummaryStandalone:{minHeight:57},notificationCardStandalone:{padding:0,marginBottom:12,borderWidth:0,backgroundColor:'transparent'},notificationListStandalone:{borderTopWidth:0,marginTop:12,gap:12},notificationItemStandalone:{minHeight:92,alignItems:'center',gap:13,paddingHorizontal:14,paddingVertical:14,borderWidth:1,borderColor:c.border,borderRadius:20,backgroundColor:c.surface},notificationItemCopyStandalone:{flex:1,minWidth:0},notificationItemTitleStandalone:{fontSize:15,lineHeight:22,fontWeight:'900'},notificationItemBodyStandalone:{fontSize:13,lineHeight:21,marginTop:5},notificationItemMetaStandalone:{fontSize:10,marginTop:9},notificationItemUnread:{backgroundColor:'#1E3323',borderColor:'#3F6A2E',borderRightWidth:4,borderRightColor:c.primary},notificationMarkAllStandalone:{backgroundColor:c.primary,borderColor:c.primary},notificationMarkAllStandaloneText:{color:'#17210F'},notificationLoadMore:{minHeight:46,alignItems:'center',justifyContent:'center',marginTop:5,borderRadius:13,borderWidth:1,borderColor:c.border,backgroundColor:c.raised},notificationLoadMoreText:{color:c.primary,fontSize:12,fontWeight:'800'},
  notifStrip:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:10,minHeight:52},notifStripInfo:{flex:1,minWidth:0,flexDirection:'row-reverse',alignItems:'center',gap:11},notifStripCount:{minWidth:40,height:40,paddingHorizontal:10,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:c.primary},notifStripCountZero:{backgroundColor:c.raised,borderWidth:1,borderColor:c.border},notifStripCountText:{color:'#0B1411',fontSize:17,fontWeight:'900'},notifStripCountTextZero:{color:c.muted},notifStripTitle:{color:c.text,fontSize:14,fontWeight:'900',textAlign:'right'},notifStripHint:{color:c.muted,fontSize:11.5,marginTop:2,textAlign:'right'},
  notifMarkAll:{minHeight:38,flexDirection:'row-reverse',alignItems:'center',gap:6,paddingHorizontal:13,borderRadius:19,borderWidth:1,borderColor:c.primary,backgroundColor:'transparent'},notifMarkAllText:{color:c.primary,fontSize:12,fontWeight:'900'},
  notifTile:{width:46,height:46,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:c.raised,borderWidth:1,borderColor:c.border},notifTileUnread:{backgroundColor:c.primary,borderColor:c.primary},notifItemReadStandalone:{opacity:0.82},
  notifMetaRow:{flexDirection:'row-reverse',alignItems:'center',flexWrap:'wrap',gap:8,marginTop:9},notifTime:{color:c.muted,fontSize:11.5,textAlign:'right'},notifOrderChip:{flexDirection:'row-reverse',alignItems:'center',gap:5,paddingHorizontal:8,height:22,borderRadius:11,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},notifOrderChipLabel:{color:c.muted,fontSize:10.5,fontWeight:'700'},notifOrderChipCode:{color:c.text,fontSize:10.5,fontWeight:'800',writingDirection:'ltr'},
  driverOrdersToolbar:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:10,marginTop:14,marginBottom:2},driverOrdersToolbarTitleRow:{flex:1,minWidth:0,flexDirection:'row-reverse',alignItems:'center'},driverOrdersToolbarTitle:{color:c.text,fontSize:19,fontWeight:'900',textAlign:'right'},driverToolbarRefresh:{minHeight:36,flexDirection:'row-reverse',alignItems:'center',gap:6,paddingHorizontal:12,borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},driverToolbarRefreshText:{color:c.primary,fontSize:12,fontWeight:'800'},emptyIconWrap:{width:64,height:64,borderRadius:32,alignItems:'center',justifyContent:'center',backgroundColor:c.raised,borderWidth:1,borderColor:c.border},
  offerActions:{flexDirection:'row-reverse',gap:9,marginTop:12},offerTimerWrap:{marginTop:12},offerTimerTrack:{height:5,borderRadius:3,backgroundColor:c.raised,overflow:'hidden'},offerTimerFill:{height:'100%',borderRadius:3,backgroundColor:c.primary},offerTimerText:{color:c.muted,fontSize:11.5,marginTop:6,textAlign:'right'},
  nChips:{flexDirection:'row-reverse',flexWrap:'wrap',gap:8,marginBottom:14},nChip:{minHeight:40,paddingHorizontal:14,borderRadius:20,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,flexDirection:'row-reverse',alignItems:'center',gap:7},nChipOn:{backgroundColor:c.primary,borderColor:c.primary},nChipText:{color:c.muted,fontSize:13,fontWeight:'800'},nChipTextOn:{color:'#0B1411'},nChipAction:{borderColor:c.primary,backgroundColor:'transparent'},nChipActionText:{color:c.primary,fontSize:13,fontWeight:'800'},
  nCard:{borderRadius:24,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:16,overflow:'hidden'},nCardUnread:{borderColor:'#3F6A2E',backgroundColor:'#1B2A22'},nCardRead:{opacity:0.72},nAccent:{position:'absolute',right:0,top:20,bottom:20,width:4,borderTopLeftRadius:2,borderBottomLeftRadius:2,backgroundColor:c.primary},nTop:{flexDirection:'row-reverse',alignItems:'flex-start',gap:13},nTile:{width:52,height:52,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:c.raised,borderWidth:1,borderColor:c.border},nTileUnread:{backgroundColor:'#2B3F22',borderColor:'#4B7A2E'},nMain:{flex:1,minWidth:0},nTitleRow:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:8},nTitle:{flex:1,color:c.text,fontSize:17,fontWeight:'900',textAlign:'right'},nReadLabel:{color:c.muted,fontSize:11},nNewBadge:{flexDirection:'row-reverse',alignItems:'center',gap:6,paddingHorizontal:10,height:26,borderRadius:13,backgroundColor:'#2A3B1A',borderWidth:1,borderColor:'#4B6A2A'},nNewDot:{width:8,height:8,borderRadius:4,backgroundColor:c.primary},nNewText:{color:c.primary,fontSize:12,fontWeight:'900'},nBody:{color:c.muted,fontSize:14,lineHeight:22,marginTop:5,textAlign:'right'},nDivider:{height:1,backgroundColor:c.border,marginVertical:13},nFooter:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:10},nOrderChip:{flexDirection:'row-reverse',alignItems:'center',gap:7,paddingHorizontal:11,height:34,borderRadius:12,backgroundColor:c.background,borderWidth:1,borderColor:c.border},nOrderLabel:{color:c.muted,fontSize:12},nOrderCode:{color:c.accent,fontSize:13,fontWeight:'800',writingDirection:'ltr'},nDateRow:{flexDirection:'row',alignItems:'center',gap:8},nDate:{color:c.muted,fontSize:12.5},
  sheetBackdrop:{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(0,0,0,0.6)'},sheet:{backgroundColor:c.surface,borderTopLeftRadius:32,borderTopRightRadius:32,padding:20,paddingBottom:34,gap:16,borderWidth:1,borderColor:c.border},sheetHandle:{alignSelf:'center',width:48,height:5,borderRadius:3,backgroundColor:c.border},sheetHead:{flexDirection:'row-reverse',alignItems:'center',gap:14},sheetClose:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:c.border},sheetKicker:{color:c.accent,fontSize:13,fontWeight:'700',textAlign:'right'},sheetTitle:{color:c.text,fontSize:20,fontWeight:'900',textAlign:'right',marginTop:2},sheetBox:{borderRadius:22,borderWidth:1,borderColor:c.border,backgroundColor:c.background,padding:16},sheetBody:{color:c.text,fontSize:15.5,lineHeight:25,textAlign:'right'},sheetCta:{minHeight:58,borderRadius:20,backgroundColor:c.primary,flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:10},sheetCtaText:{color:'#0B1411',fontSize:17,fontWeight:'900'},
  homeTile:{flex:1,minHeight:140,borderRadius:24,padding:14,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},homeTileHot:{backgroundColor:'#1B2A22',borderColor:'#57763D'},homeTileTop:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'},homeTileIcon:{width:44,height:44,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:c.raised,borderWidth:1,borderColor:c.border},homeTileValue:{color:c.primary,fontSize:32,fontWeight:'900',textAlign:'right',marginTop:10},homeTileLabel:{color:c.text,fontSize:14,fontWeight:'800',textAlign:'right'},homeTileHint:{color:c.muted,fontSize:12,textAlign:'right',marginTop:2},homeTileHintHot:{color:c.accent,fontWeight:'800'},liveOfferBox:{borderColor:'#57763D'},
  oTab:{flex:1,minHeight:54,flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:10,borderRadius:17},oTabOn:{backgroundColor:c.primary},oTabText:{color:c.text,fontSize:16,fontWeight:'800'},oTabTextOn:{color:'#0B1411',fontWeight:'900'},oTabCount:{minWidth:28,height:28,paddingHorizontal:8,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:c.surface,borderWidth:1,borderColor:c.border},oTabCountOn:{backgroundColor:'#0B1411',borderColor:'#0B1411'},oTabCountHot:{backgroundColor:c.primary,borderColor:c.primary},oTabCountText:{color:c.text,fontSize:15,fontWeight:'900'},oTabCountTextOn:{color:c.primary},oTabCountTextHot:{color:'#0B1411'},
  radarStage:{height:300,alignItems:'center',justifyContent:'center',marginTop:2},radarButton:{width:150,height:150,borderRadius:75,alignItems:'center',justifyContent:'center',gap:6},radarButtonOn:{backgroundColor:c.primary,borderWidth:0},radarButtonOff:{backgroundColor:c.surface,borderWidth:2,borderStyle:'dashed',borderColor:c.border},radarButtonText:{color:c.muted,fontSize:15,fontWeight:'900'},radarButtonTextOn:{color:'#0B1411'},radarState:{alignItems:'center',marginTop:-6,marginBottom:4},radarStateTitle:{color:c.text,fontSize:22,fontWeight:'900',textAlign:'center'},radarStateHint:{color:c.muted,fontSize:13.5,marginTop:4,textAlign:'center'},
  homeGreeting:{marginTop:6,marginBottom:2,alignItems:'flex-end'},homeGreetingTitle:{color:c.text,fontSize:22,fontWeight:'900',textAlign:'right'},homeGreetingSub:{color:c.muted,fontSize:12.5,marginTop:3,textAlign:'right'},
  homePills:{flexDirection:'row-reverse',gap:9,marginTop:16,marginBottom:12},homePill:{flex:1,alignItems:'center',paddingVertical:12,paddingHorizontal:6,borderRadius:20,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},homePillHot:{borderColor:c.primary},homePillValue:{color:c.primary,fontSize:24,fontWeight:'900'},homePillLabel:{color:c.muted,fontSize:11.5,marginTop:2,textAlign:'center'},
  homeLive:{borderRadius:22,padding:14,marginBottom:12,backgroundColor:c.surface,borderWidth:1,borderColor:c.primary,borderRightWidth:4},homeLiveHead:{flexDirection:'row-reverse',marginBottom:8},homeLiveKicker:{color:c.primary,fontSize:12.5,fontWeight:'900'},homeLiveMain:{flexDirection:'row-reverse',alignItems:'flex-end',justifyContent:'space-between',gap:10},homeLiveTitle:{color:c.text,fontSize:15,fontWeight:'800',textAlign:'right'},homeLiveSub:{color:c.muted,fontSize:12.5,marginTop:3,textAlign:'right'},homeLiveFee:{color:c.primary,fontSize:22,fontWeight:'900'},homeLiveFeeUnit:{color:c.muted,fontSize:12,fontWeight:'500'},homeLiveCta:{marginTop:12,minHeight:46,borderRadius:15,backgroundColor:c.primary,alignItems:'center',justifyContent:'center'},homeLiveCtaText:{color:'#0B1411',fontSize:14.5,fontWeight:'900'},
  homeActive:{flexDirection:'row-reverse',alignItems:'center',gap:12,padding:14,marginBottom:12,borderRadius:22,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},homeActiveIcon:{width:46,height:46,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:c.raised,borderWidth:1,borderColor:c.border},homeActiveTitle:{color:c.text,fontSize:15,fontWeight:'900',textAlign:'right'},homeActiveSub:{color:c.muted,fontSize:12.5,marginTop:2,textAlign:'right'},
  balanceLabel:{color:c.muted,fontSize:14,textAlign:'center'},balanceValue:{color:c.primary,fontSize:40,fontWeight:'900',textAlign:'center',marginTop:6},balanceUnit:{fontSize:20,fontWeight:'800'},balanceBadge:{marginTop:12,paddingHorizontal:14,minHeight:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:c.raised,borderWidth:1,borderColor:c.border},balanceBadgeDue:{borderColor:'#C98A2B'},balanceBadgeText:{color:c.accent,fontSize:13,fontWeight:'800',textAlign:'center'},balanceBadgeTextDue:{color:'#F0CC83'},
};
