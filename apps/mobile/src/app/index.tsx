import { Children, Component, Fragment, createContext, isValidElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Metadata } from 'expo-router/server';
import { AccessibilityInfo, ActivityIndicator, Alert, Animated, AppState, Easing, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, TextInput, View, type ScrollViewProps } from 'react-native';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import * as Notifications from 'expo-notifications';
import { useNetworkState } from 'expo-network';
import type { NotificationResponse } from 'expo-notifications';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tokens } from '@labbayk/design-tokens';
import type { Session } from '@supabase/supabase-js';
import type { Database } from '@labbayk/shared/database.types';
import { readStoredSession, recheckBackend, supabase, supabaseConfigured } from '@/lib/supabase';
import { getBackendHealth, subscribeBackendHealth, type BackendHealth } from '@/lib/network-health';
import { clearCustomerOrderDraft, clearCustomerOrdersSnapshot, loadCustomerOrderDraft, loadCustomerOrdersSnapshot, saveCustomerOrderDraft, saveCustomerOrdersSnapshot, type CustomerOrderImageDraft, type CustomerOrderSnapshot } from '@/lib/customer-order-draft';
import { clearDriverOrdersSnapshot, loadDriverOrdersSnapshot, saveDriverOrdersSnapshot } from '@/lib/driver-orders-cache';
import { checkPushStatus, enablePushNotifications, hasRegisteredPushToken, peekPushFailureStage, peekPushStatus, subscribePushStatus, unregisterPushNotifications, type PushFailureStage, type PushRegistrationResult } from '@/lib/push-notifications';
import { AuthScreen, PasswordRecoveryScreen } from '@/components/AuthScreen';
import { LegalLinksSection } from '@/components/LegalLinksSection';
import { SUPPORT_EMAIL } from '@/lib/legal-contact';
import { ltrPhone, prettyPhone, useSupportContact, whatsappUrl } from '@/lib/support-contact';
import { clearImageCaches, forgetOrderImages, imageCacheKey, listOrderImagePaths, peekOrderImagePaths, peekSignedImageUrl, signedImageUrl, signedImageUrls } from '@/lib/storage-cache';
import { shrinkPhoto } from '@/lib/image-compress';
import { uploadWithProgress } from '@/lib/storage-upload';
import { cacheKey, clearUserCache, createRefreshScheduler, isFresh, readMemory, readPersisted, writeMemory, writePersisted } from '@/lib/data-cache';
import { AppText as Text } from '@/components/AppText';
import { ToastProvider, useAppToast, useToastMessage } from '@/components/Toast';

const c: any = tokens.color;
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async notification => {
      const isTest = notification.request.content.data?.testNotification === true;
      return { shouldShowBanner: !isTest, shouldShowList: !isTest, shouldPlaySound: !isTest, shouldSetBadge: false };
    },
  });
}
const MobileThemeContext = createContext<{ colors: any; styles: Record<string, any> } | null>(null);
function useMobileTheme() {
  const theme = useContext(MobileThemeContext);
  if (!theme) throw new Error('useMobileTheme must be used inside MobileThemeContext');
  return theme;
}
const mobileThemeKey = 'labbayk-theme';
const buildStamp = Updates.isEmbeddedLaunch ? 'النسخة المثبّتة (بدون تحديث)' : `تحديث ${Updates.createdAt ? Updates.createdAt.toISOString().slice(0, 16).replace('T', ' ') : (Updates.updateId ?? '').slice(0, 8)}`;
const sessionStabilityReleaseNoteKey = 'labbayk:release-note:rtl-update-20261123';
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
  Object.assign(mapped.customerIdentityAvatar, { backgroundColor: '#F8FBEF' });
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
const numberFormatter = new Intl.NumberFormat('en-US');
const normalizeDigits = (value: string) => value.replace(/[٠-٩۰-۹]/g, (digit) => {
  const code = digit.charCodeAt(0);
  return String(code >= 0x06F0 ? code - 0x06F0 : code - 0x0660);
}).replace(/\D/g, '');
const normalizeSyrianMobile = (value: string) => {
  const digits = normalizeDigits(value);
  const national = digits.startsWith('00963') ? digits.slice(5) : digits.startsWith('963') ? digits.slice(3) : digits;
  return (national.startsWith('0') ? national.slice(1) : national).slice(0, 9);
};
const formatSyrianMobile = (value: string) => {
  const digits = normalizeSyrianMobile(value);
  return digits ? `0${digits}`.replace(/^(\d{4})(\d{0,3})(\d{0,3})$/, (_match, first: string, second: string, third: string) => [first, second, third].filter(Boolean).join(' ')) : '';
};
const shortTimeFormatter = new Intl.DateTimeFormat('ar-SY', { timeStyle: 'short' });
const shortDateTimeFormatter = new Intl.DateTimeFormat('ar-SY', { dateStyle: 'medium', timeStyle: 'short' });
export function generateMetadata(): Metadata {
  return { title: 'لَبّيك | اطلب، والباقي علينا.', description: 'خدمة يومك تبدأ من هون. احتياجاتك، بطلب واحد.' };
}
type Address = Database['public']['Tables']['addresses']['Row'];
type DriverOfferAddress = Pick<Address, 'id'|'label'|'street'|'city'|'neighborhood'|'building'|'landmark'>;
type CustomerOrder = Pick<Database['public']['Tables']['orders']['Row'], 'id'|'status'|'request_text'|'delivery_fee_minor'|'delivery_quote_set_at'|'delivery_quote_approved_at'|'purchase_amount_minor'|'purchase_approved_at'|'created_at'|'delivery_proof_path'> & { driver_id?: string | null; delivered_at?: string | null; is_urgent?: boolean };
type DriverOfferCard = { id: string; expires_at: string; order: Pick<Database['public']['Tables']['orders']['Row'], 'id'|'status'|'request_text'|'delivery_fee_minor'|'address_id'> & { is_urgent?: boolean; address: DriverOfferAddress | null } };
type DriverActiveOrder = Pick<Database['public']['Tables']['orders']['Row'], 'id'|'status'|'request_text'|'delivery_fee_minor'|'purchase_amount_minor'|'purchase_approved_at'|'created_at'|'address_id'> & { is_urgent?: boolean; address: Pick<Address, 'id'|'label'|'street'|'city'|'neighborhood'|'contact_phone'|'building'|'landmark'> | null };
const newRequestKey = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => { const value = Math.random() * 16 | 0; return (char === 'x' ? value : (value & 3 | 8)).toString(16); });
type OrderImage = CustomerOrderImageDraft & { uri: string };
type ProfileAvatarDraft = { uri: string; mimeType: string; extension: string };
const orderStatus: Record<string, string> = { requested:'بانتظار تحديد أجرة التوصيل', quoted:'بانتظار سائق متاح', searching:'عم نفتش على سائق', accepted:'قبل السائق الطلب', assigned:'تم تعيين سائق', shopping:'عم نجهز طلبك', awaiting_approval:'بانتظار موافقتك', purchased:'تم الشراء', delivering:'بالطريق لعندك', delivered:'تم التوصيل', settled:'تمت التسوية', disputed:'قيد مراجعة الدعم', cancelled:'ملغي' };

// Scroll container that keeps the focused input visible above the keyboard on every page.
type ScrollHandle = React.ComponentRef<typeof ScrollView>;
function KeyboardScroll(props: ScrollViewProps & { ref?: React.Ref<ScrollHandle> }) {
  const ios = Platform.OS === 'ios';
  const scroll = <ScrollView {...props} keyboardShouldPersistTaps="handled" keyboardDismissMode={ios ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets={ios} />;
  return Platform.OS === 'android' ? <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">{scroll}</KeyboardAvoidingView> : scroll;
}

function confirmAction(title: string, message: string, confirmLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : true);
  return new Promise((resolve) => Alert.alert(title, message, [{ text: 'رجوع', style: 'cancel', onPress: () => resolve(false) }, { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) }], { cancelable: true, onDismiss: () => resolve(false) }));
}

// One shared pulse for every skeleton block: a loading screen has 20–40 blocks, and one animation
// per block kept the UI thread busy on cheap phones exactly while data was arriving.
const skeletonPulse = new Animated.Value(0.45);
let skeletonUsers = 0;
let skeletonLoop: Animated.CompositeAnimation | null = null;
function useSkeletonPulse() {
  useEffect(() => {
    skeletonUsers += 1;
    if (!skeletonLoop) {
      skeletonLoop = Animated.loop(Animated.sequence([
        Animated.timing(skeletonPulse, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(skeletonPulse, { toValue: 0.45, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]));
      skeletonLoop.start();
    }
    return () => {
      skeletonUsers -= 1;
      if (!skeletonUsers && skeletonLoop) { skeletonLoop.stop(); skeletonLoop = null; }
    };
  }, []);
  return skeletonPulse;
}
function SkeletonBlock({ width = '68%', height = 11, style }: { width?: number | `${number}%`; height?: number; style?: object }) {
  const { colors: c } = useMobileTheme();
  const pulse = useSkeletonPulse();
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
  return Children.toArray(children).flatMap((child, index) => {
    if (typeof child === 'string') {
      const content = child.trim();
      return content ? [<Text key={`text-${index}`}>{content}</Text>] : [];
    }
    if (typeof child === 'number') return [<Text key={`number-${index}`}>{child}</Text>];
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) return flattenSections(child.props.children);
    return [child];
  });
}

// Entrance motion is kept short: content used to fade in over 0.68 s with up to 0.6 s of stagger per
// section (and nested sections stacked those delays), so a tab looked "still loading" for ~2 s.
// Now everything is fully visible within ~0.3 s, and nested sections don't animate twice.
const NestedEntranceContext = createContext(false);
let reduceMotion = false;
void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { reduceMotion = enabled; }).catch(() => undefined);
function EntranceSection({ children, delay = 0, transitionKey = '' }: { children: ReactNode; delay?: number; transitionKey?: string }) {
  const nested = useContext(NestedEntranceContext);
  const [progress] = useState(() => new Animated.Value(nested || reduceMotion ? 1 : 0));
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  useEffect(() => {
    if (nested || reduceMotion) { progress.setValue(1); return; }
    progress.setValue(0);
    const animation = Animated.timing(progress, { toValue: 1, duration: 200, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [delay, nested, progress, transitionKey]);
  if (nested) return <>{children}</>;
  return <NestedEntranceContext.Provider value><Animated.View style={{ width: '100%', opacity: progress, transform: [{ translateY }] }}>{children}</Animated.View></NestedEntranceContext.Provider>;
}

function StaggeredSections({ children, transitionKey, animateSingle = false }: { children: ReactNode; transitionKey: string; animateSingle?: boolean }) {
  const sections = flattenSections(children);
  if (sections.length === 1 && !animateSingle) return <>{sections[0]}</>;
  return <>{sections.map((section, index) => <EntranceSection key={`${transitionKey}-${index}`} transitionKey={transitionKey} delay={Math.min(index * 30, 90)}>{section}</EntranceSection>)}</>;
}

function AddressBook({ userId, onBack, backLabel, onAddressSaved }: { userId: string; onBack: () => void; backLabel: string; onAddressSaved: (address: Address) => void }) {
  const { colors: c, styles: s } = useMobileTheme();
  const online = useInternetAvailable();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [manualCity, setManualCity] = useState('');
  const [manualNeighborhood, setManualNeighborhood] = useState('');
  const [label, setLabel] = useState('');
  const [landmark, setLandmark] = useState('');
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
    setManualCity(address.city); setManualNeighborhood(address.neighborhood); setLabel(address.label);
    setLandmark(address.landmark ?? ''); setContactPhone(address.contact_phone);
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

  const save = async () => {
    if (!supabase || !online) { setMessage('حفظ العنوان يحتاج اتصالاً بالإنترنت.'); return; }
    const governorateValue = 'ريف دمشق';
    const cityValue = manualCity.trim();
    const neighborhoodValue = manualNeighborhood.trim();
    if (!governorateValue || governorateValue.length < 2 || !cityValue || cityValue.length < 2 || !neighborhoodValue) { setMessage('اكتب المحافظة أو المنطقة والمدينة والحارة.'); return; }
    if (label.trim().length < 1 || contactPhone.replace(/\D/g, '').length < 9) { setMessage('كمّل اسم العنوان، ورقم التواصل إلزامي (9 أرقام على الأقل).'); return; }
    setBusy(true); setMessage('');
    const values = {
      user_id: userId, zone_id: null, label: label.trim(), governorate: governorateValue,
      city: cityValue, neighborhood: neighborhoodValue, street: editingAddress?.street ?? null,
      landmark: landmark.trim() || null, building: editingAddress?.building ?? null, floor: editingAddress?.floor ?? null,
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

  if (addressLoading) return <View style={s.addressPage} accessibilityRole="progressbar" accessibilityLabel="تحميل العنوان">
    <SkeletonBlock width="46%" height={14} />
    <SkeletonBlock width="52%" height={28} style={{ marginTop: 10 }} />
    <SkeletonBlock width="86%" height={12} style={{ marginTop: 10, marginBottom: 14 }} />
    <View style={[s.profileCard, { gap: 13 }]}>{[0, 1, 2, 3, 4, 5].map((item) => <View key={item} style={{ gap: 7 }}><SkeletonBlock width="25%" height={11} /><SkeletonBlock width="100%" height={48} style={{ alignSelf: 'auto', borderRadius: 12 }} /></View>)}</View>
  </View>;

  return <View style={s.addressPage}>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:8}}><Text style={[s.pageTitle,{flex:1}]}>{editingAddress ? 'تعديل العنوان' : 'إضافة عنوان التوصيل'}</Text><Pressable onPress={onBack} style={[s.backNavigation,{alignSelf:'auto',marginBottom:0,marginLeft:12}]} accessibilityRole="button" accessibilityLabel={backLabel}><Text style={s.backNavigationText}>رجوع</Text></Pressable></View>
    <Text style={s.pageDescription}>عنوان واحد لكل طلباتك. رقم التواصل إلزامي حتى يقدر السائق يتصل فيك.</Text>
    <View style={s.profileCard}>
      <Text style={s.label}>المحافظة</Text><View style={s.zoneList}><View style={[s.zoneOption,s.zoneSelected]}><Text style={[s.zoneName,s.zoneNameSelected]}>ريف دمشق</Text></View></View>
      <Text style={s.label}>المدينة أو البلدة</Text><TextInput value={manualCity} onChangeText={setManualCity} maxLength={100} placeholder="مثلاً: دمشق، كناكر، جرمانا" placeholderTextColor="#839188" style={[s.field,{textAlign:'right',writingDirection:'rtl'}]} accessibilityLabel="المدينة أو البلدة"/>
      <Text style={s.label}>الحارة</Text><TextInput value={manualNeighborhood} onChangeText={setManualNeighborhood} maxLength={100} placeholder="مثلاً: الحارة الغربية" placeholderTextColor="#839188" style={[s.field,{textAlign:'right',writingDirection:'rtl'}]} accessibilityLabel="الحارة"/>
      <Text style={s.label}>اسم العنوان</Text><TextInput value={label} onChangeText={setLabel} maxLength={60} placeholder="بيت أبو مالك الجاهوش، الشغل..." placeholderTextColor="#839188" style={[s.field,{textAlign:'right',writingDirection:'rtl'}]} accessibilityLabel="اسم العنوان"/>
      <Text style={s.label}>مكان معروف قريب <Text style={s.optional}>اختياري</Text></Text><TextInput value={landmark} onChangeText={setLandmark} maxLength={160} placeholder="مقابل الجامع، جنب الصيدلية..." placeholderTextColor="#839188" style={[s.field,{textAlign:'right',writingDirection:'rtl'}]} accessibilityLabel="مكان معروف قريب"/>
      <Text style={s.label}>رقم اتصال أو واتساب <Text style={{ color: c.danger, fontSize: 12 }}>إلزامي</Text></Text><TextInput value={contactPhone} onChangeText={setContactPhone} maxLength={24} keyboardType="phone-pad" placeholder="09xx xxx xxx" placeholderTextColor="#839188" style={[s.field,{textAlign:'right',writingDirection:'ltr'}]} accessibilityLabel="رقم اتصال أو واتساب"/>
      <Pressable disabled={busy || addressLoading} onPress={() => void save()} style={[s.saveAddress,(busy || addressLoading)&&s.disabled]} accessibilityRole="button"><Text style={s.saveAddressText}>{addressLoading?'عم نحمّل عنوانك…':busy?'عم نحفظ…':editingAddress?'حفظ التعديلات':'حفظ العنوان'}</Text></Pressable>
    </View>
  </View>;
}

const pushProblemText: Record<string, string> = {
  'permission-denied': 'الإشعارات مو مفعّلة على هالموبايل، فما رح توصلك العروض والتنبيهات والتطبيق مسكّر. فعّلها من إعدادات الموبايل.',
  'development-build-required': 'الإشعارات ما بتشتغل ضمن تطبيق Expo Go. استخدم النسخة المثبّتة من التطبيق.',
  'missing-project-id': 'التطبيق ناقصه إعداد الإشعارات. أبلغ الدعم.',
  unsupported: 'هالجهاز أو المتصفح ما بيدعم الإشعارات.',
  error: 'ما قدرنا نفعّل الإشعارات هلأ. تأكد من النت واضغط «إعادة المحاولة».',
};
const pushFailureText: Record<PushFailureStage, string> = {
  'notifications-module': 'التطبيق ما قدر يحمّل وحدة إشعارات Android.',
  'android-channel': 'Android ما قدر يجهّز قناة الإشعارات.',
  'permission-check': 'ما قدر التطبيق يقرأ إذن الإشعارات من إعدادات الهاتف.',
  'fcm-token': 'الهاتف ما قدر يجيب رمز Firebase. افحص Google Play services وإعدادات Firebase بالبناء.',
  'supabase-registration': 'تم إنشاء رمز الهاتف، لكن ما قدرنا نسجّله بالخادم.',
  'local-storage': 'التسجيل بالخادم نجح، لكن تعذّر حفظ رمز الهاتف محليًا.',
};
/** Shows whether notifications work on this phone and explains how to fix a problem. */
function usePushStatus(userId: string) {
  const [status, setStatus] = useState<PushRegistrationResult['status'] | 'checking'>(() => peekPushStatus(userId) ?? 'checking');
  const [failureStage, setFailureStage] = useState<PushFailureStage | null>(() => peekPushFailureStage(userId));
  useEffect(() => {
    let active = true;
    const unsubscribe = subscribePushStatus(userId, (next, failure) => { if (active) { setStatus(next); setFailureStage(failure ?? null); } });
    void checkPushStatus(userId).then((next) => { if (active) { setStatus(next); setFailureStage(peekPushFailureStage(userId)); } });
    return () => { active = false; unsubscribe(); };
  }, [userId]);
  const retry = async () => {
    setStatus('checking'); setFailureStage(null);
    const next = await checkPushStatus(userId, true);
    setStatus(next); setFailureStage(peekPushFailureStage(userId));
  };
  return { status, failureStage, retry };
}
function PushStatusCard({ userId }: { userId: string }) {
  const { colors: c } = useMobileTheme();
  const { status, failureStage, retry } = usePushStatus(userId);
  if (Platform.OS === 'web') return null;
  const ok = status === 'enabled';
  const btn = { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 } as const;
  return <View style={{ backgroundColor: c.surface, borderColor: ok ? c.border : '#C98A2B', borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 }}>
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: status === 'checking' ? c.muted : ok ? '#52D5A0' : '#F0CC83' }} />
      <Text style={{ color: c.text, fontSize: 15, fontWeight: '900', textAlign: 'right' }}>الإشعارات</Text>
    </View>
    <Text style={{ color: ok ? c.muted : '#F0CC83', fontSize: 13, lineHeight: 21, textAlign: 'right' }}>{status === 'checking' ? 'عم نتأكد…' : ok ? 'الإشعارات شغّالة على هالموبايل. العروض والتنبيهات بتوصلك حتى لو التطبيق مسكّر.' : (pushProblemText[status] ?? pushProblemText.error)}</Text>
    {status === 'error' && failureStage ? <Text style={{ color: c.muted, fontSize: 12, lineHeight: 19, textAlign: 'right' }}>{pushFailureText[failureStage]}</Text> : null}
    {status === 'permission-denied' ? <Pressable onPress={() => void Linking.openSettings()} accessibilityRole="button" style={btn}><Text style={{ color: c.primary, fontSize: 14, fontWeight: '800' }}>فتح إعدادات الموبايل</Text></Pressable> : null}
    {!ok && status !== 'checking' ? <Pressable onPress={() => void retry()} accessibilityRole="button" style={btn}><Text style={{ color: c.text, fontSize: 14, fontWeight: '800' }}>إعادة المحاولة</Text></Pressable> : null}
  </View>;
}
/** A short warning on the driver's home screen only when notifications are not working. */
function PushWarning({ userId, onOpen }: { userId: string; onOpen: () => void }) {
  const { status } = usePushStatus(userId);
  if (Platform.OS === 'web' || status === 'checking' || status === 'enabled') return null;
  return <Pressable onPress={onOpen} accessibilityRole="button" style={{ marginTop: 10, backgroundColor: 'rgba(240,204,131,0.12)', borderColor: '#C98A2B', borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
    <Text style={{ flex: 1, color: '#F0CC83', fontSize: 12.5, fontWeight: '800', lineHeight: 20, textAlign: 'right' }}>الإشعارات مو شغّالة على موبايلك، فما رح توصلك العروض والتطبيق مسكّر. اضغط لتصلّحها.</Text>
  </Pressable>;
}

class NotificationBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <Pressable onPress={() => this.setState({ failed: false })} accessibilityRole="button" style={{ margin: 16, padding: 18, borderRadius: 18, borderWidth: 1, borderColor: '#745C2C', backgroundColor: '#3A2D18', alignItems: 'center', gap: 6 }}><Text style={{ color: '#FFE2A0', fontSize: 15, fontWeight: '900' }}>صار خطأ بعرض التنبيهات</Text><Text style={{ color: '#F0CC83', fontSize: 13 }}>اضغط هون لإعادة المحاولة</Text></Pressable>;
    return this.props.children;
  }
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

function NotificationInbox({ userId, refreshKey = 0, onOpenOrder, standalone = false, active = true, onUnreadCountChange }: { userId: string; active?: boolean; refreshKey?: number; onOpenOrder?: (orderId: string) => void; standalone?: boolean; onUnreadCountChange?: (count: number) => void }) {
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
    else {setItems(data??[]);setHasMore((data??[]).length===pageSize);setMessage('');void AsyncStorage.setItem(`labbayk-notifications-${userId}-${standalone?'page':'card'}`,JSON.stringify({items:data??[],unread:countError?null:unread??0})).catch(()=>{})}
    if(!countError)setUnreadCount(unread??0)
    setLoadingState(false)
  },[online,setMessage,standalone,userId]);
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  const [offerEnded, setOfferEnded] = useState(false);
  // Never keep a native modal open while this tab is hidden.
  useEffect(() => { if (!active) setSheet(null); }, [active]);
  const hasItemsRef = useRef(false);
  useEffect(() => { hasItemsRef.current = items.length > 0; }, [items]);
  // For offer notifications, check whether the offer can still be accepted.
  useEffect(() => {
    if (!sheet?.order_id || notificationKind(sheet.title) !== 'offer' || !supabase) { setOfferEnded(false); return; }
    let active = true;
    void supabase.from('order_offers').select('id').eq('order_id', sheet.order_id).eq('driver_id', userId).eq('status', 'pending').gt('expires_at', new Date().toISOString()).limit(1).then(({ data, error }) => { if (active && !error) setOfferEnded(!data?.length); });
    return () => { active = false; };
  }, [sheet, userId]);
  // Show the last known list instantly, then refresh quietly in the background.
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(`labbayk-notifications-${userId}-${standalone?'page':'card'}`).then((raw) => {
      if (!active || !raw) return;
      try {
        const cached = JSON.parse(raw) as { items?: Notification[]; unread?: number | null };
        if (Array.isArray(cached.items) && cached.items.length) {
          setItems((current) => current.length ? current : cached.items ?? []);
          if (typeof cached.unread === 'number') setUnreadCount((current) => current || cached.unread || 0);
          setLoadingState(false);
        }
      } catch { /* ignore a corrupt cache */ }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [standalone, userId]);
  useEffect(() => { if (refreshKey > 0) void refreshRef.current(); }, [refreshKey]);
  useEffect(() => {
    if (online && !hasItemsRef.current) setLoadingState(true);
    void refreshRef.current();
    if (!supabase || !online) return;
    // Unique per subscription so route switches or reconnects cannot reuse a channel during asynchronous removal.
    // "Mark all read" updates many rows at once; their events collapse into a single reload.
    const scheduler = createRefreshScheduler(() => refreshRef.current(), 400);
    const channel = supabase.channel(`user-notifications-${userId}-${newRequestKey()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, () => scheduler.schedule())
      .subscribe();
    return () => { scheduler.cancel(); void supabase?.removeChannel(channel); };
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
    {standalone&&<View style={[s.nChips,{flexDirection:'row',flexWrap:'nowrap',alignItems:'center',gap:8}]}>
      <View style={{flex:1,minWidth:0,flexDirection:'row',gap:4,padding:4,borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.raised}}>
        {notificationFilters.map(f=>{const count=f.key==='all'?items.length:items.filter(i=>!i.read_at).length;const on=filter===f.key;return <Pressable key={f.key} onPress={()=>setFilter(f.key)} accessibilityRole="button" accessibilityState={{selected:on}} style={{flex:1,minWidth:0,minHeight:42,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5,paddingHorizontal:4,borderRadius:14,backgroundColor:on?'#B7FF30':'transparent'}}><Text numberOfLines={1} style={{color:on?'#0B1411':c.muted,fontSize:12,fontWeight:'800'}}>{f.label}</Text>{!loading&&<View style={{minWidth:21,height:21,paddingHorizontal:4,alignItems:'center',justifyContent:'center',borderRadius:11,backgroundColor:on?'rgba(11,20,17,0.12)':c.surface}}><Text style={{color:on?'#0B1411':c.muted,fontSize:10,fontWeight:'900'}}>{count}</Text></View>}</Pressable>})}
      </View>
      {unreadCount>0&&<Pressable onPress={()=>void markAllRead()} disabled={markingAllRead||!online} accessibilityRole="button" accessibilityLabel="تحديد كل التنبيهات كمقروءة" style={[s.nChip,s.nChipAction,{minHeight:46,paddingHorizontal:10,borderRadius:15,flexShrink:0},(markingAllRead||!online)&&{opacity:0.6}]}><SymbolView name={{ios:'checkmark.circle.fill',android:'mark_email_read',web:'mark_email_read'}} tintColor={c.primary} size={16}/><Text style={s.nChipActionText}>{markingAllRead?'لحظة…':'قراءة الكل'}</Text></Pressable>}
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
    {standalone&&!!sheet&&<Modal visible transparent animationType="slide" onRequestClose={()=>setSheet(null)}>
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
        {offerEnded&&notificationKind(sheet.title)==='offer'&&<Text style={{color:'#F0CC83',fontSize:13.5,fontWeight:'800',textAlign:'center',lineHeight:22}}>انتهت مهلة هذا العرض أو قبله سائق آخر.</Text>}
        {sheet.order_id&&!(offerEnded&&notificationKind(sheet.title)==='offer')&&<Pressable onPress={()=>{const id=sheet.order_id;setSheet(null);if(id)setTimeout(()=>openOrderRef.current?.(id),450)}} style={s.sheetCta} accessibilityRole="button"><Text style={s.sheetCtaText}>فتح تفاصيل الطلب</Text><SymbolView name={{ios:'arrow.left',android:'arrow_back',web:'arrow_back'}} tintColor="#0B1411" size={18}/></Pressable>}
        </>}
      </Pressable></Pressable>
    </Modal>}
  </View>
}

const reportableStatuses = ['accepted','assigned','shopping','awaiting_approval','purchased','delivering','delivered','settled','disputed'];
function SupportIssueForm({orderId,status,disabled=false,userId}:{orderId:string;status:string;disabled?:boolean;userId?:string}) {
  const { styles: s } = useMobileTheme();
  const [mineDisputed,setMineDisputed]=useState<boolean|null>(null);
  const reportable = reportableStatuses.includes(status);
  // The report is private: only its author is told it is "their" report; the other side sees a neutral note.
  // Orders that cannot carry a report (new, searching, cancelled) no longer query anything: this ran once per card.
  useEffect(()=>{
    if(!supabase||!reportable)return
    let active=true
    void (async()=>{
      const me=userId ?? (await supabase!.auth.getSession()).data.session?.user.id
      const {data}=await supabase!.from('order_disputes').select('opened_by').eq('order_id',orderId).is('resolved_at',null).limit(1)
      if(active)setMineDisputed(!!me&&!!data?.some(row=>row.opened_by===me))
    })()
    return()=>{active=false}
  },[orderId,reportable,userId])
  const online = useInternetAvailable();
  const [expanded,setExpanded]=useState(false);const [reason,setReason]=useState('');const [details,setDetails]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useToastMessage();const [idempotencyKey]=useState(newRequestKey());const [submitted,setSubmitted]=useState(false)
  const submit=async()=>{
    if(!supabase)return
    if(disabled || !online){setMessage('إرسال البلاغ يحتاج اتصالاً مؤكداً بالخادم. تفاصيلك ما زالت على هالجهاز.');return}
    if(!reason||details.trim().length<5){setMessage('اختار نوع المشكلة واكتب تفاصيل أكثر.');return}
    if(!(await confirmAction('إرسال البلاغ؟','البلاغ بيوصل لإدارة لَبّيك فقط، والطلب بيكمل طريقه.','إرسال البلاغ')))return
    setBusy(true);setMessage('')
    const {error}=await supabase.rpc('open_order_dispute',{p_order_id:orderId,p_reason:reason,p_details:details.trim(),p_idempotency_key:idempotencyKey})
    setBusy(false)
    if(error){setMessage(error.message.includes('active')?'في بلاغ مفتوح على هالطلب. تواصل مع الدعم من التنبيهات.':'ما قدرنا نسجل البلاغ. أعد المحاولة بنفس التفاصيل.');return}
    setSubmitted(true);setMessage('وصل البلاغ لفريق لَبّيك. الطلب بيكمل طريقه وفريقنا بيتابعه.')
  }
  if(mineDisputed)return <Text accessibilityRole="status" style={s.offerExpiry}>بلاغك قيد مراجعة فريق الدعم. تابع التنبيهات للمستجدات.</Text>
  if(status==='disputed'){
    if(mineDisputed===null)return null
    return <Text accessibilityRole="status" style={s.offerExpiry}>الطلب متوقف مؤقتاً. فريق لَبّيك عم يتابعه وبيتواصل معك إذا لزم.</Text>
  }
  if(!['accepted','assigned','shopping','awaiting_approval','purchased','delivering','delivered','settled'].includes(status)) return null
  return <View style={{marginTop:10}}>{submitted?<Text accessibilityRole="status" style={s.offerExpiry}>{message}</Text>:!expanded?<Pressable onPress={()=>setExpanded(true)} accessibilityRole="button" style={{minHeight:46,borderRadius:14,borderWidth:1,borderStyle:'dashed',borderColor:'#6F8277',flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:8}}><Text style={{color:'#A9B9B0',fontSize:13,fontWeight:'800'}}>⚠️ إبلاغ عن مشكلة بالطلب</Text></Pressable>:<View style={s.dropoff}><Text style={s.dropoffTitle}>إرسال بلاغ للدعم</Text><Text style={{color:'#F0CC83',fontSize:12.5,lineHeight:20,textAlign:'right',marginTop:4}}>البلاغ بيوصل لإدارة لَبّيك فقط، والطلب بيكمل طريقه.</Text><View style={s.zoneList}>{['مشكلة بالمشتريات','تأخير أو مشكلة بالتوصيل','مبلغ أو تحصيل غير صحيح','مشكلة ثانية'].map(item=><Pressable key={item} onPress={()=>setReason(item)} accessibilityRole="button" accessibilityState={{selected:reason===item}} style={[s.zoneOption,reason===item&&s.zoneSelected]}><Text style={[s.zoneName,reason===item&&s.zoneNameSelected]}>{item}</Text></Pressable>)}</View><TextInput value={details} onChangeText={setDetails} multiline textAlignVertical="top" maxLength={2000} placeholder="اشرح المشكلة لفريق الدعم" placeholderTextColor="#839188" style={[s.field,{minHeight:85}]} accessibilityLabel="تفاصيل المشكلة"/><Pressable disabled={busy || !online || disabled} onPress={()=>void submit()} style={[s.acceptOffer,(busy || !online || disabled)&&s.disabled]} accessibilityRole="button"><Text style={s.acceptOfferText}>{busy?'عم نرسل البلاغ…':online && !disabled?'إرسال البلاغ':'بانتظار الاتصال'}</Text></Pressable><Pressable onPress={()=>{setExpanded(false);setMessage('')}} accessibilityRole="button" style={{minHeight:44,alignSelf:"flex-start",justifyContent:"center",paddingVertical:8}}><Text style={s.offerExpiry}>إغلاق</Text></Pressable>{message?<Text accessibilityRole="alert" style={s.formMessage}>{message}</Text>:null}</View>}</View>
}

function LiveOfferBadge({ expiresAt }: { expiresAt: string }) {
  const { styles: s } = useMobileTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const left = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
  const text = left <= 0 ? 'انتهت المهلة' : left < 60 ? `${left} ثانية` : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} دقيقة`;
  return <View style={s.liveBadge}><Text style={s.liveBadgeText}>عرض جديد • {text}</Text></View>;
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

function AppShellSkeleton() {
  const { colors: c, styles: s } = useMobileTheme();
  return <SafeAreaView style={s.safe}>
    <View accessibilityRole="progressbar" accessibilityLabel="جاري التحميل" style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <View style={skRow}>{sk(52, 52, { borderRadius: 14 })}<View style={{ gap: 7, alignItems: 'flex-end' }}>{sk(70, 15)}{sk(96, 11)}</View></View>
        <View style={{ alignItems: 'center', gap: 5 }}>{sk(42, 42, { borderRadius: 21 })}{sk(34, 9)}</View>
      </View>
      <View style={{ flex: 1, paddingHorizontal: 20 }}><DriverOperationsSkeleton screen="home" /></View>
      <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-around', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface }}>
        {[0, 1, 2, 3].map((item) => <View key={item} style={{ alignItems: 'center', gap: 6 }}>{sk(26, 26, { borderRadius: 8 })}{sk(44, 9)}</View>)}
      </View>
    </View>
  </SafeAreaView>;
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

// Last successful driver sync per account (kept outside React so the refresh callback stays pure).
const driverLastSync = new Map<string, number>();
function DriverOperations({ userId, screen = 'orders', isActive = true, profileComplete = true, onCompleteProfile = () => {}, onOpenOrders = () => {}, onRegisterRefresh }: { onRegisterRefresh?: (refresh: (forceNetwork?: boolean) => Promise<void>) => void; isActive?: boolean; userId: string; screen?: 'home' | 'orders'; profileComplete?: boolean; onCompleteProfile?: () => void; onOpenOrders?: () => void }) {
  const { colors: c, styles: s } = useMobileTheme();
  const online = useInternetAvailable();
  const [profile, setProfile] = useState<{ is_online: boolean }>({ is_online: false });
  const [offers, setOffers] = useState<DriverOfferCard[]>([]);
  const showOfferToast = useAppToast();
  const seenOffers = useRef<Set<string> | null>(null);
  const forceNetworkRefresh = useRef(false);
  const [activeOrders, setActiveOrders] = useState<DriverActiveOrder[]>([]);
  const [deliveredReceipt, setDeliveredReceipt] = useState<ReceiptData | null>(null);
  const [offersCount, setOffersCount] = useState(0);
  const [activeOrdersCount, setActiveOrdersCount] = useState(0);
  const [orderSection, setOrderSection] = useState<'offers' | 'active' | 'history'>('offers');
  const [history, setHistory] = useState<HistoryOrder[] | null>(null);
  const [historyCancelled, setHistoryCancelled] = useState<DriverCancelledOrder[]>([]);
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>('today');
  const [historyVisible, setHistoryVisible] = useState(20);
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const [historyAddresses, setHistoryAddresses] = useState<Record<string, { neighborhood: string; city: string; street: string | null; building: string | null; landmark: string | null }>>({});
  const [historyExtra, setHistoryExtra] = useState<Record<string, { cash: number | null; note: string | null }>>({});
  const [dismissedOfferId, setDismissedOfferId] = useState<string | null>(null);
  const [imagesOpen, setImagesOpen] = useState<Record<string, boolean>>({});
  const support = useSupportContact();
  const [collectDrafts, setCollectDrafts] = useState<Record<string, string>>({});
  const [deliveryDraft, setDeliveryDraft] = useState<{ orderId: string; uri: string; mimeType: string } | null>(null);
  // The proof photo starts uploading as soon as it is taken, while the driver types the amount.
  const [deliveryUpload, setDeliveryUpload] = useState<{ uri: string; status: 'uploading' | 'done' | 'error'; progress: number; attempt: number; path?: string } | null>(null);
  const deliveryUploadRun = useRef(0);
  const deliveryUploadPromise = useRef<Promise<string | null> | null>(null);
  const [deliveryNote, setDeliveryNote] = useState('');
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
  const [loadedScreens, setLoadedScreens] = useState<{ home: boolean; orders: boolean }>({ home: false, orders: false });
  // The skeleton only shows the first time a screen loads (or on a manual refresh); switching tabs refreshes quietly.
  // A manual refresh keeps the current cards on screen (only the refresh control spins); the skeleton is for the first load.
  const pageLoading = !loadedScreens[screen];
  useEffect(() => {
    const ids = new Set(offers.map((offer) => offer.id));
    if (seenOffers.current && offers.some((offer) => !seenOffers.current?.has(offer.id))) showOfferToast('وصلك عرض توصيل جديد. افتح الرئيسية أو الطلبات.', 'info');
    seenOffers.current = ids;
  }, [offers, showOfferToast]);
  const channelTopic = useRef(`driver-orders-${userId}-${newRequestKey()}`);
  const refresh = useCallback(async () => {
    if (!supabase) { setOperationsAreStale(true); setLoadedScreens({ home: true, orders: true }); setLoading(false); return; }
    try {
    // The local snapshot is only needed offline (or as a fallback); reading it no longer delays the network.
    const snapshotPromise = loadDriverOrdersSnapshot(userId);
    if (!online && !forceNetworkRefresh.current) {
      const cachedSnapshot = await snapshotPromise;
      if (cachedSnapshot) {
        // The cache has hidden values (zero amounts, no address), so it is shown only when offline.
        setOrdersSyncedAt(cachedSnapshot.syncedAt);
        setActiveOrders(cachedSnapshot.orders);
        setActiveOrdersCount(cachedSnapshot.orders.length);
      } else setActiveOrders([]);
      setOperationsAreStale(true); setLoading(false); return;
    }
    // One wave: profile, wallet, offers and assigned orders, with each order's address embedded in the
    // same request. This used to take four sequential round trips before a new offer could be accepted.
    const [driver, wallet, offerRows, assigned] = await Promise.all([
      supabase.from('driver_profiles').select('is_online').eq('user_id', userId).single(),
      supabase.rpc('get_driver_wallet_balances'),
      supabase.from('order_offers').select('id,order_id,expires_at,order:orders(id,is_urgent,status,request_text,delivery_fee_minor,address_id,address:addresses(id,label,street,city,neighborhood,building,landmark))').eq('driver_id', userId).eq('status', 'pending').gt('expires_at', new Date().toISOString()).order('expires_at'),
      supabase.from('orders').select('id,is_urgent,status,request_text,delivery_fee_minor,purchase_amount_minor,purchase_approved_at,created_at,address_id,address:addresses(id,label,street,city,neighborhood,contact_phone,building,landmark)').eq('driver_id', userId).neq('status', 'delivered').neq('status', 'settled').neq('status', 'cancelled').order('created_at', { ascending: false }),
    ]);
    const { data: walletRows, error: walletError } = wallet;
    if (!walletError) { setWalletBalance(walletRows?.find((row) => row.driver_id === userId)?.balance_minor ?? 0); setWalletUnavailable(false); }
    else { setWalletBalance(null); setWalletUnavailable(true); }
    if (driver.data) setProfile(driver.data);
    let currentOrders: DriverActiveOrder[] | null = null;
    if (!assigned.error) {
      currentOrders = (assigned.data ?? []).map((order) => ({ ...order, address: order.address ?? null }));
      setActiveOrders(currentOrders);
      setActiveOrdersCount(currentOrders.length);
      void saveDriverOrdersSnapshot(userId, currentOrders).then((snapshot) => setOrdersSyncedAt(snapshot.syncedAt)).catch(() => {});
    }
    if (!offerRows.error) {
      const cards: DriverOfferCard[] = (offerRows.data ?? []).flatMap((offer) => offer.order ? [{ id: offer.id, expires_at: offer.expires_at, order: { ...offer.order, address: offer.order.address ?? null } }] : []);
      cards.sort((a, b) => Number(!!b.order.is_urgent) - Number(!!a.order.is_urgent));
      setOffers(cards);
      setOffersCount(cards.length);
    }
    const syncFailed = !!driver.error || !!offerRows.error || !!assigned.error;
    setOperationsAreStale(syncFailed);
    if (!syncFailed) setMessage('');
    if (syncFailed && !currentOrders) { const cachedSnapshot = await snapshotPromise; if (cachedSnapshot) setActiveOrders(cachedSnapshot.orders); }
    } catch {
      setOperationsAreStale(true);
    } finally {
      // Home and orders show the same data, so one load serves both screens.
      driverLastSync.set(userId, Date.now());
      setLoadedScreens({ home: true, orders: true });
      setLoading(false);
    }
  }, [online, userId, setMessage]);
  // One scheduler: realtime bursts collapse into one reload, and a reload requested while another is
  // running waits for it instead of racing it (two overlapping reloads used to fight over the lists).
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  const schedulerRef = useRef<ReturnType<typeof createRefreshScheduler> | null>(null);
  useEffect(() => {
    const scheduler = createRefreshScheduler(() => refreshRef.current(), 300);
    schedulerRef.current = scheduler;
    return () => { scheduler.cancel(); if (schedulerRef.current === scheduler) schedulerRef.current = null; };
  }, []);
  const scheduleRefresh = useCallback(() => schedulerRef.current?.schedule(), []);
  const refreshNow = useCallback(() => schedulerRef.current?.now() ?? Promise.resolve(), []);
  // Initial load and realtime refresh are server synchronization, not derived render state.
  useEffect(() => { void refreshNow(); }, [refreshNow]);
  // Switching between home and orders reuses loaded data; realtime keeps it current.
  // Only data older than 30 s is refreshed, quietly in the background.
  useEffect(() => { const last = driverLastSync.get(userId) ?? 0; if (last && Date.now() - last > 30 * 1000) scheduleRefresh(); }, [screen, userId, scheduleRefresh]);
  const loadHistory = useCallback(async () => {
    if (!supabase || (!online && !forceNetworkRefresh.current)) return;
    // Cash and note columns come with the main query; addresses follow in one more request.
    const { data, error } = await supabase.from('orders').select('id,request_text,status,delivery_fee_minor,purchase_amount_minor,delivered_at,delivery_proof_path,created_at,address_id,cash_collected_minor,delivery_note').eq('driver_id', userId).in('status', ['delivered', 'settled']).order('delivered_at', { ascending: false }).limit(100);
    if (error) { setMessage('ما قدرنا نحمّل سجل طلباتك. جرّب مرة ثانية.'); return; }
    const rows = data ?? [];
    // Cancelled orders are detached from the driver, so they come from their own call (older databases just return nothing).
    const cancelledResult = await supabase.rpc('get_driver_cancelled_orders');
    setHistoryCancelled(cancelledResult.error ? [] : cancelledResult.data ?? []);
    setHistory(rows);
    setHistoryExtra(Object.fromEntries(rows.map((row) => [row.id, { cash: row.cash_collected_minor, note: row.delivery_note }])));
    const addressIds = [...new Set(rows.flatMap((order) => order.address_id ? [order.address_id] : []))];
    if (addressIds.length) {
      const { data: addressRows } = await supabase.from('addresses').select('id,neighborhood,city,street,building,landmark').in('id', addressIds);
      setHistoryAddresses(Object.fromEntries((addressRows ?? []).map((row) => [row.id, row])));
    }
  }, [online, userId, setMessage]);
  useEffect(() => { if (orderSection === 'history' && history === null) void loadHistory(); }, [orderSection, history, loadHistory]);
  const manualRefresh = async () => {
    if (busy || refreshing) return;
    if (!online && !(await recheckBackend())) { setMessage('التحديث يحتاج اتصالاً بالإنترنت.'); return; }
    setRefreshing(true); setLoading(true);
    await refreshNow();
    if (orderSection === 'history') await loadHistory();
    setRefreshing(false); setRefreshToastPending(true);
  };
  // Lets the screen's pull-to-refresh gesture reload this data (history included when it's open).
  useEffect(() => {
    onRegisterRefresh?.(async (forceNetwork = false) => {
      forceNetworkRefresh.current = forceNetwork;
      try { await refreshNow(); if (orderSection === 'history') await loadHistory(); }
      finally { forceNetworkRefresh.current = false; }
    });
  }, [onRegisterRefresh, refreshNow, orderSection, loadHistory]);
  useEffect(() => {
    if (!refreshToastPending || loading || refreshing) return;
    setRefreshToastPending(false);
    setMessage(operationsAreStale ? 'ما قدرنا نحدّث الطلبات. جرّب مرة ثانية.' : 'تم تحديث الطلبات.');
  }, [refreshToastPending, loading, refreshing, operationsAreStale, setMessage]);
  useEffect(() => {
    if (!supabase || !online) return;
    const channel = supabase.channel(channelTopic.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_offers', filter: `driver_id=eq.${userId}` }, scheduleRefresh)
      // Only this driver's orders; listening to every order event made each driver reload for all orders.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `driver_id=eq.${userId}` }, scheduleRefresh)
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [online, scheduleRefresh, userId]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - (driverLastSync.get(userId) ?? 0) > 30 * 1000) scheduleRefresh();
    });
    return () => subscription.remove();
  }, [scheduleRefresh, userId]);
  const patchOrder = (orderId: string, changes: Partial<DriverActiveOrder>) => setActiveOrders((current) => current.map((order) => order.id === orderId ? { ...order, ...changes } : order));
  const [pendingAction, setPendingAction] = useState('');
  const setAvailability = async (is_online: boolean) => {
    if (!profileComplete) { setMessage('أكمل ملفك الشخصي أولاً حتى تقدر تستقبل الطلبات.'); onCompleteProfile(); return; }
    if (!supabase || !online || operationsAreStale) { setMessage('هالإجراء يحتاج اتصالاً بالخادم. تأكد من الإنترنت وحدّث الصفحة.'); return; }
    setBusy(true); setMessage('');
    setProfile({ is_online }); // the switch moves at once; it flips back if the server refuses
    const { error } = await supabase.from('driver_profiles').update({ is_online }).eq('user_id', userId);
    setBusy(false);
    if (error) { setProfile({ is_online: !is_online }); setMessage('ما قدرنا نحدّث التوفر. حاول مرة ثانية.'); return; }
    setMessage(is_online ? 'تم تفعيل استقبال الطلبات. العروض الجديدة توصلك فوراً.' : 'تم إيقاف استقبال الطلبات.');
  };
  const accept = async (offerId: string) => {
    if (!supabase || !online || operationsAreStale) { setMessage('هالإجراء يحتاج اتصالاً بالخادم. تأكد من الإنترنت وحدّث الصفحة.'); return; }
    setBusy(true); setPendingAction(`accept-${offerId}`); setMessage('');
    const { error } = await supabase.rpc('accept_order_offer', { p_offer_id: offerId });
    setBusy(false); setPendingAction('');
    if (error) { setMessage('العرض انتهى أو قبله سائق تاني. حدّث القائمة.'); void refreshNow(); return; }
    // Show the result immediately; the reload that brings the full order runs in the background.
    setOffers((current) => current.filter((offer) => offer.id !== offerId)); setOffersCount((count) => Math.max(0, count - 1));
    setMessage('تم قبول الطلب من السيرفر.'); void refreshNow();
  };
  const decline = async (offerId: string) => {
    if (!supabase || !online || operationsAreStale) { setMessage('هالإجراء يحتاج اتصالاً بالخادم. تأكد من الإنترنت وحدّث الصفحة.'); return; }
    setBusy(true); setPendingAction(`decline-${offerId}`); setMessage('');
    const { error } = await supabase.rpc('decline_order_offer', { p_offer_id: offerId });
    setBusy(false); setPendingAction('');
    if (error) { setMessage('انتهى العرض أو ما عاد متاح. حدّث القائمة.'); void refreshNow(); return; }
    setOffers((current) => current.filter((offer) => offer.id !== offerId)); setOffersCount((count) => Math.max(0, count - 1));
    setMessage('اعتذرت عن العرض.'); void refreshNow();
  };
  const startShopping = async (orderId: string) => {
    if (!supabase || !online || operationsAreStale) { setMessage('هالإجراء يحتاج اتصالاً بالخادم. تأكد من الإنترنت وحدّث الصفحة.'); return; }
    setBusy(true); setMessage('');
    const { error } = await supabase.rpc('start_order_shopping', { p_order_id: orderId });
    setBusy(false);
    if (error) { setMessage('ما قدرنا نبدأ التسوق. حدّث حالة الطلب وحاول مرة ثانية.'); return; }
    patchOrder(orderId, { status: 'shopping' }); setMessage('تم تأكيد بدء التسوق.'); void refreshNow();
  };
  const confirmPurchase = async (orderId: string) => {
    if (!supabase || !online || operationsAreStale) { setMessage('هالإجراء يحتاج اتصالاً بالخادم. تأكد من الإنترنت وحدّث الصفحة.'); return; }
    const existing = activeOrders.find((order) => order.id === orderId)?.purchase_amount_minor ?? null;
    const draft = (purchaseDrafts[orderId] ?? '').trim();
    const amount = draft ? Number(draft) : existing;
    if (amount === null || !Number.isSafeInteger(amount) || amount < 0) { setMessage('أدخل قيمة المشتريات بالليرة السورية كرقم صحيح.'); return; }
    setBusy(true); setMessage('');
    if (amount !== existing) {
      const { error: recordError } = await supabase.rpc('record_order_purchase', { p_order_id: orderId, p_purchase_amount_minor: amount });
      if (recordError) { setBusy(false); setMessage('ما قدرنا نسجل المشتريات. تأكد من حالة الطلب.'); return; }
    }
    const { error: confirmError } = await supabase.rpc('confirm_order_purchase', { p_order_id: orderId });
    setBusy(false);
    if (confirmError) { setMessage('انسجل المبلغ لكن ما قدرنا نأكد الشراء. جرّب مرة ثانية.'); void refreshNow(); return; }
    patchOrder(orderId, { status: 'purchased', purchase_amount_minor: amount }); setMessage('تم تأكيد الشراء. ابدأ التوصيل لما تكون جاهز.'); void refreshNow();
  };
  const startDelivery = async (orderId: string) => {
    if (!supabase || !online || operationsAreStale) { setMessage('هالإجراء يحتاج اتصالاً بالخادم. تأكد من الإنترنت وحدّث الصفحة.'); return; }
    setBusy(true); setMessage('');
    const { error } = await supabase.rpc('start_order_delivery', { p_order_id: orderId });
    setBusy(false);
    if (error) { setMessage('ما قدرنا نبدأ التوصيل. تأكد أن المشتريات مسجلة وموافق عليها.'); return; }
    patchOrder(orderId, { status: 'delivering' }); setMessage('بدأ التوصيل. اطلب من الزبون رمز التأكيد عند التسليم.'); void refreshNow();
  };
  const beginDeliveryUpload = (orderId: string, uri: string, mimeType: string): Promise<string | null> => {
    const run = ++deliveryUploadRun.current;
    const live = (update: Partial<NonNullable<typeof deliveryUpload>>) => { if (deliveryUploadRun.current === run) setDeliveryUpload((current) => current && current.uri === uri ? { ...current, ...update } : current); };
    setDeliveryUpload({ uri, status: 'uploading', progress: 0, attempt: 1 });
    const task = (async (): Promise<string | null> => {
      try {
        const body = await fetch(uri).then((response) => response.arrayBuffer());
        if (body.byteLength > 5 * 1024 * 1024) { live({ status: 'error' }); return null; }
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          live({ status: 'uploading', progress: 0, attempt });
          const path = `${orderId}/${Date.now()}.jpg`;
          try {
            // Attempts 1 and 2 report progress; the last attempt uses the plain upload as a safety net.
            if (attempt < 3) await uploadWithProgress({ bucket: 'delivery-proofs', path, body, contentType: mimeType, onProgress: (fraction) => live({ progress: fraction }) });
            else {
              const plain = await supabase!.storage.from('delivery-proofs').upload(path, body, { contentType: mimeType, cacheControl: '3600', upsert: false });
              if (plain.error) throw plain.error;
            }
            forgetOrderImages('delivery-proofs', orderId);
            live({ status: 'done', progress: 1, path });
            return path;
          } catch {
            if (deliveryUploadRun.current !== run) return null;
            if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
          }
        }
      } catch { /* fall through to the error state */ }
      live({ status: 'error' });
      return null;
    })();
    deliveryUploadPromise.current = task;
    return task;
  };
  const closeDeliveryDraft = () => { deliveryUploadRun.current += 1; deliveryUploadPromise.current = null; setDeliveryUpload(null); setDeliveryDraft(null); };
  const startDeliveryPhoto = async (orderId: string) => {
    if (!supabase || !online || operationsAreStale) { setMessage('هالإجراء يحتاج اتصالاً بالخادم. تأكد من الإنترنت وحدّث الصفحة.'); return; }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) { setMessage('نحتاج إذن الكاميرا حتى تصوّر تسليم الطلب. فعّله من إعدادات الجهاز.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6, allowsEditing: false });
    if (result.canceled || !result.assets[0]) return;
    const target = activeOrders.find((order) => order.id === orderId);
    setCollectDrafts((current) => ({ ...current, [orderId]: String((target?.purchase_amount_minor ?? 0) + (target?.delivery_fee_minor ?? 0)) }));
    setDeliveryNote('');
    // Proof of delivery does not need a large photo: a smaller one uploads quickly on a weak connection.
    const shrunk = await shrinkPhoto(result.assets[0], 1024, 0.6);
    const draft = { orderId, uri: shrunk?.uri ?? result.assets[0].uri, mimeType: shrunk?.mimeType ?? result.assets[0].mimeType ?? 'image/jpeg' };
    setDeliveryDraft(draft);
    if (online) void beginDeliveryUpload(draft.orderId, draft.uri, draft.mimeType);
  };
  const submitDelivery = async () => {
    if (!supabase || !deliveryDraft) return;
    if (!online || operationsAreStale) { setMessage('هالإجراء يحتاج اتصالاً بالخادم. تأكد من الإنترنت وحدّث الصفحة.'); return; }
    const { orderId, uri, mimeType } = deliveryDraft;
    const collected = Number((collectDrafts[orderId] ?? '').trim());
    if (!Number.isSafeInteger(collected) || collected < 0) { setMessage('اكتب المبلغ اللي استلمته من الزبون بالليرة السورية.'); return; }
    setBusy(true); setMessage('');
    try {
      // Reuse the photo uploaded in the background; wait for it if it is still going, retry if it failed.
      let path: string | null = deliveryUpload?.uri === uri && deliveryUpload.status === 'done' ? deliveryUpload.path ?? null : null;
      if (!path) {
        setPendingAction('delivery-upload');
        path = deliveryUpload?.uri === uri && deliveryUpload.status === 'uploading' && deliveryUploadPromise.current ? await deliveryUploadPromise.current : null;
        if (!path) path = await beginDeliveryUpload(orderId, uri, mimeType);
      }
      if (!path) { setBusy(false); setPendingAction(''); setMessage('ما قدرنا نرفع الصورة. تأكد من الإنترنت وجرّب مرة ثانية.'); return; }
      const missing = (error: { code?: string; message: string } | null) => !!error && /find the function|PGRST202/i.test(`${error.code ?? ''} ${error.message}`);
      const note = deliveryNote.trim() || null;
      setPendingAction('delivery-confirm');
      let { error } = await supabase.rpc('confirm_order_delivery_with_photo', { p_order_id: orderId, p_proof_path: path, p_cash_collected_minor: collected, p_note: note });
      if (missing(error)) ({ error } = await supabase.rpc('confirm_order_delivery_with_photo', { p_order_id: orderId, p_proof_path: path, p_cash_collected_minor: collected }));
      if (missing(error)) ({ error } = await supabase.rpc('confirm_order_delivery_with_photo', { p_order_id: orderId, p_proof_path: path }));
      if (error) throw error;
      const finished = activeOrders.find((order) => order.id === orderId);
      if (finished) setDeliveredReceipt({ id: finished.id, createdAt: finished.created_at, deliveredAt: new Date().toISOString(), deliveryProofPath: path, request: finished.request_text, address: finished.address ?? null, purchase: finished.purchase_amount_minor, fee: finished.delivery_fee_minor, collected, note });
      setBusy(false); setPendingAction(''); closeDeliveryDraft(); setActiveOrders((current) => current.filter((order) => order.id !== orderId)); setActiveOrdersCount((count) => Math.max(0, count - 1)); setMessage('تم تسليم الطلب وحُفظت صورة الإثبات.'); void refreshNow();
    } catch {
      setBusy(false); setPendingAction(''); setMessage('ما قدرنا نأكد التسليم. تأكد من الاتصال وجرّب مرة ثانية.');
    }
  };
  const renderHistory = () => {
    if (history === null && !online) return <View style={s.noOffers}><Text style={s.noOffersTitle}>السجل يحتاج اتصالاً</Text><Text style={s.noOffersCopy}>اتصل بالإنترنت حتى نحمّل طلباتك المنتهية.</Text></View>;
    if (history === null) return <View accessibilityRole="progressbar" accessibilityLabel="تحميل السجل" style={{ gap: 10, marginTop: 6 }}>{[0, 1, 2].map((item) => <SkeletonCard key={item} style={[skRow, { padding: 11 }]}>{sk(58, 58, { borderRadius: 14 })}<View style={skCol}>{sk('70%', 14)}{sk('50%', 11)}{sk('60%', 11)}</View>{sk(56, 20)}</SkeletonCard>)}</View>;
    const cutoff = historyCutoff(historyPeriod);
    const rows = history.filter((order) => order.delivered_at && new Date(order.delivered_at).getTime() >= cutoff);
    const fees = rows.reduce((sum, order) => sum + order.delivery_fee_minor, 0);
    const knownCash = rows.filter((order) => historyExtra[order.id]?.cash != null);
    const cashTotal = knownCash.reduce((sum, order) => sum + (historyExtra[order.id]?.cash ?? 0), 0);
    const entries = [...rows.map((order) => ({ order, cancelled: null as DriverCancelledOrder | null, at: order.delivered_at as string })), ...historyCancelled.map((cancelled) => ({ order: null as HistoryOrder | null, cancelled, at: cancelled.cancelled_at ?? cancelled.created_at })).filter((entry) => new Date(entry.at).getTime() >= cutoff)].sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
    const groups: { label: string; items: typeof entries }[] = [];
    // Up to 100 delivered orders: render 20 at a time (each row loads a proof thumbnail).
    for (const entry of entries.slice(0, historyVisible)) { const label = dayLabel(entry.at); const last = groups[groups.length - 1]; if (last && last.label === label) last.items.push(entry); else groups.push({ label, items: [entry] }); }
    return <View style={{ gap: 10, marginTop: 4 }}>
      <View style={{ backgroundColor: c.surface, borderColor: '#3F6A2E', borderWidth: 1, borderRadius: 20, padding: 12, gap: 9 }}>
        <Text style={{ color: c.muted, fontSize: 13, fontWeight: '800', textAlign: 'right' }}>{historyPeriod === 'today' ? '📅 اليوم' : historyPeriod === 'week' ? '📅 آخر 7 أيام' : '📅 كل الطلبات'}</Text>
        <View style={{ flexDirection: 'row' }}>
          {([['طلبات', String(rows.length), false], ['أجرة التوصيل', numberFormatter.format(fees), true], ...(knownCash.length ? [['المحصَّل', numberFormatter.format(cashTotal), false]] as const : [])] as const).map(([label, value, strong], index) => <View key={label} style={{ flex: 1, alignItems: 'center', borderLeftWidth: index ? 1 : 0, borderLeftColor: c.border }}><Text style={{ color: c.muted, fontSize: 11 }}>{label}</Text><Text style={{ color: strong ? c.primary : c.text, fontSize: 16.5, fontWeight: '900' }}>{value}</Text></View>)}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 7 }}>
        {([['today', 'اليوم'], ['week', 'هذا الأسبوع'], ['all', 'الكل']] as const).map(([key, label]) => { const on = historyPeriod === key; return <Pressable key={key} onPress={() => { setHistoryPeriod(key); setHistoryVisible(20); }} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: on ? '#B7FF30' : c.border, backgroundColor: on ? '#B7FF30' : c.surface, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: on ? '#0B1411' : c.muted, fontSize: 12.5, fontWeight: '800' }}>{label}</Text></Pressable>; })}
      </View>
      {!entries.length ? <View style={s.noOffers}><View style={s.emptyIconWrap}><SymbolView name={{ ios: 'clock.arrow.circlepath', android: 'history', web: 'history' }} tintColor={c.primary} size={26}/></View><Text style={s.noOffersTitle}>ما في طلبات منتهية</Text><Text style={s.noOffersCopy}>{historyPeriod === 'all' ? 'لما تنهي أول طلب بيظهر هون.' : 'جرّب فترة أطول من الأزرار فوق.'}</Text></View> : groups.map((group) => <View key={group.label} style={{ gap: 9 }}>
        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginHorizontal: 2, marginTop: 4 }}><Text style={{ color: c.muted, fontSize: 12.5, fontWeight: '800' }}>{group.label}</Text><Text style={{ color: c.muted, fontSize: 12.5 }}>{group.items.length} طلب</Text></View>
        {group.items.map((entry) => { if (entry.cancelled) { const gone = entry.cancelled; return <View key={'x' + gone.id} style={{ backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 20, padding: 11, flexDirection: 'row-reverse', alignItems: 'center', gap: 11 }}>
          <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: c.text, fontSize: 14.5, fontWeight: '900', textAlign: 'right' }}>{splitPickup(gone.request_text).body}</Text><Text numberOfLines={1} style={{ color: c.muted, fontSize: 12, textAlign: 'right', marginTop: 1 }}>{notificationTimeFormatter.format(new Date(entry.at))} · #{gone.id.slice(0, 6)}</Text></View>
          <View style={{ backgroundColor: '#451E21', borderRadius: 11, paddingHorizontal: 10, minHeight: 26, justifyContent: 'center' }}><Text style={{ color: '#FF8A8A', fontSize: 12, fontWeight: '900' }}>🚫 ملغي</Text></View>
        </View>; } const order = entry.order as HistoryOrder; const open = historyOpen === order.id; const extra = historyExtra[order.id]; const addr = order.address_id ? historyAddresses[order.address_id] : undefined; const { body } = splitPickup(order.request_text); return <View key={order.id} style={{ backgroundColor: c.surface, borderColor: open ? c.primary : c.border, borderWidth: 1, borderRadius: 20, padding: 11, gap: 10 }}>
          <Pressable onPress={() => setHistoryOpen(open ? null : order.id)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: c.text, fontSize: 14.5, fontWeight: '900', textAlign: 'right' }}>{body}</Text>
              <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12, textAlign: 'right', marginTop: 1 }}>{addr ? addr.neighborhood : ''} · {order.delivered_at ? notificationTimeFormatter.format(new Date(order.delivered_at)) : ''}</Text>
              <Text numberOfLines={1} style={{ color: c.muted, fontSize: 11.5, textAlign: 'right', marginTop: 3 }}>مشتريات <Text style={{ color: c.text, fontWeight: '800' }}>{order.purchase_amount_minor !== null ? numberFormatter.format(order.purchase_amount_minor) : '—'}</Text>{extra?.cash != null ? '  ·  استلمت ' : ''}<Text style={{ color: c.text, fontWeight: '800' }}>{extra?.cash != null ? numberFormatter.format(extra.cash) : ''}</Text></Text>
            </View>
            <View style={{ alignItems: 'flex-start' }}><Text style={{ color: c.primary, fontSize: 15.5, fontWeight: '900' }}>{numberFormatter.format(order.delivery_fee_minor)}</Text><Text style={{ color: c.accent, fontSize: 11, fontWeight: '800', marginTop: 2 }}>{order.status === 'settled' ? '✅ تمت التسوية' : '✅ تم التوصيل'}</Text></View>
          </Pressable>
          {open && <OrderReceipt data={{ id: order.id, createdAt: order.created_at, deliveredAt: order.delivered_at, deliveryProofPath: order.delivery_proof_path, request: order.request_text, address: addr ?? null, purchase: order.purchase_amount_minor, fee: order.delivery_fee_minor, collected: extra?.cash ?? null, note: extra?.note ?? null }} />}
        </View>; })}
      </View>)}
      {entries.length > historyVisible ? <Pressable onPress={() => setHistoryVisible((count) => count + 20)} accessibilityRole="button" style={{ minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.primary, fontSize: 13.5, fontWeight: '800' }}>عرض المزيد ({entries.length - historyVisible})</Text></Pressable> : null}
    </View>;
  };
  const activeLabels: Record<string, string> = { accepted: 'بانتظار بدء التسوق', assigned: 'بانتظار بدء التسوق', shopping: 'مرحلة التسوق', awaiting_approval: 'بانتظار موافقة العميل', purchased: 'جاهز للتوصيل', delivering: 'قيد التوصيل', disputed: 'متوقف مؤقتاً' };
  const driverSteps = ['قبول', 'تسوق', 'توصيل', 'تسليم'];
  const renderActiveOrder = (order: DriverActiveOrder) => {
    const current = ['purchased', 'delivering'].includes(order.status) ? 2 : 1;
    const locked = busy || !online || operationsAreStale;
    const bigButton = { minHeight: 56, borderRadius: 18, backgroundColor: '#B7FF30', alignItems: 'center' as const, justifyContent: 'center' as const, opacity: locked ? 0.55 : 1 };
    const bigText = { color: '#0B1411', fontSize: 16.5, fontWeight: '900' as const };
    const addr = order.address;
    if (order.status === 'disputed') return <View key={order.id} style={{ backgroundColor: c.surface, borderColor: '#C98A2B', borderWidth: 1, borderRadius: 22, padding: 13, gap: 11, marginTop: 10, marginBottom: 6 }}>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ backgroundColor: '#3A2D18', borderRadius: 12, paddingHorizontal: 11, minHeight: 28, justifyContent: 'center' }}><Text style={{ color: '#F0CC83', fontSize: 12.5, fontWeight: '900' }}>⏸ متوقف مؤقتاً</Text></View>
        <Text style={{ color: c.muted, fontSize: 12 }}>#{order.id.slice(0, 6)}</Text>
      </View>
      <View style={{ flexDirection: 'row-reverse', gap: 12, alignItems: 'flex-start', backgroundColor: 'rgba(240,204,131,0.12)', borderColor: '#C98A2B', borderWidth: 1.5, borderRadius: 18, padding: 13 }}>
        <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: '#3A2D18', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 22 }}>⏸</Text></View>
        <View style={{ flex: 1 }}><Text style={{ color: '#F0CC83', fontSize: 16, fontWeight: '900', textAlign: 'right', marginBottom: 3 }}>الطلب متوقف مؤقتاً</Text><Text style={{ color: c.text, fontSize: 13.5, lineHeight: 23, textAlign: 'right' }}>لا تكمل أي خطوة ولا تتواصل مع الزبون. تواصل مع إدارة لَبّيك.</Text></View>
      </View>
      <View style={{ gap: 7 }}>
        {support?.phone ? <Pressable onPress={() => void Linking.openURL(`tel:${support.phone}`)} accessibilityRole="button" accessibilityLabel="اتصال بالإدارة" style={{ minHeight: 54, borderRadius: 16, backgroundColor: '#B7FF30', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#0B1411', fontSize: 15.5, fontWeight: '900' }}>📞 اتصال بالإدارة</Text></Pressable> : null}
        {support?.whatsapp ? <Pressable onPress={() => void Linking.openURL(whatsappUrl(support.whatsapp as string))} accessibilityRole="button" accessibilityLabel="واتساب الإدارة" style={{ minHeight: 54, borderRadius: 16, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#06210F', fontSize: 15.5, fontWeight: '900' }}>💬 واتساب الإدارة</Text></Pressable> : null}
        {!support?.phone && !support?.whatsapp ? <Pressable onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} accessibilityRole="button" accessibilityLabel="مراسلة الإدارة" style={{ minHeight: 54, borderRadius: 16, backgroundColor: '#B7FF30', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#0B1411', fontSize: 15.5, fontWeight: '900' }}>✉️ مراسلة الإدارة</Text></Pressable> : null}
        {support?.phone ? <Text selectable style={{ color: c.text, fontSize: 15, fontWeight: '900', textAlign: 'center' }}>{ltrPhone(prettyPhone(support.phone))}</Text> : null}
        <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>الإدارة متاحة للرد على طلبك</Text>
      </View>
      <View style={{ backgroundColor: c.background, borderColor: c.border, borderWidth: 1, borderRadius: 16, padding: 11, gap: 3 }}>
        <Text style={{ color: c.muted, fontSize: 11.5, fontWeight: '800', textAlign: 'right' }}>🛒 المطلوب شراؤه</Text>
        <Text style={{ color: c.text, fontSize: 15.5, fontWeight: '900', lineHeight: 25, textAlign: 'right' }}>{splitPickup(order.request_text).body}</Text>
      </View>
      <View style={{ opacity: 0.45, flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', marginHorizontal: 4 }}>
        <View style={{ position: 'absolute', top: 10, right: '12%', left: '12%', height: 3, backgroundColor: c.border }} />
        {driverSteps.map((label, index) => <View key={label} style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: index === 0 ? '#B7FF30' : c.raised, borderWidth: 2, borderColor: index === 1 ? '#F0CC83' : index === 0 ? '#B7FF30' : c.border }}>{index === 0 ? <Text style={{ color: '#0B1411', fontSize: 11, fontWeight: '900' }}>✓</Text> : null}</View>
          <Text style={{ color: c.muted, fontSize: 10.5, fontWeight: '800', marginTop: 4 }}>{label}</Text>
        </View>)}
      </View>
      <View style={{ backgroundColor: c.background, borderColor: c.border, borderWidth: 1, borderRadius: 16, padding: 11, gap: 3 }}>
        <Text style={{ color: c.muted, fontSize: 11.5, fontWeight: '800', textAlign: 'right' }}>📍 عنوان التوصيل</Text>
        {addr ? <><Text style={{ color: c.text, fontSize: 15, fontWeight: '900', textAlign: 'right' }}>{addr.label}</Text><Text style={{ color: c.muted, fontSize: 13, lineHeight: 21, textAlign: 'right' }}>{addr.neighborhood}، {addr.city} · {[addr.street, addr.building ? 'بناء ' + addr.building : '', addr.landmark].filter(Boolean).join(' · ')}</Text></> : <Text style={{ color: c.muted, fontSize: 13, textAlign: 'right' }}>—</Text>}
      </View>
      <View style={{ flexDirection: 'row-reverse', backgroundColor: c.raised, borderColor: c.border, borderWidth: 1, borderRadius: 14, paddingVertical: 7, paddingHorizontal: 6 }}>
        <View style={{ flex: 1, alignItems: 'center' }}><Text style={{ color: c.muted, fontSize: 10.5, fontWeight: '700' }}>أجرة التوصيل</Text><Text style={{ color: c.primary, fontSize: 13.5, fontWeight: '900', marginTop: 1 }}>{numberFormatter.format(order.delivery_fee_minor)}</Text></View>
      </View>
      <View style={{ minHeight: 54, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.border, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.muted, fontSize: 15, fontWeight: '900' }}>⏳ بانتظار فريق لَبّيك</Text></View>
    </View>;
    return <View key={order.id} style={{ backgroundColor: c.surface, borderColor: order.is_urgent ? '#F5A623' : c.border, borderWidth: order.is_urgent ? 2 : 1, borderRadius: 22, padding: order.is_urgent ? 12 : 13, gap: 11, marginTop: 10, marginBottom: 6 }}>
      {order.is_urgent ? <UrgentStrip /> : null}
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ backgroundColor: '#26391C', borderRadius: 12, paddingHorizontal: 11, minHeight: 28, justifyContent: 'center' }}><Text style={{ color: '#B7FF30', fontSize: 12.5, fontWeight: '900' }}>{activeLabels[order.status] ?? orderStatus[order.status] ?? order.status}</Text></View>
        <Text style={{ color: c.muted, fontSize: 12 }}>#{order.id.slice(0, 6)}</Text>
      </View>
      <View style={{ backgroundColor: c.background, borderColor: c.border, borderWidth: 1, borderRadius: 16, padding: 11, gap: 9 }}>
        <View style={{ gap: 3 }}>
          <Text style={{ color: c.muted, fontSize: 11.5, fontWeight: '800', textAlign: 'right' }}>🛒 المطلوب شراؤه</Text>
          <Text selectable style={{ color: c.text, fontSize: 16, fontWeight: '900', lineHeight: 26, textAlign: 'right' }}>{splitPickup(order.request_text).body}</Text>
        </View>
        {splitPickup(order.request_text).pickup ? <View style={{ gap: 3, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 9 }}>
          <Text style={{ color: c.muted, fontSize: 11.5, fontWeight: '800', textAlign: 'right' }}>🏪 الشراء من</Text>
          <Text selectable style={{ color: c.primary, fontSize: 15.5, fontWeight: '900', lineHeight: 24, textAlign: 'right' }}>{splitPickup(order.request_text).pickup}</Text>
        </View> : null}
      </View>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', marginHorizontal: 4 }}>
        <View style={{ position: 'absolute', top: 10, right: '12%', left: '12%', height: 3, backgroundColor: c.border }} />
        {driverSteps.map((label, index) => { const done = index < current; const now = index === current; return <View key={label} style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? '#B7FF30' : c.raised, borderWidth: 2, borderColor: done || now ? '#B7FF30' : c.border }}>{done ? <Text style={{ color: '#0B1411', fontSize: 11, fontWeight: '900' }}>✓</Text> : now ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#B7FF30' }} /> : null}</View>
          <Text style={{ color: done ? c.text : now ? c.primary : c.muted, fontSize: 10.5, fontWeight: '800', marginTop: 4 }}>{label}</Text>
        </View>; })}
      </View>
      <View style={{ backgroundColor: c.background, borderColor: c.border, borderWidth: 1, borderRadius: 16, padding: 11, gap: 3 }}>
        <Text style={{ color: c.muted, fontSize: 11.5, fontWeight: '800', textAlign: 'right' }}>📍 عنوان التوصيل</Text>
        {addr ? <>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '900', lineHeight: 24, textAlign: 'right' }}>{addr.label}</Text>
          <Text style={{ color: c.muted, fontSize: 13, lineHeight: 21, textAlign: 'right' }}>{addr.neighborhood}، {addr.city}{'\n'}{[addr.street, addr.building ? 'بناء ' + addr.building : '', addr.landmark].filter(Boolean).join(' · ')}</Text>
          <Pressable onPress={() => void Linking.openURL(`tel:${addr.contact_phone}`)} accessibilityRole="button" accessibilityLabel="اتصال بالزبون" style={{ marginTop: 8, minHeight: 46, borderRadius: 14, backgroundColor: '#B7FF30', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 9 }}><Text style={{ color: '#0B1411', fontSize: 14.5, fontWeight: '900' }}>📞 اتصال بالزبون</Text><Text style={{ color: '#0B1411', fontSize: 13.5, fontWeight: '800', writingDirection: 'ltr' }}>{ltrPhone(addr.contact_phone)}</Text></Pressable>
        </> : <Text style={{ color: c.muted, fontSize: 13, textAlign: 'right' }}>{operationsAreStale ? 'يظهر العنوان عند رجوع الاتصال.' : 'عم نحمل العنوان…'}</Text>}
      </View>
      <View style={{ flexDirection: 'row-reverse', backgroundColor: c.raised, borderColor: c.border, borderWidth: 1, borderRadius: 14, paddingVertical: 7, paddingHorizontal: 6 }}>
        {([...(order.purchase_amount_minor !== null && ['purchased', 'delivering'].includes(order.status) ? [['مشتريات دفعتها', numberFormatter.format(order.purchase_amount_minor), false]] as const : []), ['أجرة التوصيل', numberFormatter.format(order.delivery_fee_minor), true]] as const).map(([label, value, strong], index) => <View key={label} style={{ flex: 1, alignItems: 'center', borderLeftWidth: index ? 1 : 0, borderLeftColor: c.border }}><Text style={{ color: c.muted, fontSize: 10.5, fontWeight: '700' }}>{label}</Text><Text style={{ color: strong ? c.primary : c.text, fontSize: 13.5, fontWeight: '900', marginTop: 1 }}>{value}</Text></View>)}
      </View>
      {['purchased', 'delivering'].includes(order.status) && order.purchase_amount_minor !== null && <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#B7FF30', borderRadius: 13, paddingHorizontal: 13, minHeight: 40 }}><Text style={{ color: '#0B1411', fontSize: 12.5, fontWeight: '800' }}>المطلوب تحصيله من الزبون</Text><Text style={{ color: '#0B1411', fontSize: 16, fontWeight: '900' }}>{numberFormatter.format(order.purchase_amount_minor + order.delivery_fee_minor)} ل.س</Text></View>}
      <Pressable onPress={() => setImagesOpen((current) => ({ ...current, [order.id]: !current[order.id] }))} accessibilityRole="button" accessibilityState={{ expanded: !!imagesOpen[order.id] }} style={{ minHeight: 46, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, borderRadius: 15, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface }}><Text style={{ color: c.text, fontSize: 13.5, fontWeight: '800' }}>📷 صور الطلب</Text><Text style={{ color: c.primary, fontSize: 12.5, fontWeight: '900' }}>{imagesOpen[order.id] ? 'إخفاء ⌃' : 'عرض ⌄'}</Text></Pressable>
      {imagesOpen[order.id] ? <AdminImageStrip orderId={order.id} size={76} emptyText="ما في صور بهالطلب." /> : null}
      {['accepted', 'assigned'].includes(order.status) && <Pressable disabled={locked} onPress={() => void startShopping(order.id)} accessibilityRole="button" style={bigButton}><Text style={bigText}>بدء التسوق ←</Text></Pressable>}
      {order.status === 'shopping' && <View style={{ gap: 7 }}>
        <Text style={{ color: c.text, fontSize: 13, fontWeight: '800', textAlign: 'right' }}>المبلغ اللي دفعته عند الصندوق · ل.س</Text>
        <TextInput value={purchaseDrafts[order.id] ?? (order.purchase_amount_minor !== null ? String(order.purchase_amount_minor) : '')} onChangeText={(value) => setPurchaseDrafts((current) => ({ ...current, [order.id]: value.replace(/\D/g, '') }))} keyboardType="number-pad" textAlign="left" placeholder="مثال: 25000" placeholderTextColor="#839188" style={[s.field, { fontSize: 20, fontWeight: '900', color: c.primary }]} accessibilityLabel="قيمة المشتريات" />
        <Pressable disabled={locked} onPress={() => void confirmPurchase(order.id)} accessibilityRole="button" style={bigButton}><Text style={bigText}>{busy ? 'لحظة…' : 'تأكيد الشراء ←'}</Text></Pressable>
      </View>}
      {!operationsAreStale && order.status === 'awaiting_approval' && <View style={s.driverWaitNotice}><Text style={s.driverWaitTitle}>لا تشتري بعد</Text><Text style={s.driverWaitCopy}>المبلغ المقترح {numberFormatter.format(order.purchase_amount_minor ?? 0)} ل.س، وبانتظار موافقة العميل.</Text></View>}
      {!operationsAreStale && order.status === 'purchased' && <Pressable disabled={locked} onPress={() => void startDelivery(order.id)} accessibilityRole="button" style={bigButton}><Text style={bigText}>بدء التوصيل ←</Text></Pressable>}
      {order.status === 'delivering' && <Pressable disabled={locked} onPress={() => void startDeliveryPhoto(order.id)} accessibilityRole="button" style={bigButton}><Text style={bigText}>📷 تصوير التسليم</Text></Pressable>}
      <SupportIssueForm orderId={order.id} status={order.status} disabled={operationsAreStale} userId={userId} />
    </View>;
  };
  const live = offers.find((offer) => offer.id !== dismissedOfferId);
  const open = isActive && !!live && profile.is_online && online && !pageLoading;
  const can = !(busy || !profile.is_online || !online || operationsAreStale || !live?.order.address);
  const closeSheet = () => setDismissedOfferId(live?.id ?? null);
  return <View style={[s.driverPanel,s.driverHomePanel]}>{false&&<View style={s.driverPanelTop}><View><Text style={s.driverApplyTitle}>{screen==='home'?'استقبال الطلبات':'قائمة التوصيل'}</Text><Text style={s.driverApplyCopy}>{screen==='home'?'بدّل حالتك من هون لتبدأ أو توقف استقبال العروض.':'شوف العروض الجديدة أو تابع طلباتك النشطة.'}</Text></View><Pressable disabled={busy || refreshing} onPress={() => void manualRefresh()} style={s.driverRefresh} accessibilityRole="button" accessibilityLabel="تحديث طلبات السائق"><Text style={s.driverRefreshGlyph}>↻</Text></Pressable></View>}
      {operationsAreStale && !pageLoading && <Text style={s.driverAvailabilityOffline}>{ordersSyncedAt ? 'عم نعرض آخر نسخة محفوظة (' + shortDateTimeFormatter.format(new Date(ordersSyncedAt)) + '). العناوين والمبالغ بتظهر لما يرجع النت.' : 'عم نحاول نوصل للخدمة. العروض الجديدة رح توصلك أول ما يرجع الاتصال.'}</Text>}
    {pageLoading ? <DriverOperationsSkeleton screen={screen}/> : <StaggeredSections transitionKey={`${screen}-ready`}><>
    {screen==='home'&&<View style={s.radarStage}>
      <RadarRings active={profile.is_online && isActive && screen === 'home'}/>
      <Pressable disabled={busy||!online||operationsAreStale} onPress={()=>void setAvailability(!profile.is_online)} style={[s.radarButton,profile.is_online?s.radarButtonOn:s.radarButtonOff,(busy||!online||operationsAreStale)&&s.disabled]} accessibilityRole="switch" accessibilityLabel={profile.is_online?'إيقاف استقبال الطلبات':'بدء استقبال الطلبات'} accessibilityState={{checked:profile.is_online,disabled:busy||!online||operationsAreStale}} aria-checked={profile.is_online}>
        <SymbolView name={profile.is_online?{ios:'dot.radiowaves.left.and.right',android:'sensors',web:'sensors'}:{ios:'power',android:'power_settings_new',web:'power_settings_new'}} tintColor={profile.is_online?'#0B1411':c.muted} size={42}/>
        <Text style={[s.radarButtonText,profile.is_online&&s.radarButtonTextOn]}>{busy?'لحظة…':profile.is_online?'متصل':profileComplete?'اضغط للبدء':'أكمل ملفك'}</Text>
      </Pressable>
    </View>}
    {screen==='home'&&<View style={s.radarState}><Text style={s.radarStateTitle}>{profile.is_online?'أنت متاح الآن':'متوقف عن الاستقبال'}</Text><Text style={s.radarStateHint}>{operationsAreStale?'لتغيير حالة التوفر لازم يرجع النت.':profile.is_online?'اضغط الدائرة لإيقاف الاستقبال':'فعّل التوفر وقت ما تكون جاهز للشغل'}</Text></View>}
    {screen==='home'&&<View style={s.homePills}>
      <Pressable onPress={()=>{setOrderSection('offers');onOpenOrders()}} accessibilityRole="button" accessibilityLabel={`عروض جديدة، ${offersCount}`} style={[s.homePill,offersCount>0&&s.homePillHot]}><Text style={s.homePillValue}>{offersCount}</Text><Text style={s.homePillLabel}>عروض جديدة</Text></Pressable>
      <Pressable onPress={()=>{setOrderSection('active');onOpenOrders()}} accessibilityRole="button" accessibilityLabel={`طلبات نشطة، ${activeOrdersCount}`} style={s.homePill}><Text style={[s.homePillValue,activeOrdersCount===0&&{color:c.text}]}>{activeOrdersCount}</Text><Text style={s.homePillLabel}>طلبات نشطة</Text></Pressable>
      <Pressable onPress={()=>setBalanceOpen(true)} accessibilityRole="button" accessibilityLabel="تفاصيل العمولة المستحقة" style={s.homePill}><Text style={[s.homePillValue,(walletBalance===null||walletBalance>=0)&&{color:c.text}]}>{walletBalance===null?'—':numberFormatter.format(Math.abs(walletBalance))}</Text><Text style={s.homePillLabel}>{walletBalance!==null&&walletBalance<0?'عمولة مستحقة':'رصيد ل.س'}</Text></Pressable>
    </View>}
    {screen==='home'&&offers[0]&&profile.is_online&&<Pressable onPress={()=>{setOrderSection('offers');onOpenOrders()}} accessibilityRole="button" style={s.homeLive}>
      <View style={s.homeLiveHead}><Text style={s.homeLiveKicker}>⚡ عرض بانتظارك</Text></View>
      <View style={s.homeLiveMain}><View style={{flex:1}}><Text numberOfLines={1} style={s.homeLiveTitle}>{offers[0].order.request_text}</Text><Text style={s.homeLiveSub}>{offers[0].order.address?`${offers[0].order.address.neighborhood}، ${offers[0].order.address.city}`:offers[0].order.request_text}</Text></View><Text style={s.homeLiveFee}>{numberFormatter.format(offers[0].order.delivery_fee_minor)} <Text style={s.homeLiveFeeUnit}>ل.س</Text></Text></View>
      <OfferCountdown expiresAt={offers[0].expires_at}/>
      <View style={s.homeLiveCta}><Text style={s.homeLiveCtaText}>عرض التفاصيل ←</Text></View>
    </Pressable>}
    {screen==='home'&&!(offers[0]&&profile.is_online)&&activeOrders[0]&&<Pressable onPress={()=>{setOrderSection('active');onOpenOrders()}} accessibilityRole="button" style={s.homeActive}>
      <View style={s.homeActiveIcon}><SymbolView name={{ios:'shippingbox.fill',android:'local_shipping',web:'local_shipping'}} tintColor={c.primary} size={22}/></View>
      <View style={{flex:1}}><Text style={s.homeActiveTitle}>طلب قيد التنفيذ</Text><Text numberOfLines={1} style={s.homeActiveSub}>{orderStatus[activeOrders[0].status] ?? activeOrders[0].status}</Text></View>
      <SymbolView name={{ios:'chevron.left',android:'chevron_left',web:'chevron_left'}} tintColor={c.muted} size={16}/>
    </Pressable>}
    {screen === 'home' && <View style={s.driverCommissionSummary}><View style={{position:'absolute',left:64,right:13,top:0,bottom:0,justifyContent:'center',alignItems:'stretch'}}><Text style={s.driverCommissionTitle}>العمولة المستحقة</Text><Text style={s.driverCommissionCopy}>{walletUnavailable?'تعذر تحميل رصيد العمولة. أعد المحاولة.':walletBalance === null ? online ? 'عم نتحقق من رصيدك.' : 'الرصيد يظهر عند الاتصال.' : walletBalance < 0 ? `عليك ${numberFormatter.format(Math.abs(walletBalance))} ل.س بعد تسوية الطلبات.` : walletBalance > 0 ? `إلك رصيد ${numberFormatter.format(walletBalance)} ل.س.` : 'ما عليك عمولات مستحقة حالياً.'}</Text></View><View style={s.driverCommissionBadge}><SymbolView name={{ios:'banknote.fill',android:'payments',web:'payments'}} tintColor={c.primary} size={18}/></View></View>}
    {screen === 'orders' && <>
      <View style={s.driverOrderTabs}>
        {([{ key: 'offers', label: 'عروض', count: offersCount }, { key: 'active', label: 'نشطة', count: activeOrdersCount }, { key: 'history', label: 'السجل', count: history?.length ?? 0 }] as const).map((item) => { const on = orderSection === item.key; return <Pressable key={item.key} onPress={() => setOrderSection(item.key)} accessibilityRole="button" accessibilityLabel={`${item.label}، ${item.count}`} accessibilityState={{ selected: on }} style={[s.oTab, on && s.oTabOn]}><Text style={[s.oTabText, on && s.oTabTextOn]}>{item.label}</Text><View style={[s.oTabCount, on && s.oTabCountOn, !on && item.key !== 'history' && item.count > 0 && s.oTabCountHot]}><Text style={[s.oTabCountText, on && s.oTabCountTextOn, !on && item.key !== 'history' && item.count > 0 && s.oTabCountTextHot]}>{item.count}</Text></View></Pressable>; })}
      </View>
      
      <View style={orderSection === 'offers' ? undefined : s.hidden}>{!profile.is_online && <View style={s.driverOrdersHint}><SymbolView name={{ios:'pause.circle.fill',android:'pause_circle',web:'pause_circle'}} tintColor={c.accent} size={19}/><Text style={s.driverOrdersHintText}>الاستقبال متوقف. فعّله من الرئيسية حتى تقدر تقبل عرضاً.</Text></View>}
    {offers.length ? offers.map((offer) => <View key={offer.id} style={[s.driverIncomingCard, offer.order.is_urgent && { borderColor: '#F5A623', borderWidth: 2 }]}><View style={s.driverIncomingTop}>{offer.order.is_urgent ? <UrgentTag /> : null}<View style={s.driverFeeHighlight}><Text style={s.driverFeeLabel}>أجرة التوصيل</Text><Text style={s.driverFeeValue}>{numberFormatter.format(offer.order.delivery_fee_minor)} ل.س</Text></View></View><Text style={s.driverOfferRequest}>{offer.order.request_text}</Text><OrderImageGallery orderId={offer.order.id} defaultOpen/><View style={s.driverOfferDestination}><View style={s.driverOfferSectionTitle}><SymbolView name={{ios:'mappin.and.ellipse',android:'location_on',web:'location_on'}} tintColor={c.primary} size={17}/><Text style={s.dropoffTitle}>مكان التوصيل</Text></View>{offer.order.address?<><Text style={s.dropoffText}>{offer.order.address.street}{offer.order.address.building?'، بناء '+offer.order.address.building:''}</Text><Text style={s.dropoffText}>{offer.order.address.neighborhood}، {offer.order.address.city}{offer.order.address.landmark?' · '+offer.order.address.landmark:''}</Text></>:<Text style={s.dropoffText}>عم نحمل عنوان التوصيل…</Text>}</View><OfferCountdown expiresAt={offer.expires_at}/><View style={s.offerActions}><Pressable disabled={busy || !profile.is_online || !online || operationsAreStale || !offer.order.address} onPress={() => void accept(offer.id)} style={[s.acceptOffer,(busy || !online || operationsAreStale || !offer.order.address)&&s.disabled]} accessibilityRole="button"><Text style={s.acceptOfferText}>{pendingAction===`accept-${offer.id}`?'لحظة…':'قبول العرض'}</Text></Pressable><Pressable disabled={busy || !online || operationsAreStale} onPress={() => void decline(offer.id)} style={[s.declineOffer,(busy || !online || operationsAreStale)&&s.disabled]} accessibilityRole="button"><Text style={s.declineOfferText}>رفض</Text></Pressable></View></View>) : <View style={s.noOffers}><View style={s.emptyIconWrap}><SymbolView name={{ios:'sparkles',android:'new_releases',web:'new_releases'}} tintColor={c.primary} size={26}/></View><Text style={s.noOffersTitle}>ما في عروض حالياً</Text><Text style={s.noOffersCopy}>لما يوصلك عرض جديد بيظهر هون. فيك تحدّث القائمة بأي وقت.</Text></View>}
    </View><View style={orderSection === 'active' ? undefined : s.hidden}>{!!activeOrders.length && <>{activeOrders.map(renderActiveOrder)}</>}
    {!activeOrders.length && <View style={s.noOffers}><View style={s.emptyIconWrap}><SymbolView name={{ios:'shippingbox.fill',android:'local_shipping',web:'local_shipping'}} tintColor={c.primary} size={26}/></View><Text style={s.noOffersTitle}>ما عندك طلبات نشطة</Text><Text style={s.noOffersCopy}>بعد قبول عرض، تفاصيله وخطوات التوصيل بتظهر هون.</Text></View>}</View><View style={orderSection === 'history' ? undefined : s.hidden}>{renderHistory()}</View></>}
    </></StaggeredSections>}
    {screen==='home'&&<Modal visible={open} transparent animationType="slide" onRequestClose={closeSheet}>
      <Pressable style={s.sheetBackdrop} onPress={closeSheet} accessibilityLabel="إغلاق"><Pressable style={s.sheet} onPress={()=>{}}>
        {live&&<>
        <View style={s.sheetHandle}/>
        <View style={s.sheetHead}>
          <View style={{flex:1,minWidth:0}}><Text style={s.sheetKicker}>مركز الطلبات المباشر</Text><Text style={s.sheetTitle}>طلباتك وعروضك</Text></View>
          <Pressable onPress={closeSheet} style={s.sheetClose} accessibilityRole="button" accessibilityLabel="إغلاق"><SymbolView name={{ios:'xmark',android:'close',web:'close'}} tintColor={c.muted} size={16}/></Pressable>
        </View>
        <View style={[s.liveCard, live.order.is_urgent && { borderColor: '#F5A623', borderWidth: 2 }]}>
          {live.order.is_urgent ? <View style={{ backgroundColor: '#F5A623', borderRadius: 14, minHeight: 34, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#2B1A00', fontSize: 15, fontWeight: '900' }}>⚡ طلب مستعجل</Text></View> : null}
          <View style={s.liveCardTop}><LiveOfferBadge expiresAt={live.expires_at}/><Text style={s.liveCardCode}>{'#'+live.id.slice(0,8)}</Text></View>
          <View style={s.liveRow}><View style={[s.liveDot,{backgroundColor:c.primary}]}/><Text style={s.liveRowLabel}>الطلب:</Text><Text numberOfLines={2} style={s.liveRowValue}>{live.order.request_text}</Text></View>
          <View style={s.liveRow}><View style={[s.liveDot,{backgroundColor:c.accent}]}/><Text style={s.liveRowLabel}>التسليم:</Text><Text numberOfLines={2} style={s.liveRowValue}>{live.order.address?`${live.order.address.neighborhood}، ${live.order.address.city}`:'عم نحمل عنوان التوصيل…'}</Text></View>
          <OrderImageGallery orderId={live.order.id} defaultOpen/>
          <View style={s.liveDivider}/>
          <View style={s.liveStats}><Text style={s.liveStat}>الأجرة: <Text style={s.liveStatValue}>{numberFormatter.format(live.order.delivery_fee_minor)} ل.س</Text></Text></View>
          <Pressable disabled={!can} onPress={() => void accept(live.id)} style={[s.liveAccept,!can&&s.disabled]} accessibilityRole="button"><Text style={s.liveAcceptText}>{pendingAction===`accept-${live.id}`?'لحظة… عم نثبّت القبول':'قبول العرض الآن'}</Text></Pressable>
        </View>
        <View style={s.offerActions}>
          <Pressable onPress={()=>{setDismissedOfferId(live.id);setOrderSection('offers');onOpenOrders()}} style={s.liveSecondary} accessibilityRole="button"><Text style={s.liveSecondaryText}>عرض كل الطلبات</Text></Pressable>
          <Pressable disabled={busy||!online||operationsAreStale} onPress={()=>void decline(live.id)} style={[s.liveClose,(busy||!online||operationsAreStale)&&s.disabled]} accessibilityRole="button"><Text style={s.liveCloseText}>رفض</Text></Pressable>
        </View>
        </>}
      </Pressable></Pressable>
    </Modal>}
    {screen==='home'&&<Modal visible={balanceOpen&&isActive} transparent animationType="slide" onRequestClose={()=>setBalanceOpen(false)}>
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
    {isActive&&<Modal visible={!!deliveredReceipt} animationType="slide" onRequestClose={()=>setDeliveredReceipt(null)}>
      <SafeAreaView style={[s.safe,{flex:1}]}>
        <ScrollView contentContainerStyle={{padding:16,gap:14,paddingBottom:28}}>
          <View style={{alignItems:'center',gap:6,paddingVertical:8}}><View style={{width:58,height:58,borderRadius:29,backgroundColor:c.primary,alignItems:'center',justifyContent:'center'}}><Text style={{color:'#0B1411',fontSize:30,fontWeight:'900'}}>✓</Text></View><Text style={{color:c.text,fontSize:19,fontWeight:'900'}}>صار! الطلب انسلّم</Text><Text style={{color:c.muted,fontSize:13}}>هاد إيصال الطلب</Text></View>
          {deliveredReceipt&&<OrderReceipt data={deliveredReceipt}/>}
          <Pressable onPress={()=>setDeliveredReceipt(null)} accessibilityRole="button" style={{minHeight:52,borderRadius:16,backgroundColor:c.primary,alignItems:'center',justifyContent:'center'}}><Text style={{color:'#0B1411',fontSize:16,fontWeight:'900'}}>تمام</Text></Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>}
    {isActive&&<Modal visible={!!deliveryDraft} animationType="slide" onRequestClose={()=>{if(!busy)closeDeliveryDraft()}}>
      <SafeAreaView style={[s.safe,{flex:1}]}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
        <View style={{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingVertical:12,borderBottomWidth:1,borderBottomColor:c.border}}>
          <Text style={{color:c.text,fontSize:19,fontWeight:'900'}}>تأكيد تسليم الطلب</Text>
          <Pressable disabled={busy} onPress={closeDeliveryDraft} accessibilityRole="button" accessibilityLabel="إغلاق" style={{width:40,height:40,borderRadius:20,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'}}><SymbolView name={{ios:'xmark',android:'close',web:'close'}} tintColor={c.muted} size={16}/></Pressable>
        </View>
        <KeyboardScroll style={{flex:1}} contentContainerStyle={{padding:16,gap:12,paddingBottom:24}}>
          {deliveryDraft&&<Image source={{uri:deliveryDraft.uri}} contentFit="cover" style={{width:'100%',height:230,borderRadius:18,backgroundColor:c.raised}} accessibilityLabel="صورة التسليم"/>}
          {deliveryDraft&&deliveryUpload&&deliveryUpload.uri===deliveryDraft.uri&&<View style={{gap:6}} accessibilityRole="progressbar" accessibilityLabel="رفع صورة الإثبات">
            <View style={{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'}}>
              <Text style={{color:deliveryUpload.status==='error'?c.danger:deliveryUpload.status==='done'?c.accent:c.muted,fontSize:12.5,fontWeight:'800'}}>{deliveryUpload.status==='done'?'✓ انرفعت الصورة':deliveryUpload.status==='error'?'ما انرفعت الصورة، رح نعيد المحاولة عند التأكيد':`عم نرفع الصورة… ${Math.round(deliveryUpload.progress*100)}%${deliveryUpload.attempt>1?` · محاولة ${deliveryUpload.attempt}/3`:''}`}</Text>
              {deliveryUpload.status==='error'&&online?<Pressable onPress={()=>void beginDeliveryUpload(deliveryDraft.orderId,deliveryDraft.uri,deliveryDraft.mimeType)} accessibilityRole="button" hitSlop={8}><Text style={{color:c.primary,fontSize:12.5,fontWeight:'900'}}>إعادة المحاولة</Text></Pressable>:null}
            </View>
            <View style={{height:6,borderRadius:3,backgroundColor:c.raised,overflow:'hidden',flexDirection:'row-reverse'}}><View style={{width:`${Math.round((deliveryUpload.status==='done'?1:deliveryUpload.progress)*100)}%`,backgroundColor:deliveryUpload.status==='error'?c.danger:'#B7FF30',borderRadius:3}}/></View>
          </View>}
          <Pressable disabled={busy} onPress={()=>{const id=deliveryDraft?.orderId;closeDeliveryDraft();if(id)setTimeout(()=>void startDeliveryPhoto(id),450)}} accessibilityRole="button" style={{minHeight:44,borderRadius:14,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'}}><Text style={{color:c.primary,fontSize:13.5,fontWeight:'800'}}>📷 إعادة التصوير</Text></Pressable>
          <View style={{gap:6}}><Text style={{color:c.text,fontSize:13.5,fontWeight:'800',textAlign:'right'}}>المبلغ اللي استلمته من الزبون · ل.س</Text>
            <TextInput value={deliveryDraft?collectDrafts[deliveryDraft.orderId]??'':''} onChangeText={(value)=>{if(deliveryDraft)setCollectDrafts((current)=>({...current,[deliveryDraft.orderId]:value.replace(/\D/g,'')}))}} keyboardType="number-pad" textAlign="left" placeholder="مثال: 13000" placeholderTextColor="#839188" style={[s.field,{fontSize:22,fontWeight:'900',color:c.primary}]} accessibilityLabel="المبلغ المستلم من الزبون"/>
            <Text style={{color:c.muted,fontSize:12,textAlign:'right',lineHeight:19}}>معبّأ بالمبلغ المطلوب (المشتريات + الأجرة). عدّله إذا أعطاك الزبون زيادة (إكرامية) أو أقل.</Text></View>
          <View style={{gap:6}}><Text style={{color:c.text,fontSize:13.5,fontWeight:'800',textAlign:'right'}}>ملاحظة <Text style={{color:c.muted,fontWeight:'500'}}>اختياري</Text></Text>
            <TextInput value={deliveryNote} onChangeText={(value)=>setDeliveryNote(value.slice(0,300))} multiline maxLength={300} textAlign="right" textAlignVertical="top" placeholder="مثال: الزبون أعطاني إكرامية، أو سلّمته للجار" placeholderTextColor="#839188" style={[s.field,{minHeight:84}]} accessibilityLabel="ملاحظة التسليم"/></View>
        </KeyboardScroll>
        <View style={{paddingHorizontal:16,paddingTop:8,paddingBottom:12,borderTopWidth:1,borderTopColor:c.border}}>
          <Pressable disabled={busy||!online} onPress={()=>void submitDelivery()} accessibilityRole="button" style={{minHeight:56,borderRadius:18,backgroundColor:'#B7FF30',alignItems:'center',justifyContent:'center',opacity:busy||!online?0.55:1}}><Text style={{color:'#0B1411',fontSize:17,fontWeight:'900'}}>{pendingAction==='delivery-upload'?`عم نرفع صورة الإثبات…${deliveryUpload&&deliveryUpload.status==='uploading'?' '+Math.round(deliveryUpload.progress*100)+'%':''}`:pendingAction==='delivery-confirm'?'عم نأكد التسليم…':busy?'عم نحفظ…':'✅ تم تسليم الطلب'}</Text></Pressable>
        </View>
      </KeyboardAvoidingView></SafeAreaView>
    </Modal>}
  </View>;
}

function DriverApplicationFlow({ userId, initialToken, knownStatus }: { userId: string; initialToken?: string; knownStatus?: string | null }) {
  const { styles: s } = useMobileTheme();
  const online = useInternetAvailable();
  // Start from the status SignedInHome already loaded (or cached), so the card renders at once and
  // also works offline; the server check below only confirms it.
  const [status, setStatus] = useState<string | null>(knownStatus ?? null);
  const [inviteCode, setInviteCode] = useState(initialToken ?? '');
  const [vehicle, setVehicle] = useState('');
  const [busy, setBusy] = useState(false);
  const [, setMessage] = useToastMessage();
  const [checked, setChecked] = useState(knownStatus !== undefined);
  useEffect(() => {
    if (!supabase || !online) return;
    supabase.from('driver_profiles').select('review_status').eq('user_id', userId).maybeSingle().then(({ data }) => { setStatus(data?.review_status ?? null); setChecked(true); });
  }, [online, userId]);
  const autoTried = useRef(false);
  const apply = async () => {
    if (!supabase) return;
    const token = inviteCode.replace(/\s/g, '').toLowerCase();
    if (token.length !== 64 || !/^[a-f0-9]{64}$/.test(token)) { setMessage('رمز الدعوة لازم يكون كامل وصالح.'); return; }
    setBusy(true); setMessage('');
    const { data, error } = await supabase.rpc('redeem_driver_invite', { p_token: token, p_vehicle_description: vehicle.trim() || undefined });
    setBusy(false);
    if (error) { setMessage('الدعوة غير صالحة أو منتهية أو مستخدمة من قبل. راجع الرمز مع فريق لَبّيك.'); return; }
    setStatus(data); setInviteCode(''); setMessage(data === 'approved' ? 'أهلاً فيك بفريق لَبّيك! صرت سائق.' : 'وصل طلب انضمامك لفريق لَبّيك. رح نراجع معلوماتك.');
  };
  useEffect(() => {
    if (autoTried.current || !checked || status !== null || !online) return;
    if (!/^[a-f0-9]{64}$/i.test(initialToken ?? '')) return;
    autoTried.current = true; void apply();
  }, [checked, status, online, initialToken]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!checked) return <View accessibilityRole="progressbar" accessibilityLabel="تحميل حالة طلب الانضمام" style={[s.driverApplyCard, { minHeight: 166, justifyContent: 'center', gap: 14 }]}><SkeletonBlock width="46%" height={18} /><SkeletonBlock width="82%" height={12} /><SkeletonBlock width="66%" height={12} /></View>;
  if (status === 'approved') return <DriverOperations userId={userId}/>;
  return <View style={s.driverApplyCard}><View style={s.driverApplyMark}><Text style={s.driverApplyIcon}>♙</Text></View><Text style={s.driverApplyTitle}>انضم لفريق السائقين</Text>{status ? <><Text style={s.driverApplyCopy}>{status === 'pending' ? 'طلبك قيد المراجعة. رح يتواصل معك الفريق بعد التحقق.' : status === 'approved' ? 'تم اعتماد حسابك. واجهة السائق قيد التجهيز.' : status === 'suspended' ? 'حساب السائق موقوف حالياً. تواصل مع فريق لَبّيك.' : 'تمت مراجعة الطلب. تواصل مع الفريق إذا بدك تعرف التفاصيل.'}</Text><Text style={s.driverStatus}>{status === 'pending' ? 'بانتظار المراجعة' : status === 'approved' ? 'سائق معتمد' : status === 'suspended' ? 'موقوف' : 'مرفوض'}</Text></> : <><Text style={s.driverApplyCopy}>إذا وصلك رمز دعوة من فريق لَبّيك، دخّله حتى نبدأ مراجعة طلبك.</Text><Text style={s.label}>رمز الدعوة</Text><TextInput value={inviteCode} onChangeText={setInviteCode} autoCapitalize="none" autoCorrect={false} textAlign="left" placeholder="64 حرفاً" placeholderTextColor="#839188" style={s.field} accessibilityLabel="رمز دعوة السائق"/><Text style={s.label}>نوع المركبة <Text style={s.optional}>اختياري</Text></Text><TextInput value={vehicle} onChangeText={setVehicle} placeholder="دراجة، سيارة..." placeholderTextColor="#839188" style={s.field} accessibilityLabel="نوع المركبة" maxLength={160}/><Pressable disabled={busy} onPress={() => void apply()} style={[s.saveAddress,busy&&s.disabled]} accessibilityRole="button"><Text style={s.saveAddressText}>{busy?'عم نتحقق…':'إرسال طلب الانضمام'} <Text style={s.submitArrow}>←</Text></Text></Pressable></>}</View>;
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
  // Pull down to reload: work screens (offers/orders/history), profile and unread count together.
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const operationsRefresh = useRef<((forceNetwork?: boolean) => Promise<void>) | null>(null);
  const registerRefresh = useCallback((refresh: (forceNetwork?: boolean) => Promise<void>) => { operationsRefresh.current = refresh; }, []);
  const pullRefresh = async () => {
    if (pullRefreshing) return;
    setPullRefreshing(true);
    let probeTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      let forceNetwork = false;
      if (!online) {
        if (!supabase) { setMessage('ما قدرنا نوصل للخدمة. جرّب التحديث مرة ثانية.'); return; }
        const reachable = await Promise.race([
          supabase.auth.getUser().then(() => ['reachable', 'degraded'].includes(getBackendHealth())).catch(() => false),
          new Promise<boolean>((resolve) => { probeTimeout = setTimeout(() => resolve(false), 8000); }),
        ]);
        if (!reachable) { setMessage('ما قدرنا نوصل للخدمة. تأكد من الإنترنت وحاول التحديث.'); return; }
        forceNetwork = true;
      }
      setProfileRefreshKey((value) => value + 1);
      await operationsRefresh.current?.(forceNetwork);
    } finally { if (probeTimeout) clearTimeout(probeTimeout); setPullRefreshing(false); }
  };
  const [, setMessage] = useToastMessage();
  const [tabScale] = useState(() => new Animated.Value(1));
  const [activeTabAnimation, setActiveTabAnimation] = useState<'home' | 'orders' | 'notifications' | 'profile'>('home');
  // The driver's own profile is cached on the device so the workspace opens without waiting for it.
  useEffect(() => {
    let active = true;
    void readPersisted<DriverProfileDraft>(cacheKey(userId, 'driver-profile'), 30 * 24 * 60 * 60 * 1000).then((entry) => {
      if (!active || !entry || profileLoaded.current) return;
      const cached = { ...entry.value, avatarUrl: entry.value.avatarPath ? peekSignedImageUrl('profile-avatars', entry.value.avatarPath) : null, avatarDraft: null };
      setProfile(cached); setName(cached.name); setPhone(cached.phone); setAge(cached.age);
      profileLoaded.current = true; setLoading(false);
    });
    return () => { active = false; };
  }, [userId]);
  useEffect(() => {
    if (!supabase || !online) return;
    let active = true;
    const refreshUnreadCount = async () => {
      const { count, error } = await supabase!.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
      if (active && !error) setNotificationCount(count ?? 0);
    };
    void refreshUnreadCount();
    const countScheduler = createRefreshScheduler(async () => { await refreshUnreadCount(); }, 400);
    const channel = supabase.channel(`driver-notification-count-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, () => countScheduler.schedule())
      .subscribe();
    return () => { active = false; countScheduler.cancel(); void supabase?.removeChannel(channel); };
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
    // Only the very first load shows the skeleton. Later reloads (reconnects, a flapping
    // "internet reachable" flag) happen quietly so the operations screen is never unmounted.
    if (!profileLoaded.current) setLoading(true);
    setProfileLoadError('');
    void Promise.all([
      supabase.from('profiles').select('display_name,avatar_path').eq('id', userId).maybeSingle(),
      supabase.from('driver_profiles').select('phone_e164,age').eq('user_id', userId).maybeSingle(),
    ]).then(async ([account, driver]) => {
      if (!active) return;
      if (account.error || driver.error) throw account.error ?? driver.error;
      const avatarPath = account.data?.avatar_path ?? null;
      const loaded: DriverProfileDraft = {
        name: account.data?.display_name ?? '',
        phone: (driver.data?.phone_e164 ?? '').replace(/^\+963/, ''),
        age: driver.data?.age == null ? '' : String(driver.data.age),
        avatarPath,
        avatarUrl: avatarPath ? peekSignedImageUrl('profile-avatars', avatarPath) : null,
        avatarDraft: null,
      };
      // Show the profile now; the avatar link is signed afterwards instead of holding up the screen.
      setProfile(loaded); setName(loaded.name); setPhone(loaded.phone); setAge(loaded.age);
      profileLoaded.current = true;
      writePersisted(cacheKey(userId, 'driver-profile'), { ...loaded, avatarUrl: null });
      setLoading(false);
      if (avatarPath && !loaded.avatarUrl) {
        const avatar = await signedImageUrl('profile-avatars', avatarPath);
        if (active && avatar) setProfile((current) => current.avatarPath === avatarPath ? { ...current, avatarUrl: avatar } : current);
      }
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
    const picked = result.assets[0];
    // A profile photo is shown at most ~120 px wide: 512 px keeps it sharp at a fraction of the size.
    const shrunk = await shrinkPhoto(picked, 512, 0.8);
    const asset = shrunk ? { ...picked, uri: shrunk.uri, mimeType: shrunk.mimeType, fileSize: undefined } : picked;
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) { setMessage('حجم الصورة أكبر من 5 ميغابايت. اختار صورة أصغر.'); return; }
    const mimeType = asset.mimeType?.toLowerCase() ?? 'image/jpeg';
    const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' } as Record<string, string>)[mimeType];
    if (!extension) { setMessage('اختار صورة JPEG أو PNG أو WebP أو HEIC.'); return; }
    setAvatarDraft({ uri: asset.uri, mimeType, extension }); setMessage('اختيرت الصورة. احفظ الملف الشخصي لتثبيتها.');
  };
  const phoneIsValid = /^9\d{8}$/.test(normalizeSyrianMobile(phone));
  const save = async () => {
    const normalizedPhone = normalizeSyrianMobile(phone);
    const parsedAge = Number(normalizeDigits(age));
    if (name.trim().length < 2) { setMessage('اكتب اسمك الكامل حتى يتعرف عليك الزبون.'); return; }
    if (!phoneIsValid) { setMessage('أدخل رقم موبايل سوري من 9 أرقام يبدأ بـ 9.'); return; }
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
      avatarUrl = await signedImageUrl('profile-avatars', uploadedAvatarPath);
      if (profile.avatarPath) await supabase.storage.from('profile-avatars').remove([profile.avatarPath]);
    }
    const saved = { name: name.trim(), phone: normalizedPhone, age: String(parsedAge), avatarPath: uploadedAvatarPath ?? profile.avatarPath, avatarUrl, avatarDraft: null };
    writePersisted(cacheKey(userId, 'driver-profile'), { ...saved, avatarUrl: null });
    setProfile(saved); setPhone(normalizedPhone); setAge(String(parsedAge)); setAvatarDraft(null); setBusy(false); setMessage('تم حفظ تعديلات ملفك.'); setEditingProfile(false);
  };
  const avatar = avatarDraft?.uri ?? profile.avatarUrl;
  const avatarImage = avatar ? avatarSource(avatar, avatarDraft ? null : profile.avatarPath) : null;
  const initial = (profile.name.trim()[0] ?? email[0] ?? 'س').toLocaleUpperCase('ar');
  return <SafeAreaView style={s.safe}>
    <View accessibilityRole="main" style={{ flex: 1 }}>
      <View style={s.header}>
        <Pressable onPress={() => goTab('profile')} accessibilityRole="button" accessibilityLabel="فتح الملف الشخصي للسائق" style={s.driverHeaderProfile}>
          <View style={s.driverHeaderAvatar}>{avatarImage ? <Image source={avatarImage} cachePolicy="memory-disk" style={s.avatarImage} contentFit="cover"/> : <Text style={s.accountAvatarLargeText}>{initial}</Text>}</View>
        </Pressable>
        <View style={s.brand}><View style={s.brandMark}><Image source={require('../../assets/images/labbayk-delivery-logo.png')} style={s.brandLogo} contentFit="contain" accessibilityLabel="شعار لَبّيك"/></View><View><Text style={s.brandName}>لَبّيك</Text><Text style={s.brandTag}>مساحة السائق</Text></View></View>
      </View>
      <KeyboardScroll style={s.bodyScroll} contentContainerStyle={s.driverContent} refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={() => void pullRefresh()} tintColor={c.primary} colors={[c.primary]} progressBackgroundColor={c.surface} />}>
        <StaggeredSections transitionKey={`${tab}-${loading ? 'loading' : 'ready'}`} animateSingle>
        {tab === 'home' ? <>
          {loading ? <DriverOperationsSkeleton screen="home"/> : profileLoadError ? <View style={s.driverOnboardingCard}><Text style={s.driverOnboardingTitle}>ما قدرنا نحمّل ملفك</Text><Text style={s.driverOnboardingCopy}>{profileLoadError}</Text><Pressable disabled={!online} onPress={() => { setLoading(true); setProfileRefreshKey((value) => value + 1); }} style={[s.driverOnboardingButton,!online&&s.disabled]} accessibilityRole="button"><Text style={s.driverOnboardingButtonText}>{online?'إعادة المحاولة':'بانتظار الاتصال'}</Text></Pressable></View> : !profileComplete ? <View style={s.driverOnboardingCard}>
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
          <View style={[s.driverPageIntro,{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}]}><Text style={[s.accountPageTitle,{color:c.primary}]}>الطلبات</Text><Pressable disabled={pullRefreshing} onPress={() => void pullRefresh()} style={[s.driverToolbarRefresh, pullRefreshing && s.disabled]} accessibilityRole="button" accessibilityLabel="تحديث طلبات السائق"><SymbolView name={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }} tintColor={c.primary} size={15}/><Text style={s.driverToolbarRefreshText}>{pullRefreshing ? 'لحظة…' : 'تحديث'}</Text></Pressable></View>
          {loading && <DriverOperationsSkeleton screen="orders"/>}
          {profileLoadError && <View style={[s.driverOnboardingCard,{marginTop:12}]}><Text style={s.driverOnboardingTitle}>ما قدرنا نحمّل بياناتك</Text><Text style={s.driverOnboardingCopy}>{profileLoadError}</Text><Pressable disabled={!online} onPress={() => { setLoading(true); setProfileRefreshKey((value) => value + 1); }} style={[s.driverOnboardingButton,!online&&s.disabled]} accessibilityRole="button"><Text style={s.driverOnboardingButtonText}>{online?'إعادة المحاولة':'بانتظار الاتصال'}</Text></Pressable></View>}
        </> : tab === 'profile' ? <>
          <View style={[s.driverPageIntro,editingProfile&&{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12}]}><View style={{flex:1,minWidth:0}}><Text style={s.accountPageTitle}>ملف السائق</Text><Text style={s.accountPageSubtitle}>الزبون وفريق لَبّيك بيستخدموا هالمعلومات للتواصل.</Text></View>{editingProfile&&<Pressable onPress={() => { setName(profile.name); setPhone(profile.phone); setAge(profile.age); setAvatarDraft(null); setEditingProfile(false); }} style={[s.backNavigation,{alignSelf:'auto',marginBottom:0}]} accessibilityRole="button" accessibilityLabel="العودة إلى الملف الشخصي"><Text style={s.backNavigationText}>رجوع</Text></Pressable>}</View>
          <View style={s.driverProfileCard}>
            {loading ? <View accessibilityRole="progressbar" accessibilityLabel="تحميل الملف الشخصي" style={{gap:15,paddingVertical:8}}><SkeletonBlock width={94} height={94} style={{alignSelf:'center',borderRadius:47}}/><SkeletonBlock width="37%" height={13}/><SkeletonBlock width="100%" height={48} style={{alignSelf:'auto',borderRadius:12}}/><SkeletonBlock width="31%" height={13}/><SkeletonBlock width="100%" height={48} style={{alignSelf:'auto',borderRadius:12}}/><SkeletonBlock width="100%" height={48} style={{alignSelf:'auto',borderRadius:12}}/></View> : profileLoadError ? <View><Text style={s.driverIdentityName}>ما قدرنا نحمّل ملفك</Text><Text style={[s.driverOnboardingCopy,{marginTop:8}]}>{profileLoadError}</Text><Pressable disabled={!online} onPress={() => { setLoading(true); setProfileRefreshKey((value) => value + 1); }} style={[s.driverOnboardingButton,{marginTop:14},!online&&s.disabled]} accessibilityRole="button"><Text style={s.driverOnboardingButtonText}>{online?'إعادة المحاولة':'بانتظار الاتصال'}</Text></Pressable></View> : editingProfile ? <>
              <View style={s.driverPhotoRing}>{avatarImage ? <Image source={avatarImage} cachePolicy="memory-disk" style={s.driverPhotoImage} contentFit="cover" accessibilityLabel="صورة السائق"/> : <Text style={s.driverPhotoInitial}>{initial}</Text>}</View>
              <Pressable onPress={() => void choosePhoto()} disabled={busy} style={s.driverPhotoButton} accessibilityRole="button"><SymbolView name={{ ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' }} tintColor={c.primary} size={16}/><Text style={s.driverPhotoButtonText}>{avatar ? 'تغيير الصورة' : 'إضافة صورة شخصية'}</Text></Pressable>
              <Text style={[s.label,s.driverRightText]}>الاسم الكامل</Text><TextInput value={name} onChangeText={setName} maxLength={120} textAlign="right" placeholder="الاسم كما يظهر للزبائن" placeholderTextColor={c.muted} style={s.driverInput} accessibilityLabel="الاسم الكامل للسائق"/>
              <Text style={[s.label,s.driverRightText]}>البريد الإلكتروني</Text><View style={[s.driverReadOnlyField,s.driverRightContent]}><Text selectable style={s.driverEmailText}>{email}</Text><Text style={s.driverFieldHint}>بريد تسجيل الدخول · غير قابل للتعديل</Text></View>
              <Text style={[s.label,s.driverRightText]}>رقم الموبايل السوري <Text style={s.driverRequired}>إلزامي</Text></Text><View style={s.driverPhoneRow}><TextInput value={formatSyrianMobile(phone)} onChangeText={(value) => setPhone(normalizeSyrianMobile(value))} keyboardType="phone-pad" maxLength={12} textAlign="right" placeholder="0944 123 456" placeholderTextColor={c.muted} style={s.driverPhoneInput} accessibilityLabel="رقم الموبايل السوري"/></View>
              <Text style={s.label}>العمر <Text style={s.driverRequired}>إلزامي · 18 سنة أو أكثر</Text></Text><TextInput value={age} onChangeText={(value) => setAge(normalizeDigits(value).slice(0, 2))} keyboardType="number-pad" maxLength={2} textAlign="right" placeholder="العمر بالسنوات" placeholderTextColor={c.muted} style={s.driverInput} accessibilityLabel="عمر السائق"/>
              <Pressable disabled={busy || loading || !phoneIsValid} onPress={() => void save()} style={[s.driverSaveButton, (busy || loading || !phoneIsValid) && s.disabled]} accessibilityRole="button"><Text style={s.driverSaveButtonText}>{busy ? 'عم نحفظ بياناتك…' : 'حفظ التعديلات'}</Text></Pressable>
            </> : <>
              <View style={s.driverIdentityRow}>
                <View style={s.driverIdentityAvatar}>{avatarImage ? <Image source={avatarImage} cachePolicy="memory-disk" style={s.driverPhotoImage} contentFit="cover" accessibilityLabel="صورة السائق"/> : <Text style={s.driverPhotoInitial}>{initial}</Text>}</View>
                <View style={s.driverIdentityCopy}><Text style={s.driverIdentityName} numberOfLines={2}>{profile.name || 'أضف اسمك'}</Text><Text selectable style={[s.driverIdentityEmail,{writingDirection:'ltr'}]}>{email}</Text><Text selectable style={[s.driverIdentityEmail,{writingDirection:'ltr'}]}>{profile.phone ? ltrPhone(formatSyrianMobile(profile.phone)) : 'غير مضاف'}</Text></View>
              </View>
              <Pressable onPress={() => { setName(profile.name); setPhone(profile.phone); setAge(profile.age); setAvatarDraft(null); setEditingProfile(true); }} style={[s.profileSectionAction,s.profileSectionActionPrimary]} accessibilityRole="button"><Text style={[s.profileSectionActionText,s.profileSectionActionTextPrimary]}>تعديل الملف الشخصي</Text><SymbolView name={{ ios: 'pencil', android: 'edit', web: 'edit' }} tintColor={theme === 'light' ? '#17210F' : c.background} size={17}/></Pressable>
            </>}
          </View>
          {!editingProfile&&<>
            <View style={s.profileSectionCard}><View style={s.profileSectionHeading}><View style={s.profileHeadingIcon}><SymbolView name={{ ios: 'circle.lefthalf.filled', android: 'contrast', web: 'contrast' }} tintColor={c.primary} size={21}/></View><Text style={s.profileSectionTitle}>المظهر</Text></View><Pressable onPress={onToggleTheme} accessibilityRole="switch" accessibilityState={{ checked: theme === 'dark' }} accessibilityLabel={theme === 'dark' ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'} style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 }}><View style={s.profileThemeCopy}><Text style={s.profileThemeTitle}>الوضع {theme === 'dark' ? 'الداكن' : 'الفاتح'}</Text><Text style={s.profileThemeHint}>التبديل إلى الوضع {theme === 'dark' ? 'الفاتح' : 'الداكن'}</Text></View><View style={{ width: 52, height: 30, borderRadius: 15, backgroundColor: theme === 'dark' ? '#779C38' : c.border, justifyContent: 'center' }}><View style={{ position: 'absolute', left: theme === 'dark' ? 25 : 3, top: 3, width: 24, height: 24, borderRadius: 12, backgroundColor: '#F5F5F5' }}/></View></Pressable></View>
            <View style={{ height: 12 }} />
            <PushStatusCard userId={userId} />
            <LegalLinksSection theme={theme}/>
            <Pressable onPress={onSignOut} style={[s.profileLogout,{marginTop:64}]} accessibilityRole="button"><SymbolView name={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' }} tintColor={c.danger} size={18}/><Text style={s.profileLogoutText}>تسجيل الخروج</Text></Pressable>
            <Text style={s.versionStamp}>{buildStamp}</Text>
          </>}
        </> : null}
        </StaggeredSections>
        {(visitedTabs.home || visitedTabs.orders) && !loading && !profileLoadError && (operationsScreen === 'orders' || profileComplete) && <View style={tab === 'home' || tab === 'orders' ? undefined : s.hidden}>
          {tab === 'home' && <PushWarning userId={userId} onOpen={() => goTab('profile')} />}
          <DriverOperations key={userId} onRegisterRefresh={registerRefresh} userId={userId} screen={operationsScreen} isActive={tab === 'home' || tab === 'orders'} profileComplete={profileComplete} onCompleteProfile={() => goTab('profile')} onOpenOrders={() => goTab('orders')}/>
        </View>}
        {tab === 'notifications' && <View style={s.driverPageIntro}><Text style={s.accountPageTitle}>التنبيهات</Text><Text style={s.accountPageSubtitle}>اضغط عليه لتفتح الطلب.</Text></View>}
        {visitedTabs.notifications && <View style={tab === 'notifications' ? undefined : s.hidden}><EntranceSection transitionKey="notifications"><NotificationBoundary><NotificationInbox userId={userId} standalone active={tab === 'notifications'} onUnreadCountChange={setNotificationCount} onOpenOrder={() => goTab('orders')}/></NotificationBoundary></EntranceSection></View>}
      </KeyboardScroll>
      <View style={s.driverFooter}>{([{ key: 'home', label: 'الرئيسية', ios: 'house.fill', android: 'home' }, { key: 'orders', label: 'الطلبات', ios: 'shippingbox.fill', android: 'local_shipping' }, { key: 'notifications', label: 'التنبيهات', ios: 'bell.fill', android: 'notifications' }, { key: 'profile', label: 'حسابي', ios: 'person.crop.circle.fill', android: 'person' }] as const).map(({ key, label, ios, android }) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={key === 'notifications' && notificationCount > 0 ? `${label}، ${notificationCount} تنبيه غير مقروء` : label} accessibilityState={{ selected: tab === key }} onPress={() => goTab(key)} style={[s.driverFooterButton, tab === key && s.driverFooterButtonActive]}><View style={s.driverFooterIconWrap}><Animated.View style={[s.footerIcon, { transform: [{ scale: activeTabAnimation === key ? tabScale : 1 }] }]}><SymbolView name={{ ios, android, web: android }} tintColor={tab === key ? (theme === 'light' ? '#17210F' : c.background) : c.muted} size={20}/></Animated.View>{key==='notifications'&&notificationCount>0?<View style={s.driverTabBadge}><Text style={s.driverTabBadgeText}>{notificationCount>99?'99+':notificationCount}</Text></View>:null}</View><Text style={[s.driverFooterLabel, tab === key && s.driverFooterLabelActive]}>{label}</Text></Pressable>)}</View>
    </View>
  </SafeAreaView>;
}

function SignedInHome({ userId, email, inviteToken, openOrderId, onSignOut, theme, onToggleTheme }: { userId: string; email: string; inviteToken?: string; openOrderId?: string; onSignOut: () => void; theme: 'dark' | 'light'; onToggleTheme: () => void }) {
  const online = useInternetAvailable();
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const serverChecked = useRef(false);
  // Route instantly from the last known role, then confirm with the server in the background.
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(`labbayk-role-${userId}`).then((raw) => {
      if (!active || !raw || serverChecked.current) return;
      try {
        const cached = JSON.parse(raw) as { reviewStatus?: string | null; roles?: string[] };
        if (Array.isArray(cached.roles)) { setReviewStatus(cached.reviewStatus ?? null); setRoles(cached.roles); setChecked(true); }
      } catch { /* ignore a corrupt cache */ }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [userId]);
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
        if (active) {
          const nextRoles = roleRows?.map((row) => row.role) ?? [];
          serverChecked.current = true;
          setReviewStatus(driver?.review_status ?? null); setRoles(nextRoles);
          void AsyncStorage.setItem(`labbayk-role-${userId}`, JSON.stringify({ reviewStatus: driver?.review_status ?? null, roles: nextRoles })).catch(() => undefined);
        }
      } finally { if (active) setChecked(true); }
    })();
    return () => { active = false; };
  }, [online, userId]);
  if (supabase && online && !checked) return <AppShellSkeleton />;
  if (roles.includes('super_admin')) return <AdminWorkspace userId={userId} email={email} onSignOut={onSignOut} theme={theme} onToggleTheme={onToggleTheme}/>;
  if (reviewStatus !== 'approved') return <CustomerHome key={inviteToken ?? 'customer-home'} userId={userId} email={email} inviteToken={inviteToken} openOrderId={openOrderId} showDriverFlow={!!inviteToken || !!reviewStatus} driverStatus={reviewStatus} onSignOut={onSignOut} theme={theme} onToggleTheme={onToggleTheme}/>;
  return <DriverWorkspace userId={userId} email={email} onSignOut={onSignOut} theme={theme} onToggleTheme={onToggleTheme}/>;
}

type AdminMobileOrder = Pick<Database['public']['Tables']['orders']['Row'], 'id'|'customer_id'|'address_id'|'delivered_at'|'delivery_proof_path'|'purchase_amount_minor'|'request_text'|'status'|'delivery_fee_minor'|'delivery_quote_set_at'|'driver_id'|'created_at'|'cash_collected_minor'|'delivery_note'|'shopping_admin_alerted_at'|'delivery_admin_alerted_at'> & { is_urgent?: boolean };
type AdminMobileDriver = Pick<Database['public']['Tables']['driver_profiles']['Row'], 'user_id'|'vehicle_description'>;

const pickupPrefix = 'الشراء من: ';
const composeRequest = (pickup: string, request: string) => pickup.trim() ? `${pickupPrefix}${pickup.trim()}\n${request.trim()}` : request.trim();
const splitPickup = (text: string) => { const match = text.match(/^الشراء من: (.+)\n([\s\S]*)$/); return match ? { pickup: match[1].trim(), body: match[2].trim() } : { pickup: '', body: text }; };
type AdminAddress = Pick<Database['public']['Tables']['addresses']['Row'], 'id' | 'label' | 'street' | 'city' | 'neighborhood' | 'building' | 'landmark' | 'contact_phone'>;
type CachedImage = { path: string; url: string; key: string };
/** Remote avatars get a stable cache key so the photo is downloaded once; local drafts don't. */
const avatarSource = (uri: string, path: string | null) => path && !uri.startsWith('file:') && !uri.startsWith('blob:') && !uri.startsWith('data:') ? { uri, cacheKey: imageCacheKey('profile-avatars', path) } : { uri };
/** Order photos with cached listing + signed URLs; renders instantly when this order was seen before. */
function useOrderImages(bucket: 'order-images' | 'delivery-proofs', orderId: string, enabled = true, proofPath?: string | null) {
  const online = useInternetAvailable();
  const fromCache = () => {
    const paths = bucket === 'delivery-proofs' && proofPath ? [proofPath] : peekOrderImagePaths(bucket, orderId);
    if (!paths) return null;
    const images = paths.flatMap((path) => { const url = peekSignedImageUrl(bucket, path); return url ? [{ path, url, key: imageCacheKey(bucket, path) }] : []; });
    return images.length === paths.length ? images : null;
  };
  const [images, setImages] = useState<CachedImage[] | null>(fromCache);
  useEffect(() => {
    if (!enabled || !online) return;
    let active = true;
    void (async () => {
      const paths = bucket === 'delivery-proofs' && proofPath ? [proofPath] : await listOrderImagePaths(bucket, orderId);
      if (!active) return;
      if (!paths) { setImages((current) => current ?? []); return; }
      const urls = paths.length ? await signedImageUrls(bucket, paths) : {};
      if (active) setImages(paths.flatMap((path) => urls[path] ? [{ path, url: urls[path], key: imageCacheKey(bucket, path) }] : []));
    })().catch(() => { if (active) setImages((current) => current ?? []); });
    return () => { active = false; };
  }, [bucket, enabled, online, orderId, proofPath]);
  return images;
}

type ReceiptData = { id: string; createdAt: string | null; deliveredAt: string | null; deliveryProofPath?: string | null; request: string; address: { neighborhood: string; city: string } | null; purchase: number | null; fee: number; collected: number | null; note: string | null; driverName?: string; customerName?: string };
// A paper-style receipt for a finished order. Commission is read here (admins from the settlement, drivers from their own wallet).
function CustomerHomeSkeleton() {
  return <View style={{ gap: 14, marginTop: 4 }} accessibilityLabel="عم نحمّل الصفحة">
    <SkeletonBlock width="100%" height={58} style={{ borderRadius: 18, alignSelf: 'stretch' }} />
    <SkeletonBlock width="100%" height={200} style={{ borderRadius: 24, alignSelf: 'stretch' }} />
    <SkeletonBlock width="100%" height={380} style={{ borderRadius: 20, alignSelf: 'stretch' }} />
  </View>;
}

function FilterSheet({ title, options, value, onSelect, onClose }: { title: string; options: { key: string; label: string; sub?: string; initial?: string }[]; value: string; onSelect: (key: string) => void; onClose: () => void }) {
  const { colors: color } = useMobileTheme();
  return <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={onClose}>
    <Pressable style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={onClose} accessibilityLabel="إغلاق">
      <Pressable onPress={() => {}} style={{ backgroundColor: color.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: color.border, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 26, maxHeight: '75%' }}>
        <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: color.border, marginBottom: 8 }} />
        <Text style={{ color: color.text, fontSize: 20, fontWeight: '900', textAlign: 'left', marginBottom: 6 }}>{title}</Text>
        <ScrollView>
          {options.map((option, index) => { const on = option.key === value; return <Pressable key={option.key} onPress={() => { onSelect(option.key); onClose(); }} accessibilityRole="radio" accessibilityState={{ selected: on }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, borderTopWidth: index ? 1 : 0, borderTopColor: color.border }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? color.primary : color.border, alignItems: 'center', justifyContent: 'center' }}>{on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color.primary }} /> : null}</View>
            {option.initial ? <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color.raised, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: color.primary, fontSize: 14, fontWeight: '900' }}>{option.initial}</Text></View> : null}
            <Text numberOfLines={1} style={{ flex: 1, color: on ? color.primary : color.text, fontSize: 16, fontWeight: on ? '900' : '700', textAlign: 'left' }}>{option.label}</Text>
            {option.sub ? <Text style={{ color: color.muted, fontSize: 13, fontWeight: '700' }}>{option.sub}</Text> : null}
          </Pressable>; })}
        </ScrollView>
      </Pressable>
    </Pressable>
  </Modal>;
}

function CancelReasonSheet({ target, busy, warning, onClose, onConfirm }: { target: { id: string; label: string } | null; busy: boolean; warning?: string; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  const [focused, setFocused] = useState(false);
  const targetId = target?.id;
  useEffect(() => { if (targetId) setReason(''); }, [targetId]);
  const ready = reason.trim().length >= 5;
  return <Modal visible={!!target} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => { if (!busy) onClose(); }} accessibilityLabel="إغلاق">
        <Pressable onPress={() => {}} style={{ backgroundColor: '#18241F', borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, borderColor: '#2B3C34', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 26, gap: 10 }}>
          <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: '#3A4B43', alignSelf: 'center', marginBottom: 6 }} />
          <Text style={{ color: '#FFFFFF', fontSize: 23, fontWeight: '900', textAlign: 'right' }}>إلغاء الطلب</Text>
          <Text numberOfLines={1} style={{ color: '#9DB3A8', fontSize: 14, textAlign: 'right' }}>{target?.label}</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900', textAlign: 'right', marginTop: 4 }}>اكتب سبب الإلغاء <Text style={{ color: '#FF8A8A' }}>*</Text></Text>
          <TextInput value={reason} onChangeText={setReason} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} multiline editable={!busy} maxLength={300} placeholder="اكتب السبب هون…" placeholderTextColor="#6B7C73" style={{ minHeight: 96, borderRadius: 16, borderWidth: 1, borderColor: ready || focused ? '#B7FF30' : '#3A4B43', backgroundColor: '#0E1613', color: '#FFFFFF', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12, textAlign: 'right', textAlignVertical: 'top', fontSize: 15 }} accessibilityLabel="سبب الإلغاء" />
          <Text style={{ color: '#6B7C73', fontSize: 12, textAlign: 'right' }}>{ready ? ' ' : 'السبب إجباري (5 أحرف على الأقل)'}</Text>
          {warning ? <View style={{ backgroundColor: '#2A2216', borderColor: '#5A4620', borderWidth: 1, borderRadius: 14, padding: 10 }}><Text style={{ color: '#F5C062', fontSize: 13, textAlign: 'right', lineHeight: 20 }}>{warning}</Text></View> : null}
          <Pressable disabled={!ready || busy} onPress={() => onConfirm(reason.trim())} accessibilityRole="button" style={{ minHeight: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: ready ? '#E5484D' : '#2A3430', marginTop: 4 }}><Text style={{ color: ready ? '#FFFFFF' : '#6B7C73', fontSize: 18, fontWeight: '900' }}>{busy ? 'لحظة…' : 'تأكيد الإلغاء'}</Text></Pressable>
          <Pressable disabled={busy} onPress={onClose} accessibilityRole="button" style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#B7FF30', fontSize: 16, fontWeight: '900' }}>رجوع، لا تلغي</Text></Pressable>
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
  </Modal>;
}

function UrgentStrip() {
  return <View style={{ backgroundColor: '#F5A623', borderRadius: 12, minHeight: 30, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#2B1A00', fontSize: 13.5, fontWeight: '900' }}>⚡ طلب مستعجل</Text></View>;
}

function UrgentTag() {
  return <View style={{ backgroundColor: '#F5A623', borderRadius: 10, paddingHorizontal: 8, minHeight: 22, justifyContent: 'center' }}><Text style={{ color: '#2B1A00', fontSize: 11.5, fontWeight: '900' }}>⚡ مستعجل</Text></View>;
}

function UrgentChip({ on, onPress, disabled }: { on: boolean; onPress: () => void; disabled?: boolean }) {
  const [glow] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (on) { glow.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([Animated.timing(glow, { toValue: 1, duration: 1300, useNativeDriver: true }), Animated.timing(glow, { toValue: 0, duration: 1300, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [on, glow]);
  return <Pressable disabled={disabled} onPress={onPress} accessibilityRole="switch" accessibilityState={{ checked: on, disabled: !!disabled }} accessibilityLabel="طلب مستعجل" style={{ minHeight: 34, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: on ? '#F5A623' : '#6B5A2A', backgroundColor: on ? 'rgba(245,166,35,0.18)' : 'transparent', flexDirection: 'row-reverse', alignItems: 'center', gap: 4, overflow: 'hidden', opacity: disabled ? 0.5 : 1 }}>
    {!on && <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#F5A623', opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.22] }) }} />}
    <Text style={{ color: on ? '#F5C268' : '#E9C98A', fontSize: 12, fontWeight: '800' }}>{on ? '✓' : '+'} ⚡ مستعجل</Text>
  </Pressable>;
}

function OrderReceipt({ data, admin = false }: { data: ReceiptData; admin?: boolean }) {
  const [commission, setCommission] = useState<number | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const load = admin
      ? supabase.from('cash_settlements').select('commission_amount_minor').eq('order_id', data.id).order('created_at', { ascending: false }).limit(1).then(({ data: rows }) => rows?.[0]?.commission_amount_minor ?? null)
      : supabase.from('driver_wallet_ledger').select('amount_minor').eq('order_id', data.id).eq('entry_type', 'delivery_commission').then(({ data: rows }) => rows?.length ? rows.reduce((sum, row) => sum + -row.amount_minor, 0) : null);
    void load.then((value) => { if (alive) setCommission(value); });
    return () => { alive = false; };
  }, [admin, data.id]);
  const ink = '#1B241E'; const muted = '#6B756D'; const line = '#DAD8CC'; const good = '#0F7A52'; const bad = '#B3341F';
  const rowDirection = admin ? 'row-reverse' as const : 'row' as const;
  const textSide = admin ? 'left' as const : 'right' as const;
  const { pickup, body } = splitPickup(data.request);
  const expected = (data.purchase ?? 0) + data.fee;
  const diff = data.collected === null ? 0 : data.collected - expected;
  const minutes = data.createdAt && data.deliveredAt ? Math.max(1, Math.round((Date.parse(data.deliveredAt) - Date.parse(data.createdAt)) / 60000)) : null;
  const row = (label: string, value: string, opts: { big?: boolean; tint?: string } = {}) => <View key={label} style={{ flexDirection: rowDirection, justifyContent: 'space-between', gap: 10, paddingVertical: opts.big ? 4 : 2 }}><Text style={{ color: opts.big ? ink : muted, fontSize: opts.big ? 15.5 : 13.5, fontWeight: opts.big ? '900' : '500', textAlign: textSide }}>{label}</Text><Text style={{ color: opts.tint ?? ink, fontSize: opts.big ? 15.5 : 13.5, fontWeight: '800' }}>{value}</Text></View>;
  const money = (value: number) => numberFormatter.format(value) + ' ل.س';
  const section = { borderTopWidth: 1, borderTopColor: line, paddingTop: 10, marginTop: 10, gap: 2 } as const;
  const net = commission === null ? null : data.fee - commission;
  return <View accessibilityLabel={`إيصال الطلب ${data.id.slice(0, 6)}`} style={{ backgroundColor: '#F6F4EC', borderRadius: 18, padding: 16 }}>
    <View style={{ flexDirection: rowDirection, justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: ink, fontSize: 16, fontWeight: '900', textAlign: textSide }}>طلب #{data.id.slice(0, 6)}</Text>
        {data.deliveredAt ? <Text style={{ color: muted, fontSize: 13, fontWeight: '700', lineHeight: 20, textAlign: textSide, writingDirection: 'rtl' }}>{shortDateTimeFormatter.format(new Date(data.deliveredAt))}</Text> : null}
        {minutes !== null ? <Text style={{ color: muted, fontSize: 12, lineHeight: 19, textAlign: textSide, writingDirection: 'rtl' }}>استغرق {minutes} د من الطلب للتسليم</Text> : null}
      </View>
      <View style={{ borderWidth: 1.5, borderColor: good, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: good, fontSize: 11.5, fontWeight: '900' }}>تم التسليم</Text></View>
    </View>
    <View style={section}>
      <Text style={{ color: ink, fontSize: 14.5, fontWeight: '800', lineHeight: 22, textAlign: textSide }}>{body}</Text>
      <Text style={{ color: muted, fontSize: 12.5, textAlign: textSide }}>من: {pickup || 'أقرب محل للسائق'}</Text>
      <Text style={{ color: muted, fontSize: 12.5, textAlign: textSide }}>إلى: {data.address ? `${data.address.neighborhood}، ${data.address.city}` : '—'}</Text>
      {admin && (data.driverName || data.customerName) ? <View style={{ flexDirection: rowDirection, justifyContent: 'space-between', gap: 8, marginTop: 4 }}><Text style={{ color: muted, fontSize: 12.5 }}>السائق: {data.driverName ?? '—'}</Text><Text style={{ color: muted, fontSize: 12.5 }}>الزبون: {data.customerName ?? '—'}</Text></View> : null}
    </View>
    <View style={section}>
      {row('المشتريات (دفعها السائق)', data.purchase === null ? '—' : numberFormatter.format(data.purchase))}
      {row('أجرة التوصيل', numberFormatter.format(data.fee))}
      {row('المطلوب من الزبون', money(expected), { big: true })}
      {row('المستلم فعلياً', data.collected === null ? 'لم يُسجَّل' : money(data.collected))}
      {data.collected !== null && diff > 0 ? row('إكرامية', '+ ' + money(diff), { tint: good }) : null}
      {data.collected !== null && diff < 0 ? row('نقص عن المطلوب', '− ' + money(-diff), { tint: bad }) : null}
    </View>
    {commission !== null && net !== null ? <View style={section}>
      {row('عمولة الشركة', '− ' + numberFormatter.format(commission))}
      {row(admin ? 'صافي السائق من الأجرة' : 'صافي ربحي من الأجرة', numberFormatter.format(net))}
      {data.collected !== null && diff > 0 ? row('إكرامية', '+ ' + numberFormatter.format(diff)) : null}
      {data.collected !== null && diff < 0 ? row('نقص تحمّله السائق', '− ' + numberFormatter.format(-diff), { tint: bad }) : null}
      {row(admin ? 'إجمالي ربح السائق' : 'إجمالي ربحي من الطلب', money(net + (data.collected === null ? 0 : diff)), { big: true, tint: good })}
    </View> : null}
    <View style={section}>
      <AdminImageStrip orderId={data.id} bucket="delivery-proofs" proofPath={data.deliveryProofPath} size={84} emptyText="ما في صورة تسليم لهذا الطلب." />
      {data.note ? <Text style={{ color: muted, fontSize: 12.5, lineHeight: 20, textAlign: 'right' }}>ملاحظة: {data.note}</Text> : null}
    </View>
  </View>;
}
function AdminOrderThumb({ orderId, bucket = 'order-images', proofPath }: { orderId: string; bucket?: 'order-images' | 'delivery-proofs'; proofPath?: string | null }) {
  const { colors: c } = useMobileTheme();
  const images = useOrderImages(bucket, orderId, true, proofPath);
  if (!images?.length) return null;
  return <View style={{ width: 68, height: 68 }}>
    <Image source={{ uri: images[0].url, cacheKey: images[0].key }} style={{ width: 68, height: 68, borderRadius: 15, backgroundColor: c.raised }} contentFit="cover" cachePolicy="memory-disk" recyclingKey={images[0].key} transition={120} />
    {images.length > 1 && <View style={{ position: 'absolute', bottom: -5, left: -5, backgroundColor: c.primary, borderRadius: 9, paddingHorizontal: 6, minHeight: 18, justifyContent: 'center' }}><Text style={{ color: c.background, fontSize: 10.5, fontWeight: '900' }}>{images.length}</Text></View>}
  </View>;
}

function AdminImageStrip({ orderId, bucket = 'order-images', proofPath, size = 64, emptyText }: { orderId: string; bucket?: 'order-images' | 'delivery-proofs'; proofPath?: string | null; size?: number; emptyText?: string }) {
  const { colors: c } = useMobileTheme();
  const images = useOrderImages(bucket, orderId, true, proofPath);
  const [open, setOpen] = useState<CachedImage | null>(null);
  if (images === null) return <View style={{ flexDirection: 'row-reverse' }}><SkeletonBlock width={size} height={size} style={{ alignSelf: 'auto', borderRadius: 12 }} /></View>;
  if (!images.length) return emptyText ? <Text style={{ color: c.muted, fontSize: 12.5, textAlign: 'right' }}>{emptyText}</Text> : null;
  return <View style={{ flexDirection: 'row', gap: 7 }}>
    {images.map((image) => <Pressable key={image.key} onPress={() => setOpen(image)} accessibilityRole="button" accessibilityLabel="تكبير الصورة"><Image source={{ uri: image.url, cacheKey: image.key }} cachePolicy="memory-disk" transition={120} style={{ width: size, height: size, borderRadius: 12, backgroundColor: c.raised }} contentFit="cover" /></Pressable>)}
    <Modal visible={open !== null} transparent animationType="fade" onRequestClose={() => setOpen(null)}><Pressable onPress={() => setOpen(null)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18, backgroundColor: 'rgba(0,0,0,0.94)' }}>{open ? <Image source={{ uri: open.url, cacheKey: open.key }} cachePolicy="memory-disk" style={{ width: '100%', height: '80%' }} contentFit="contain" /> : null}</Pressable></Modal>
  </View>;
}

const trackSteps = ['تم الطلب', 'سائق', 'تسوق', 'بالطريق', 'تسليم'];
const trackIndex = (status: string) => ['requested', 'quoted', 'searching'].includes(status) ? 1 : ['accepted', 'assigned', 'shopping', 'awaiting_approval'].includes(status) ? 2 : ['purchased', 'delivering'].includes(status) ? 3 : ['delivered', 'settled'].includes(status) ? 5 : -1;
const customerGroup = (status: string) => ['delivered', 'settled'].includes(status) ? 'done' : status === 'cancelled' ? 'cancelled' : 'live';
function OrderTrack({ status }: { status: string }) {
  const { colors: c } = useMobileTheme();
  const current = trackIndex(status);
  if (current < 0) return null;
  return <View accessibilityRole="progressbar" accessibilityLabel={`مرحلة الطلب: ${orderStatus[status] ?? status}`} style={{ flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', marginHorizontal: 2 }}>
    <View style={{ position: 'absolute', top: 10, right: '10%', left: '10%', height: 3, borderRadius: 2, backgroundColor: c.border }} />
    {trackSteps.map((label, index) => { const done = index < current; const now = index === current; return <View key={label} style={{ flex: 1, alignItems: 'center' }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? '#B7FF30' : c.raised, borderWidth: 2, borderColor: done || now ? '#B7FF30' : c.border }}>{done ? <Text style={{ color: '#0B1411', fontSize: 11, fontWeight: '900' }}>✓</Text> : now ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#B7FF30' }} /> : null}</View>
      <Text style={{ color: done ? c.text : now ? c.primary : c.muted, fontSize: 10.5, fontWeight: '800', marginTop: 5 }}>{label}</Text>
    </View>; })}
  </View>;
}
// The driver of an order doesn't change once assigned: one request per order per session, not per visit.
const driverContactCache = new Map<string, { display_name: string; phone: string | null }>();
function CustomerDriverRow({ orderId, status }: { orderId: string; status: string }) {
  const { colors: c } = useMobileTheme();
  const online = useInternetAvailable();
  const [contact, setContact] = useState<{ display_name: string; phone: string | null } | null>(() => driverContactCache.get(orderId) ?? null);
  const [settled, setSettled] = useState(() => driverContactCache.has(orderId));
  useEffect(() => {
    if (!supabase || !online || driverContactCache.has(orderId)) return;
    let active = true;
    void supabase.rpc('get_order_driver_contact', { p_order_id: orderId }).then(({ data, error }) => { if (!error && data?.[0]) { driverContactCache.set(orderId, data[0]); if (active) setContact(data[0]); } if (active) setSettled(true); });
    return () => { active = false; };
  }, [online, orderId]);
  // Keep the row's space while the driver's details load so the card does not jump.
  if (!contact && !settled && online) return <SkeletonBlock width="100%" height={58} style={{ borderRadius: 16, alignSelf: 'stretch' }} />;
  if (!contact) return null;
  return <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 11, backgroundColor: c.background, borderColor: c.border, borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 9 }}>
    <View style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#B7FF30', backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 17 }}>🛵</Text></View>
    <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '900', textAlign: 'right' }}>{contact.display_name}</Text><Text style={{ color: c.muted, fontSize: 11.5, textAlign: 'right' }}>{['delivered', 'settled'].includes(status) ? 'سلّم طلبك' : 'سائقك'}</Text></View>
    {contact.phone && !['delivered', 'settled'].includes(status) ? <Pressable onPress={() => void Linking.openURL(`tel:${contact.phone}`)} accessibilityRole="button" accessibilityLabel="اتصال بالسائق" style={{ minHeight: 40, borderRadius: 12, backgroundColor: '#B7FF30', paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#0B1411', fontSize: 13, fontWeight: '900' }}>📞 اتصال</Text></Pressable> : null}
  </View>;
}

type DriverCancelledOrder = { id: string; request_text: string; delivery_fee_minor: number; created_at: string; cancelled_at: string | null };
type HistoryOrder = Pick<Database['public']['Tables']['orders']['Row'], 'id'  | 'request_text' | 'status' | 'delivery_fee_minor' | 'purchase_amount_minor'  | 'delivered_at' | 'delivery_proof_path' | 'created_at' | 'address_id'>;
type HistoryPeriod = 'today' | 'week' | 'all';
function historyCutoff(period: HistoryPeriod) {
  if (period === 'all') return 0;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return period === 'today' ? start : start - 6 * 86400000;
}
function dayLabel(iso: string) {
  const date = new Date(iso); const now = new Date();
  const day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diff = Math.round((day(now) - day(date)) / 86400000);
  return diff <= 0 ? 'اليوم' : diff === 1 ? 'أمس' : notificationDateFormatter.format(date);
}

const eventLabels: Record<string, string> = { order_requested: 'أُرسل الطلب', delivery_quote_set: 'حُددت الأجرة', offers_dispatched: 'أُرسل للسائقين', driver_assigned: 'عُيّن سائق', order_accepted: 'قبل السائق الطلب', driver_declined_offer: 'اعتذر سائق', shopping_started: 'بدأ التسوق', purchase_amount_proposed_within_budget: 'سُجل مبلغ المشتريات', purchase_completed: 'تأكد الشراء', delivery_started: 'بدأ التوصيل', delivery_confirmed: 'تم تأكيد التسليم', order_disputed: 'وصل بلاغ', dispute_resolved: 'حُل البلاغ', order_paused_by_admin: 'أوقفه الأدمن مؤقتاً', admin_cancelled: 'ألغاه الأدمن', customer_cancelled: 'ألغاه العميل', cash_settled: 'تمت التسوية' };

const adminStatusGroup = (status: string) => ['requested', 'quoted', 'disputed'].includes(status) ? 'action' : status === 'searching' ? 'searching' : ['accepted', 'assigned', 'shopping', 'awaiting_approval', 'purchased', 'delivering'].includes(status) ? 'active' : ['delivered', 'settled'].includes(status) ? 'done' : 'other';
type AdminFilter = 'action' | 'active' | 'done' | 'cancelled' | 'all';
type AdminPeriod = 'all' | 'today' | 'yesterday' | 'week' | 'month';
const adminPeriodLabels: Record<AdminPeriod, string> = { all: 'كل الفترات', today: 'اليوم', yesterday: 'أمس', week: 'آخر 7 أيام', month: 'هذا الشهر' };
const adminStatusLabels: Record<AdminFilter, string> = { all: 'كل الحالات', action: 'تحتاج إجراء', active: 'جارية', done: 'منتهية', cancelled: 'ملغية' };
function inAdminPeriod(iso: string, period: AdminPeriod) {
  if (period === 'all') return true;
  const now = new Date(); const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); const at = new Date(iso).getTime();
  if (period === 'today') return at >= startOfDay;
  if (period === 'yesterday') return at >= startOfDay - 86400000 && at < startOfDay;
  if (period === 'week') return at >= startOfDay - 6 * 86400000;
  return at >= new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}
const adminStages = ['تسعير', 'إسناد', 'شراء', 'توصيل', 'تسليم'];
const adminDoneSteps: Record<string, number> = { requested: 0, quoted: 1, searching: 1, accepted: 2, assigned: 2, shopping: 2, awaiting_approval: 2, purchased: 3, delivering: 3, delivered: 5, settled: 5, disputed: 3 };
function minutesLeft(iso: string) { return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000)); }
function timeAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `منذ ${hours} ساعة` : `منذ ${Math.floor(hours / 24)} يوم`;
}

type AdminTabKey = 'orders' | 'drivers' | 'money' | 'reports' | 'more';
type AdminBadgeSetter = (key: AdminTabKey, count: number) => void;
const adminTone = { ok: { bg: 'rgba(82,213,160,0.16)', fg: '#52D5A0' }, warn: { bg: '#3A2D18', fg: '#F0CC83' }, bad: { bg: '#451E21', fg: '#FF8A8A' }, info: { bg: '#1C2F3A', fg: '#80CAFF' } } as const;

// admin_list_users returns every account, so it is the heaviest admin request. All admin tabs
// share one copy for 5 minutes and concurrent callers share one in-flight request.
let adminNamesCache: { names: Record<string, string>; at: number } | null = null;
let adminNamesRequest: Promise<Record<string, string>> | null = null;
async function loadAdminNames(force = false): Promise<Record<string, string>> {
  if (!supabase) return {};
  if (!force && adminNamesCache && Date.now() - adminNamesCache.at < 5 * 60 * 1000) return adminNamesCache.names;
  adminNamesRequest ??= (async () => {
    try {
      const { data, error } = await supabase!.rpc('admin_list_users');
      if (error) return adminNamesCache?.names ?? {};
      const names = Object.fromEntries((data ?? []).map((user) => [user.user_id, user.display_name || user.email]));
      adminNamesCache = { names, at: Date.now() };
      return names;
    } finally { adminNamesRequest = null; }
  })();
  return adminNamesRequest;
}

/**
 * Refresh policy for an admin tab: load on first open, refresh again on return only when the data
 * is older than 30 s or something changed meanwhile, and collapse realtime bursts into one request.
 * Realtime events while the tab is hidden only mark it dirty instead of downloading in the background.
 */
function useAdminTabRefresh(active: boolean, refresh: () => Promise<void>, memoryKey: string) {
  const online = useInternetAvailable();
  const scheduler = useMemo(() => createRefreshScheduler(refresh, 700), [refresh]);
  const activeRef = useRef(active);
  const dirty = useRef(false);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => () => scheduler.cancel(), [scheduler]);
  useEffect(() => {
    if (!active || !online) return;
    if (dirty.current || !isFresh(memoryKey, 30 * 1000)) { dirty.current = false; void scheduler.now(); }
  }, [active, online, memoryKey, scheduler]);
  const onRealtime = useCallback(() => { if (activeRef.current) scheduler.schedule(); else dirty.current = true; }, [scheduler]);
  return { onRealtime, refreshNow: scheduler.now };
}

function AdminTopBar({ right }: { right?: ReactNode }) {
  const { colors: color, styles: s } = useMobileTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={s.brandMark}><Image source={require('../../assets/images/labbayk-delivery-logo.png')} style={s.brandLogo} contentFit="contain" accessibilityLabel="شعار لَبّيك" /></View>
      <View><Text style={s.brandName}>لَبّيك</Text><Text style={{ color: color.muted, fontSize: 11.5, textAlign: 'left' }}>الإدارة</Text></View>
    </View>
    {right}
  </View>;
}

function AdminSegment<T extends string>({ items, value, onChange }: { items: { key: T; label: string }[]; value: T; onChange: (key: T) => void }) {
  const { colors: color } = useMobileTheme();
  return <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 16, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface }}>
    {items.map((item) => { const on = item.key === value; return <Pressable key={item.key} onPress={() => onChange(item.key)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ flex: 1, minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? color.raised : 'transparent', borderWidth: on ? 1 : 0, borderColor: color.border }}><Text style={{ color: on ? color.text : color.muted, fontSize: 14, fontWeight: '800' }}>{item.label}</Text></Pressable>; })}
  </View>;
}

function AdminPill({ label, tone }: { label: string; tone: keyof typeof adminTone | 'mute' }) {
  const { colors: color } = useMobileTheme();
  const palette = tone === 'mute' ? { bg: color.raised, fg: color.muted } : adminTone[tone];
  return <View style={{ backgroundColor: palette.bg, borderRadius: 13, paddingHorizontal: 10, minHeight: 26, justifyContent: 'center' }}><Text style={{ color: palette.fg, fontSize: 12, fontWeight: '900' }}>{label}</Text></View>;
}

function AdminTabShell({ title, subtitle, onRefresh, refreshing, children }: { title: string; subtitle: string; onRefresh?: () => void; refreshing?: boolean; children: ReactNode }) {
  const { colors: color, styles: style } = useMobileTheme();
  return <SafeAreaView edges={['top']} style={[style.safe, { flex: 1 }]}>
    <AdminTopBar right={onRefresh ? <Pressable disabled={refreshing} onPress={onRefresh} accessibilityRole="button" accessibilityLabel="تحديث" style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center', opacity: refreshing ? 0.6 : 1 }}><SymbolView name={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }} tintColor={color.primary} size={18} /></Pressable> : undefined} />
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }} keyboardShouldPersistTaps="handled" refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={color.primary} colors={[color.primary]} progressBackgroundColor={color.surface} /> : undefined}>
      <View><Text style={{ color: color.text, fontSize: 26, fontWeight: '900', textAlign: 'left' }}>{title}</Text><Text style={{ color: color.muted, fontSize: 12.5, textAlign: 'left', marginTop: 2 }}>{subtitle}</Text></View>
      {children}
    </ScrollView>
  </SafeAreaView>;
}

function AdminEmpty({ title, hint }: { title: string; hint: string }) {
  const { colors: color } = useMobileTheme();
  return <View style={{ alignItems: 'center', padding: 32, gap: 6 }}><Text style={{ color: color.text, fontSize: 17, fontWeight: '900' }}>{title}</Text><Text style={{ color: color.muted, fontSize: 13.5, textAlign: 'center' }}>{hint}</Text></View>;
}

type AdminDriverRow = Pick<Database['public']['Tables']['driver_profiles']['Row'], 'user_id' | 'review_status' | 'vehicle_description' | 'created_at' | 'is_online'>;
type AdminInviteRow = { id: string; expires_at: string; redeemed_at: string | null; revoked_at: string | null; created_at: string };
type AdminDriversData = { rows: AdminDriverRow[]; names: Record<string, string>; busyDrivers: Record<string, boolean> };
function AdminDriversTab({ userId, active, onBadge }: { userId: string; active: boolean; onBadge: AdminBadgeSetter }) {
  const { colors: color } = useMobileTheme();
  const online = useInternetAvailable();
  const [, setMessage] = useToastMessage();
  const memoryKey = cacheKey(userId, 'admin-drivers');
  const [cached] = useState(() => readMemory<AdminDriversData>(memoryKey)?.value ?? null);
  const [rows, setRows] = useState<AdminDriverRow[]>(cached?.rows ?? []);
  const [names, setNames] = useState<Record<string, string>>(cached?.names ?? {});
  const [busyDrivers, setBusyDrivers] = useState<Record<string, boolean>>(cached?.busyDrivers ?? {});
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState('');
  const [segment, setSegment] = useState<'all' | 'on'>('all');
  const channelKey = useRef(newRequestKey());
  const refresh = useCallback(async () => {
    if (!supabase) return;
    const [driverResult, orderResult, nameMap] = await Promise.all([
      supabase.from('driver_profiles').select('user_id,review_status,vehicle_description,created_at,is_online').order('created_at', { ascending: false }),
      supabase.from('orders').select('driver_id').in('status', ['accepted', 'assigned', 'shopping', 'awaiting_approval', 'purchased', 'delivering']),
      loadAdminNames(),
    ]);
    const previous = readMemory<AdminDriversData>(memoryKey)?.value;
    const next: AdminDriversData = { rows: previous?.rows ?? [], names: nameMap, busyDrivers: previous?.busyDrivers ?? {} };
    if (driverResult.error) setMessage('ما قدرنا نحمّل بيانات السائقين.');
    else {
      next.rows = driverResult.data ?? [];
      const busyMap: Record<string, boolean> = {};
      for (const row of orderResult.data ?? []) if (row.driver_id) busyMap[row.driver_id] = true;
      next.busyDrivers = busyMap;
      writeMemory(memoryKey, next);
    }
    setRows(next.rows); setBusyDrivers(next.busyDrivers); setNames(nameMap); setLoading(false);
  }, [setMessage, memoryKey]);
  const { onRealtime, refreshNow } = useAdminTabRefresh(active, refresh, memoryKey);
  useEffect(() => {
    if (!supabase || !online) return;
    const channel = supabase.channel(`admin-mobile-drivers-${channelKey.current}`).on('postgres_changes', { event: '*', schema: 'public', table: 'driver_profiles' }, onRealtime).on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onRealtime).subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [online, onRealtime]);
  const pending = rows.filter((row) => row.review_status === 'pending');
  useEffect(() => { onBadge('drivers', pending.length); }, [pending.length, onBadge]);
  const nameOf = (id: string) => names[id] ?? '#' + id.slice(0, 6);
  const team = rows.filter((row) => row.review_status !== 'pending' && (segment === 'all' || (row.review_status === 'approved' && row.is_online)));
  const onlineCount = rows.filter((row) => row.review_status === 'approved' && row.is_online).length;
  const manualRefresh = async () => { if (!online && !(await recheckBackend())) { setMessage('التحديث يحتاج اتصالاً بالإنترنت.'); return; } setRefreshing(true); await loadAdminNames(true); await refreshNow(); setRefreshing(false); };
  const review = async (id: string, approved: boolean) => {
    if (!supabase) return;
    if (!approved && !(await confirmAction('رفض طلب الانضمام؟', `رح يتم رفض طلب ${nameOf(id)}.`, 'رفض الطلب'))) return;
    setWorking(id);
    const { error } = await supabase.rpc('review_driver_application', { p_user_id: id, p_approved: approved });
    setWorking('');
    if (error) { setMessage('ما قدرنا نحفظ قرار المراجعة.'); return; }
    setMessage(approved ? 'تم اعتماد السائق.' : 'تم رفض الطلب.'); await refreshNow();
  };
  const statusOf = (row: AdminDriverRow): { label: string; tone: keyof typeof adminTone | 'mute' } => row.review_status === 'suspended' ? { label: 'موقوف مؤقتاً', tone: 'bad' } : row.review_status === 'rejected' ? { label: 'مرفوض', tone: 'mute' } : !row.is_online ? { label: 'غير متصل', tone: 'mute' } : busyDrivers[row.user_id] ? { label: 'عنده طلب', tone: 'warn' } : { label: 'متاح', tone: 'ok' };
  const avatar = (id: string) => <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color.raised, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: color.primary, fontSize: 16, fontWeight: '900' }}>{nameOf(id).slice(0, 1)}</Text></View>;
  return <AdminTabShell title="السائقون" subtitle={`${onlineCount} متصل الآن من ${rows.filter((row) => row.review_status === 'approved').length}`} onRefresh={() => void manualRefresh()} refreshing={refreshing}>
    {loading ? <ActivityIndicator color={color.primary} style={{ margin: 24 }} /> : <>
      {pending.length ? <>
        <Text style={{ color: color.muted, fontSize: 12.5, fontWeight: '800', textAlign: 'right' }}>طلبات الانضمام · {pending.length}</Text>
        {pending.map((row) => <View key={row.user_id} style={{ backgroundColor: color.surface, borderColor: '#C98A2B', borderWidth: 1, borderRadius: 20, padding: 14, gap: 12 }}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 11 }}>{avatar(row.user_id)}<View style={{ flex: 1 }}><Text style={{ color: color.text, fontSize: 16, fontWeight: '900', textAlign: 'right' }}>{nameOf(row.user_id)}</Text><Text style={{ color: color.muted, fontSize: 12.5, textAlign: 'right' }}>{row.vehicle_description || 'بدون وصف للمركبة'} · {timeAgo(row.created_at)}</Text></View></View>
          <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
            <Pressable disabled={!!working || !online} onPress={() => void review(row.user_id, true)} accessibilityRole="button" style={{ flex: 1, minHeight: 44, borderRadius: 13, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center', opacity: working || !online ? 0.55 : 1 }}><Text style={{ color: color.background, fontSize: 14, fontWeight: '900' }}>{working === row.user_id ? 'لحظة…' : 'اعتماد'}</Text></Pressable>
            <Pressable disabled={!!working || !online} onPress={() => void review(row.user_id, false)} accessibilityRole="button" style={{ flex: 1, minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: adminTone.bad.fg, alignItems: 'center', justifyContent: 'center', opacity: working || !online ? 0.55 : 1 }}><Text style={{ color: adminTone.bad.fg, fontSize: 14, fontWeight: '900' }}>رفض</Text></Pressable>
          </View>
        </View>)}
      </> : null}
      <Text style={{ color: color.muted, fontSize: 12.5, fontWeight: '800', textAlign: 'right' }}>الفريق</Text>
      <AdminSegment items={[{ key: 'all', label: 'الكل' }, { key: 'on', label: 'متصل' }]} value={segment} onChange={setSegment} />
      {team.length ? <View style={{ backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: 20, overflow: 'hidden' }}>
        {team.map((row, index) => { const status = statusOf(row); return <View key={row.user_id} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 11, padding: 12, borderTopWidth: index ? 1 : 0, borderTopColor: color.border }}>{avatar(row.user_id)}<View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: color.text, fontSize: 15, fontWeight: '800', textAlign: 'right' }}>{nameOf(row.user_id)}</Text><Text numberOfLines={1} style={{ color: color.muted, fontSize: 12.5, textAlign: 'right' }}>{row.vehicle_description || 'بدون وصف للمركبة'}</Text></View><AdminPill label={status.label} tone={status.tone} /></View>; })}
      </View> : <AdminEmpty title="ما في سائقين هون" hint={segment === 'on' ? 'ما في سائق متصل حالياً.' : 'السائقين المسجلين بيظهروا هون.'} />}
    </>}
  </AdminTabShell>;
}

type AdminMoneyData = { balances: Record<string, number>; drivers: string[]; names: Record<string, string> };
type AdminLedgerRow = Pick<Database['public']['Tables']['driver_wallet_ledger']['Row'], 'id' | 'amount_minor' | 'entry_type' | 'order_id' | 'reason' | 'created_at'>;
type AdminLedgerDetail = { purchase: number | null; fee: number | null; rate: number | null; commission: number | null; collected: number | null };
function AdminMoneyTab({ userId, active, onBadge, onOpenOrder }: { userId: string; active: boolean; onBadge: AdminBadgeSetter; onOpenOrder: (orderId: string) => void }) {
  const insets = useSafeAreaInsets();
  const { colors: color } = useMobileTheme();
  const online = useInternetAvailable();
  const [, setMessage] = useToastMessage();
  const memoryKey = cacheKey(userId, 'admin-money');
  const [cached] = useState(() => readMemory<AdminMoneyData>(memoryKey)?.value ?? null);
  const [balances, setBalances] = useState<Record<string, number>>(cached?.balances ?? {});
  const [drivers, setDrivers] = useState<string[]>(cached?.drivers ?? []);
  const [names, setNames] = useState<Record<string, string>>(cached?.names ?? {});
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState('');
  const [topUp, setTopUp] = useState<{ id: string } | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const keys = useRef<Record<string, string>>({});
  const channelKey = useRef(newRequestKey());
  const refresh = useCallback(async () => {
    if (!supabase) return;
    const [balanceResult, driverResult, nameMap] = await Promise.all([
      supabase.rpc('get_driver_wallet_balances'),
      supabase.from('driver_profiles').select('user_id').eq('review_status', 'approved').order('created_at'),
      loadAdminNames(),
    ]);
    if (balanceResult.error || driverResult.error) setMessage('ما قدرنا نحمّل بيانات المال. جرّب التحديث.');
    else {
      const map: Record<string, number> = {};
      for (const row of balanceResult.data ?? []) map[row.driver_id] = row.balance_minor;
      const next: AdminMoneyData = { balances: map, drivers: (driverResult.data ?? []).map((row) => row.user_id), names: nameMap };
      setBalances(next.balances); setDrivers(next.drivers);
      writeMemory(memoryKey, next);
    }
    setNames(nameMap); setLoading(false);
  }, [setMessage, memoryKey]);
  const { onRealtime, refreshNow } = useAdminTabRefresh(active, refresh, memoryKey);
  useEffect(() => {
    if (!supabase || !online) return;
    const channel = supabase.channel(`admin-mobile-money-${channelKey.current}`).on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onRealtime).on('postgres_changes', { event: '*', schema: 'public', table: 'driver_wallet_ledger' }, onRealtime).subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [online, onRealtime]);
  const nameOf = (id: string | null) => id ? (names[id] ?? '#' + id.slice(0, 6)) : '—';
  const walletIds = useMemo(() => [...new Set([...drivers, ...Object.keys(balances)])], [drivers, balances]);
  const dueTotal = walletIds.reduce((sum, id) => sum + Math.max(0, -(balances[id] ?? 0)), 0);
  const manualRefresh = async () => { if (!online && !(await recheckBackend())) { setMessage('التحديث يحتاج اتصالاً بالإنترنت.'); return; } setRefreshing(true); await loadAdminNames(true); await refreshNow(); setRefreshing(false); };
  const submitTopUp = async () => {
    if (!supabase || !topUp) return;
    const value = Number(amount);
    if (!Number.isSafeInteger(value) || value < 1 || reason.trim().length < 5) { setMessage('أدخل مبلغاً صحيحاً وسبباً من 5 أحرف على الأقل.'); return; }
    if (!(await confirmAction('تأكيد الدفعة؟', 'أكدت استلام دفعة العمولة نقداً من السائق؟ رح تتسجل لتخفيض المبلغ المستحق عليه.', 'تأكيد'))) return;
    const fingerprint = `${topUp.id}|${value}|${reason.trim()}`;
    if (keys.current['topup-fp'] !== fingerprint) { keys.current['topup-fp'] = fingerprint; keys.current['topup'] = newRequestKey(); }
    setWorking('topup');
    const { error } = await supabase.rpc('top_up_driver_wallet', { p_driver_id: topUp.id, p_amount_minor: value, p_reason: reason.trim(), p_idempotency_key: keys.current['topup'] });
    setWorking('');
    if (error) { setMessage('ما انضاف المبلغ. أعد المحاولة بنفس البيانات حتى ما تتكرر الدفعة.'); return; }
    delete keys.current['topup-fp']; delete keys.current['topup'];
    setTopUp(null); setAmount(''); setReason(''); setMessage('تم تسجيل دفعة العمولة وتحديث المستحقات.'); await refreshNow();
  };
  // ----- Driver account history (opens from a driver's name in the wallets list) -----
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [ledger, setLedger] = useState<AdminLedgerRow[] | null>(null);
  const [ledgerDetails, setLedgerDetails] = useState<Record<string, AdminLedgerDetail>>({});
  const [entryFilter, setEntryFilter] = useState<'all' | 'commission' | 'payment'>('all');
  const [openEntry, setOpenEntry] = useState<number | null>(null);
  const [entriesShown, setEntriesShown] = useState(30);
  const historyBalance = historyFor ? (balances[historyFor] ?? 0) : 0;
  useEffect(() => {
    if (!historyFor || !supabase) return;
    let alive = true;
    void (async () => {
      const { data, error } = await supabase!.from('driver_wallet_ledger').select('id,amount_minor,entry_type,order_id,reason,created_at').eq('driver_id', historyFor).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(300);
      if (!alive) return;
      if (error) { setMessage('ما قدرنا نحمّل سجل الحساب. جرّب مرة ثانية.'); setLedger((current) => current ?? []); return; }
      const rows = data ?? [];
      const orderIds = [...new Set(rows.flatMap((row) => row.order_id ? [row.order_id] : []))];
      const details: Record<string, AdminLedgerDetail> = {};
      if (orderIds.length) {
        const settlementResult = await supabase!.from('cash_settlements').select('order_id,purchase_amount_minor,delivery_fee_minor,commission_rate_basis_points,commission_amount_minor,cash_collected_minor,created_at').in('order_id', orderIds).order('created_at', { ascending: false });
        for (const id of orderIds) details[id] = { purchase: null, fee: null, rate: null, commission: null, collected: null };
        // The newest settlement of an order is the one in force (older ones were reversed).
        const seen = new Set<string>();
        for (const row of settlementResult.data ?? []) {
          if (seen.has(row.order_id)) continue;
          seen.add(row.order_id);
          Object.assign(details[row.order_id], { purchase: row.purchase_amount_minor, fee: row.delivery_fee_minor, rate: row.commission_rate_basis_points, commission: row.commission_amount_minor, collected: row.cash_collected_minor });
        }
      }
      if (alive) { setLedger(rows); setLedgerDetails(details); }
    })();
    return () => { alive = false; };
  }, [historyFor, historyBalance, setMessage]);
  const openHistory = (id: string) => { setHistoryFor(id); setLedger(null); setEntryFilter('all'); setOpenEntry(null); setEntriesShown(30); };
  const entryLabel = (row: AdminLedgerRow) => row.entry_type === 'delivery_commission' ? `عمولة طلب #${(row.order_id ?? '').slice(0, 4)}` : row.entry_type === 'cash_top_up' ? 'دفعة مسجّلة' : row.entry_type === 'wallet_reversal' ? 'عكس قيد' : 'تعديل يدوي';
  const renderHistory = () => {
    if (!historyFor) return null;
    const rows = ledger ?? [];
    let running = historyBalance;
    const withBalance = rows.map((row) => { const after = running; running -= row.amount_minor; return { row, after }; });
    const commissions = rows.filter((row) => row.entry_type === 'delivery_commission').reduce((sum, row) => sum - row.amount_minor, 0);
    const payments = rows.filter((row) => row.entry_type === 'cash_top_up').reduce((sum, row) => sum + row.amount_minor, 0);
    const others = rows.filter((row) => row.entry_type !== 'delivery_commission' && row.entry_type !== 'cash_top_up').reduce((sum, row) => sum + row.amount_minor, 0);
    const commissionCount = rows.filter((row) => row.entry_type === 'delivery_commission').length;
    const visible = withBalance.filter(({ row }) => entryFilter === 'all' || (entryFilter === 'commission' ? row.entry_type === 'delivery_commission' : row.entry_type === 'cash_top_up'));
    const page = visible.slice(0, entriesShown);
    const days = [...new Set(page.map(({ row }) => dayLabel(row.created_at)))];
    const sign = (n: number) => n < 0 ? '−' : '';
    const sumBox = (value: string, label: string, tint?: string) => <View style={{ flex: 1, backgroundColor: color.raised, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center' }}><Text style={{ color: tint ?? color.text, fontSize: 14, fontWeight: '900' }}>{value}</Text><Text style={{ color: color.muted, fontSize: 11, textAlign: 'center' }}>{label}</Text></View>;
    return <>
      <Pressable onPress={() => setHistoryFor(null)} accessibilityRole="button" accessibilityLabel="رجوع لمحافظ العمولة" style={{ alignSelf: 'flex-end', minHeight: 40, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, justifyContent: 'center' }}><Text style={{ color: color.primary, fontSize: 13.5, fontWeight: '800' }}>→ محافظ العمولة</Text></Pressable>
      <View style={{ backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: 22, padding: 16, gap: 8 }}>
        <Text style={{ color: color.muted, fontSize: 12.5, textAlign: 'right' }}>{historyBalance < 0 ? 'عليه للشركة' : historyBalance > 0 ? 'رصيد عمولة' : 'الحساب مسدّد'}</Text>
        <Text style={{ color: historyBalance < 0 ? adminTone.bad.fg : historyBalance > 0 ? adminTone.ok.fg : color.text, fontSize: 34, fontWeight: '900', textAlign: 'right' }}>{sign(historyBalance)}{numberFormatter.format(Math.abs(historyBalance))} <Text style={{ fontSize: 14, color: color.muted }}>ل.س</Text></Text>
        <View style={{ flexDirection: 'row-reverse', gap: 6 }}>
          {sumBox(numberFormatter.format(commissions), `عمولات (${commissionCount} طلب)`, adminTone.bad.fg)}
          {sumBox(numberFormatter.format(payments), 'دفعات مسجّلة', adminTone.ok.fg)}
          {sumBox(sign(historyBalance) + numberFormatter.format(Math.abs(historyBalance)), 'الرصيد')}
        </View>
        {others !== 0 ? <Text style={{ color: color.muted, fontSize: 12, textAlign: 'right' }}>عكس القيود والتعديلات اليدوية: {sign(others)}{numberFormatter.format(Math.abs(others))} ل.س (داخلة بالرصيد).</Text> : null}
        <Pressable onPress={() => { setTopUp({ id: historyFor }); setAmount(''); setReason(''); }} accessibilityRole="button" style={{ minHeight: 48, borderRadius: 15, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}><Text style={{ color: color.background, fontSize: 15, fontWeight: '900' }}>تسجيل دفعة من {nameOf(historyFor)}</Text></Pressable>
      </View>
      <View style={{ flexDirection: 'row-reverse', gap: 8 }}>{([['all', 'الكل'], ['commission', 'عمولات'], ['payment', 'دفعات']] as const).map(([key, label]) => { const on = entryFilter === key; return <Pressable key={key} onPress={() => { setEntryFilter(key); setEntriesShown(30); }} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ minHeight: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1, borderColor: on ? color.primary : color.border, backgroundColor: on ? color.primary : color.surface, justifyContent: 'center' }}><Text style={{ color: on ? color.background : color.text, fontSize: 13, fontWeight: '800' }}>{label}</Text></Pressable>; })}</View>
      {ledger === null ? <ActivityIndicator color={color.primary} style={{ margin: 24 }} /> : page.length ? days.map((day) => <View key={day} style={{ gap: 8 }}>
        <Text style={{ color: color.muted, fontSize: 12.5, fontWeight: '800', textAlign: 'right' }}>{day}</Text>
        {page.filter(({ row }) => dayLabel(row.created_at) === day).map(({ row, after }) => {
          const detail = row.order_id ? ledgerDetails[row.order_id] : undefined; const open = openEntry === row.id; const credit = row.amount_minor > 0;
          return <View key={row.id} style={{ backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: 18, overflow: 'hidden' }}>
            <Pressable onPress={() => setOpenEntry(open ? null : row.id)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 11, padding: 12 }}>
              <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: color.text, fontSize: 14.5, fontWeight: '800', textAlign: 'right' }}>{entryLabel(row)}</Text><Text style={{ color: color.muted, fontSize: 12, textAlign: 'right' }}>{notificationTimeFormatter.format(new Date(row.created_at))}</Text></View>
              <View style={{ alignItems: 'flex-start' }}><Text style={{ color: credit ? adminTone.ok.fg : adminTone.bad.fg, fontSize: 15, fontWeight: '900' }}>{credit ? '+' : '−'}{numberFormatter.format(Math.abs(row.amount_minor))}</Text><Text style={{ color: color.muted, fontSize: 11.5 }}>الرصيد بعدها {sign(after)}{numberFormatter.format(Math.abs(after))}</Text></View>
            </Pressable>
            {open ? <View style={{ borderTopWidth: 1, borderTopColor: color.border, backgroundColor: color.background, padding: 12, gap: 7 }}>
              {row.entry_type === 'delivery_commission' ? <>
                {detail?.purchase != null ? line('مشتريات دفعها السائق', numberFormatter.format(detail.purchase) + ' ل.س') : null}
                {detail?.fee != null ? line('أجرة التوصيل', numberFormatter.format(detail.fee) + ' ل.س') : null}
                {detail?.rate != null ? line('نسبة العمولة', numberFormatter.format(detail.rate / 100) + '%') : null}
                {line('العمولة', numberFormatter.format(Math.abs(row.amount_minor)) + ' ل.س', adminTone.bad.fg)}
                {detail?.collected != null ? line('المبلغ اللي استلمه من الزبون', numberFormatter.format(detail.collected) + ' ل.س') : null}
                {detail?.collected != null && detail.purchase != null && detail.fee != null && detail.collected > detail.purchase + detail.fee ? line('إكرامية', numberFormatter.format(detail.collected - detail.purchase - detail.fee) + ' ل.س') : null}
                {row.order_id ? <Pressable onPress={() => onOpenOrder(row.order_id as string)} accessibilityRole="button" style={{ minHeight: 42, borderRadius: 13, borderWidth: 1, borderColor: color.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: color.primary, fontSize: 13.5, fontWeight: '800' }}>فتح الطلب</Text></Pressable> : null}
              </> : <>
                {line('السبب', row.reason || '—')}
                {line('سجّلها', 'الإدارة')}
              </>}
            </View> : null}
          </View>;
        })}
      </View>) : <AdminEmpty title="ما في قيود بهالتصنيف" hint="العمولات والدفعات بتظهر هون لما تنسجّل." />}
      {visible.length > entriesShown ? <Pressable onPress={() => setEntriesShown((count) => count + 30)} accessibilityRole="button" style={{ minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: color.primary, fontSize: 13.5, fontWeight: '800' }}>عرض المزيد ({visible.length - entriesShown})</Text></Pressable> : null}
      {rows.length >= 300 ? <Text style={{ color: color.muted, fontSize: 12, textAlign: 'center' }}>معروض آخر 300 قيد.</Text> : null}
    </>;
  };
  const line = (label: string, value: string, tint?: string) => <View key={label} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}><Text style={{ color: color.muted, fontSize: 13.5 }}>{label}</Text><Text style={{ color: tint ?? color.text, fontSize: 13.5, fontWeight: '900' }}>{value}</Text></View>;
  const input = { minHeight: 50, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: color.border, backgroundColor: color.raised, color: color.text, textAlign: 'right', fontSize: 15 } as const;
  return <AdminTabShell title={historyFor ? nameOf(historyFor) : 'المال'} subtitle={historyFor ? 'سجل الحساب' : 'حسابات العمولة على السائقين'} onRefresh={() => void manualRefresh()} refreshing={refreshing}>
    {historyFor ? renderHistory() : <>
    <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
      <View style={{ flex: 1, backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: 18, padding: 12 }}><Text style={{ color: color.text, fontSize: 24, fontWeight: '900', textAlign: 'right' }}>{numberFormatter.format(walletIds.filter((id) => (balances[id] ?? 0) < 0).length)}</Text><Text style={{ color: color.muted, fontSize: 12.5, textAlign: 'right' }}>سائقين عليهم عمولة</Text></View>
      <View style={{ flex: 1, backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: 18, padding: 12 }}><Text style={{ color: adminTone.bad.fg, fontSize: 24, fontWeight: '900', textAlign: 'right' }}>{numberFormatter.format(dueTotal)}</Text><Text style={{ color: color.muted, fontSize: 12.5, textAlign: 'right' }}>مستحق على السائقين · ل.س</Text></View>
    </View>
    {loading ? <ActivityIndicator color={color.primary} style={{ margin: 24 }} /> : <>
      <Text style={{ color: color.muted, fontSize: 12.5, fontWeight: '800', textAlign: 'right' }}>السالب مبلغ مستحق على السائق</Text>
      {walletIds.length ? <View style={{ backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: 20, overflow: 'hidden' }}>
        {walletIds.map((id, index) => { const balance = balances[id] ?? 0; return <View key={id} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: index ? 1 : 0, borderTopColor: color.border }}>
          <Pressable onPress={() => openHistory(id)} accessibilityRole="button" accessibilityLabel={`سجل حساب ${nameOf(id)}`} style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: color.text, fontSize: 15, fontWeight: '800', textAlign: 'right' }}>{nameOf(id)}</Text><Text style={{ color: color.muted, fontSize: 12, textAlign: 'right' }}>{balance < 0 ? 'مستحق للشركة' : 'رصيد عمولة'} · سجل الحساب ›</Text></Pressable>
          <Text style={{ color: balance < 0 ? adminTone.bad.fg : adminTone.ok.fg, fontSize: 15, fontWeight: '900' }}>{balance < 0 ? '−' : ''}{numberFormatter.format(Math.abs(balance))}</Text>
          <Pressable onPress={() => { setTopUp({ id }); setAmount(''); setReason(''); }} accessibilityRole="button" accessibilityLabel={`تسجيل دفعة من ${nameOf(id)}`} style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: color.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: color.primary, fontSize: 13, fontWeight: '900' }}>دفعة</Text></Pressable>
        </View>; })}
      </View> : <AdminEmpty title="ما في محافظ" hint="محافظ السائقين المعتمدين بتظهر هون." />}
    </>}
    </>}
    <Modal visible={!!topUp} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => setTopUp(null)}>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={() => setTopUp(null)} accessibilityRole="button" accessibilityLabel="إغلاق" />
        <View style={{ backgroundColor: color.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderTopWidth: 1, borderColor: color.border, padding: 16, paddingBottom: 24 + insets.bottom, gap: 10 }}>
          <View style={{ alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: color.border }} />
          <Text style={{ color: color.text, fontSize: 19, fontWeight: '900', textAlign: 'right' }}>تسجيل دفعة عمولة</Text>
          <Text style={{ color: color.muted, fontSize: 13, textAlign: 'right' }}>{topUp ? nameOf(topUp.id) : ''} · الرصيد الحالي {topUp ? numberFormatter.format(balances[topUp.id] ?? 0) : ''} ل.س</Text>
          <TextInput value={amount} onChangeText={(value) => setAmount(value.replace(/\D/g, '').slice(0, 9))} keyboardType="number-pad" placeholder="المبلغ المسدّد · ل.س" placeholderTextColor={color.muted} style={[input, { fontSize: 20, fontWeight: '900', color: color.primary }]} accessibilityLabel="المبلغ المسدد" />
          <TextInput value={reason} onChangeText={setReason} placeholder="سبب الدفعة (5 أحرف على الأقل)" placeholderTextColor={color.muted} style={input} accessibilityLabel="سبب الدفعة" />
          <Pressable disabled={working === 'topup' || !online || !amount || reason.trim().length < 5} onPress={() => void submitTopUp()} accessibilityRole="button" style={{ minHeight: 52, borderRadius: 16, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center', opacity: working === 'topup' || !online || !amount || reason.trim().length < 5 ? 0.5 : 1 }}><Text style={{ color: color.background, fontSize: 16, fontWeight: '900' }}>{working === 'topup' ? 'لحظة…' : 'تسجيل الدفعة'}</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </AdminTabShell>;
}

type AdminReport = Database['public']['Tables']['order_disputes']['Row'];
type AdminReportOrder = Pick<Database['public']['Tables']['orders']['Row'], 'id'  | 'customer_id' | 'driver_id'>;
type AdminReportsData = { reports: AdminReport[]; orderMap: Record<string, AdminReportOrder>; names: Record<string, string> };
function AdminReportsTab({ userId, active, onBadge, onOpenOrder }: { userId: string; active: boolean; onBadge: AdminBadgeSetter; onOpenOrder: (id: string) => void }) {
  const { colors: color } = useMobileTheme();
  const online = useInternetAvailable();
  const [, setMessage] = useToastMessage();
  const memoryKey = cacheKey(userId, 'admin-reports');
  const [cached] = useState(() => readMemory<AdminReportsData>(memoryKey)?.value ?? null);
  const [reports, setReports] = useState<AdminReport[]>(cached?.reports ?? []);
  const [orderMap, setOrderMap] = useState<Record<string, AdminReportOrder>>(cached?.orderMap ?? {});
  const [names, setNames] = useState<Record<string, string>>(cached?.names ?? {});
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [segment, setSegment] = useState<'open' | 'done'>('open');
  const channelKey = useRef(newRequestKey());
  const refresh = useCallback(async () => {
    if (!supabase) return;
    const [reportResult, nameMap] = await Promise.all([supabase.from('order_disputes').select('*').order('created_at', { ascending: false }).limit(100), loadAdminNames()]);
    if (reportResult.error) setMessage('ما قدرنا نحمّل البلاغات.');
    else {
      const rows = reportResult.data ?? [];
      const ids = [...new Set(rows.map((row) => row.order_id))];
      const previous = readMemory<AdminReportsData>(memoryKey)?.value.orderMap ?? {};
      const orderResult = ids.length ? await supabase.from('orders').select('id,customer_id,driver_id').in('id', ids) : null;
      const nextOrders = orderResult && !orderResult.error ? Object.fromEntries((orderResult.data ?? []).map((order) => [order.id, order])) : previous;
      setReports(rows); setOrderMap(nextOrders);
      writeMemory(memoryKey, { reports: rows, orderMap: nextOrders, names: nameMap });
    }
    setNames(nameMap); setLoading(false);
  }, [setMessage, memoryKey]);
  const { onRealtime, refreshNow } = useAdminTabRefresh(active, refresh, memoryKey);
  useEffect(() => {
    if (!supabase || !online) return;
    const channel = supabase.channel(`admin-mobile-reports-${channelKey.current}`).on('postgres_changes', { event: '*', schema: 'public', table: 'order_disputes' }, onRealtime).subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [online, onRealtime]);
  const openCount = reports.filter((row) => !row.resolved_at).length;
  useEffect(() => { onBadge('reports', openCount); }, [openCount, onBadge]);
  const list = reports.filter((row) => segment === 'open' ? !row.resolved_at : !!row.resolved_at);
  const nameOf = (id: string | null) => id ? (names[id] ?? '#' + id.slice(0, 6)) : '—';
  const manualRefresh = async () => { if (!online && !(await recheckBackend())) { setMessage('التحديث يحتاج اتصالاً بالإنترنت.'); return; } setRefreshing(true); await loadAdminNames(true); await refreshNow(); setRefreshing(false); };
  return <AdminTabShell title="البلاغات" subtitle="مشاكل العملاء والسائقين على الطلبات" onRefresh={() => void manualRefresh()} refreshing={refreshing}>
    <AdminSegment items={[{ key: 'open', label: `مفتوحة · ${openCount}` }, { key: 'done', label: `محلولة · ${reports.length - openCount}` }]} value={segment} onChange={setSegment} />
    {loading ? <ActivityIndicator color={color.primary} style={{ margin: 24 }} /> : list.length ? list.map((report) => {
      const order = orderMap[report.order_id]; const resolved = !!report.resolved_at;
      const fromCustomer = order ? report.opened_by === order.customer_id : false;
      return <View key={report.id} style={{ backgroundColor: color.surface, borderColor: resolved ? color.border : '#C98A2B', borderWidth: 1, borderRadius: 20, padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}><AdminPill label={resolved ? 'تم الحل' : 'بحاجة لقرارك'} tone={resolved ? 'ok' : 'warn'} /><Text style={{ color: color.muted, fontSize: 12 }}>{timeAgo(report.created_at)} · #{report.order_id.slice(0, 4)}</Text></View>
        <View><Text style={{ color: color.text, fontSize: 15.5, fontWeight: '900', textAlign: 'right' }}>{report.reason}</Text><Text style={{ color: color.muted, fontSize: 12.5, textAlign: 'right' }}>من {fromCustomer ? 'العميل' : 'السائق'} {nameOf(report.opened_by)}{order ? ` · طلب #${order.id.slice(0, 4)}` : ''}</Text></View>
        <Text selectable style={{ color: color.text, fontSize: 14, lineHeight: 22, textAlign: 'right' }}>{report.details}</Text>
        {resolved ? <View style={{ backgroundColor: adminTone.ok.bg, borderRadius: 12, padding: 10 }}><Text style={{ color: adminTone.ok.fg, fontSize: 13.5, fontWeight: '800', textAlign: 'right' }}>✓ {report.resolution}</Text></View>
          : <Pressable onPress={() => onOpenOrder(report.order_id)} accessibilityRole="button" style={{ minHeight: 46, borderRadius: 14, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: color.background, fontSize: 14.5, fontWeight: '900' }}>افتح الطلب وسجّل الحل</Text></Pressable>}
      </View>;
    }) : <AdminEmpty title={segment === 'open' ? 'ما في بلاغات مفتوحة' : 'ما في بلاغات محلولة'} hint="البلاغات بتظهر هون لما يفتحها عميل أو سائق." />}
  </AdminTabShell>;
}

function AdminInvitesSection() {
  const insets = useSafeAreaInsets();
  const { colors: color } = useMobileTheme();
  const online = useInternetAvailable();
  const [, setMessage] = useToastMessage();
  const [invites, setInvites] = useState<AdminInviteRow[]>([]);
  const [newInvite, setNewInvite] = useState<{ webLink: string; appLink: string; token: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('driver_invites').select('id,expires_at,redeemed_at,revoked_at,created_at').order('created_at', { ascending: false }).limit(30);
    if (!error) setInvites(data ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60 * 1000); return () => clearInterval(timer); }, []);
  const activeInvites = invites.filter((invite) => !invite.redeemed_at && !invite.revoked_at && Date.parse(invite.expires_at) > now);
  const createInvite = async () => {
    if (!supabase || creating) return;
    setCreating(true);
    const { data, error } = await supabase.rpc('admin_create_driver_invite');
    setCreating(false);
    if (error || !data) { setMessage('ما قدرنا ننشئ الدعوة. جرّب مرة ثانية.'); return; }
    const base = (process.env.EXPO_PUBLIC_APP_URL?.trim() || 'https://labbayk.expo.app').replace(/\/+$/, '');
    setNewInvite({ token: data, webLink: `${base}/?invite=${data}`, appLink: `labbayk:///?invite=${data}` });
    await load();
  };
  const shareInvite = async () => {
    if (!newInvite) return;
    try { await Share.share({ message: `دعوة للانضمام لفريق سائقي لَبّيك.\n\nرابط الويب (بيشتغل على أي جهاز):\n${newInvite.webLink}\n\nرابط التطبيق (إذا منزّله):\n${newInvite.appLink}\n\nأو الصق هالرمز بالتطبيق:\n${newInvite.token}` }); } catch { setMessage('ما قدرنا نفتح المشاركة. انسخ الرابط يدوياً.'); }
  };
  const revokeInvite = async (id: string) => {
    if (!supabase) return;
    if (!(await confirmAction('إلغاء الدعوة؟', 'الرابط ما رح يشتغل بعد هلأ.', 'إلغاء الدعوة'))) return;
    const { error } = await supabase.from('driver_invites').update({ revoked_at: new Date().toISOString() }).eq('id', id);
    if (error) { setMessage('ما قدرنا نلغي الدعوة.'); return; }
    setMessage('تم إلغاء رابط الدعوة.'); await load();
  };
  return <>
    <Text style={{ color: color.muted, fontSize: 12.5, fontWeight: '800', textAlign: 'right' }}>دعوات السائقين</Text>
    <Pressable disabled={creating || !online} onPress={() => void createInvite()} accessibilityRole="button" style={{ minHeight: 52, borderRadius: 16, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center', opacity: creating || !online ? 0.55 : 1 }}><Text style={{ color: color.background, fontSize: 15.5, fontWeight: '900' }}>{creating ? 'لحظة…' : '＋ دعوة سائق جديد'}</Text></Pressable>
    {activeInvites.length ? <View style={{ backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: 18, padding: 12, gap: 8 }}>
      <Text style={{ color: color.muted, fontSize: 12.5, fontWeight: '800', textAlign: 'right' }}>دعوات فعّالة · {activeInvites.length}</Text>
      {activeInvites.map((invite) => <View key={invite.id} style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><Text style={{ color: color.text, fontSize: 13.5, textAlign: 'right', flex: 1 }}>أُنشئت {timeAgo(invite.created_at)} · بتنتهي بعد {Math.max(1, Math.ceil((Date.parse(invite.expires_at) - now) / 86400000))} يوم</Text><Pressable onPress={() => void revokeInvite(invite.id)} accessibilityRole="button" accessibilityLabel="إلغاء الدعوة" style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: adminTone.bad.fg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: adminTone.bad.fg, fontSize: 12.5, fontWeight: '900' }}>إلغاء</Text></Pressable></View>)}
    </View> : null}
    <Modal visible={!!newInvite} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => setNewInvite(null)}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={() => setNewInvite(null)} accessibilityRole="button" accessibilityLabel="إغلاق" />
        <View style={{ backgroundColor: color.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderTopWidth: 1, borderColor: color.border, padding: 16, paddingBottom: 26 + insets.bottom, gap: 10 }}>
          <View style={{ alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: color.border }} />
          <Text style={{ color: color.text, fontSize: 19, fontWeight: '900', textAlign: 'right' }}>دعوة سائق جاهزة</Text>
          <Text style={{ color: color.muted, fontSize: 13.5, lineHeight: 22, textAlign: 'right' }}>أرسل الرابط للسائق. بيفتحه وبيسجّل دخوله وبيصير سائق مباشرة بدون مراجعة. الرابط لمرة وحدة وبينتهي بعد 7 أيام. ما رح تقدر تشوفه مرة ثانية بعد ما تسكّر هالشاشة.</Text>
          {([['رابط الويب', newInvite?.webLink], ['رابط التطبيق', newInvite?.appLink]] as const).map(([label, link]) => <View key={label} style={{ backgroundColor: color.background, borderColor: color.border, borderWidth: 1, borderRadius: 14, padding: 12, gap: 4 }}><Text style={{ color: color.muted, fontSize: 12, fontWeight: '800', textAlign: 'right' }}>{label}</Text><Text selectable style={{ color: color.text, fontSize: 12, lineHeight: 19, textAlign: 'left', writingDirection: 'ltr' }}>{link}</Text></View>)}
          <Pressable onPress={() => void shareInvite()} accessibilityRole="button" style={{ minHeight: 52, borderRadius: 16, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: color.background, fontSize: 16, fontWeight: '900' }}>مشاركة الدعوة</Text></Pressable>
          <Pressable onPress={() => setNewInvite(null)} accessibilityRole="button" style={{ minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: color.text, fontSize: 14.5, fontWeight: '800' }}>تم</Text></Pressable>
        </View>
      </View>
    </Modal>
  </>;
}

function AdminMoreTab({ email, theme, onToggleTheme, onSignOut }: { email: string; theme: 'dark' | 'light'; onToggleTheme: () => void; onSignOut: () => void }) {
  const { colors: color } = useMobileTheme();
  const webOnly = ['التسعير ونسبة العمولة', 'المستخدمون وإيقاف الحسابات', 'مناطق الخدمة', 'التنبيهات'];
  const row = (title: string, hint: string | null, onPress: (() => void) | null, tint?: string) => <Pressable key={title} disabled={!onPress} onPress={onPress ?? undefined} accessibilityRole="button" accessibilityState={{ disabled: !onPress }} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 58, paddingHorizontal: 14, paddingVertical: 8, opacity: onPress ? 1 : 0.62 }}>
    <View style={{ flex: 1 }}><Text style={{ color: tint ?? color.text, fontSize: 15, fontWeight: '800', textAlign: 'right' }}>{title}</Text>{hint ? <Text style={{ color: color.muted, fontSize: 12, textAlign: 'right' }}>{hint}</Text> : null}</View>
    {!onPress ? <AdminPill label="بالويب" tone="mute" /> : null}
  </Pressable>;
  const box = { backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: 20, overflow: 'hidden' } as const;
  return <AdminTabShell title="المزيد" subtitle="الحساب والمظهر وباقي الأقسام">
    <View style={[box, { padding: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }]}><View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: color.raised, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: color.primary, fontSize: 18, fontWeight: '900' }}>م</Text></View><View style={{ flex: 1 }}><Text style={{ color: color.text, fontSize: 16, fontWeight: '900', textAlign: 'right' }}>مدير لَبّيك</Text><Text selectable style={{ color: color.muted, fontSize: 12.5, textAlign: 'right' }}>{email}</Text></View></View>
    <AdminInvitesSection />
    <Text style={{ color: color.muted, fontSize: 12.5, fontWeight: '800', textAlign: 'right' }}>التطبيق</Text>
    <View style={box}>
      {row('المظهر', theme === 'dark' ? 'داكن · اضغط للتبديل' : 'فاتح · اضغط للتبديل', onToggleTheme)}
      <View style={{ height: 1, backgroundColor: color.border }} />
      {row('تسجيل الخروج', null, () => { void confirmAction('تسجيل الخروج؟', 'رح تحتاج تدخل ببريد الإدارة وكلمة السر مرة ثانية.', 'خروج').then((ok) => { if (ok) onSignOut(); }); }, adminTone.bad.fg)}
    </View>
    <Text style={{ color: color.muted, fontSize: 12.5, fontWeight: '800', textAlign: 'right' }}>أقسام بلوحة الويب فقط حالياً</Text>
    <View style={box}>{webOnly.map((title, index) => <View key={title}>{index ? <View style={{ height: 1, backgroundColor: color.border }} /> : null}{row(title, 'متاح على لوحة الويب، مو بالتطبيق بعد', null)}</View>)}</View>
  </AdminTabShell>;
}

function AdminWorkspace({ userId, email, onSignOut, theme, onToggleTheme }: { userId: string; email: string; onSignOut: () => void; theme: 'dark' | 'light'; onToggleTheme: () => void }) {
  const { colors: color } = useMobileTheme();
  const [tab, setTab] = useState<AdminTabKey>('orders');
  const [inDetail, setInDetail] = useState(false);
  const [badges, setBadges] = useState<Record<string, number>>({});
  const [focusOrderId, setFocusOrderId] = useState<string | null>(null);
  const setBadge = useCallback<AdminBadgeSetter>((key, count) => setBadges((current) => current[key] === count ? current : { ...current, [key]: count }), []);
  const clearFocus = useCallback(() => setFocusOrderId(null), []);
  // Tabs mount on first visit only, so opening the app downloads the orders screen alone.
  const [visited, setVisited] = useState<Record<AdminTabKey, boolean>>({ orders: true, drivers: false, money: false, reports: false, more: false });
  const openTab = useCallback((key: AdminTabKey) => { setTab(key); setVisited((current) => current[key] ? current : { ...current, [key]: true }); }, []);
  const online = useInternetAvailable();
  // Badges for tabs not opened yet come from three tiny count-only requests (no rows are downloaded).
  useEffect(() => {
    if (!supabase || !online) return;
    let active = true;
    const loadCounts = async () => {
      const [pendingDrivers, toSettle, openReports] = await Promise.all([
        supabase!.from('driver_profiles').select('user_id', { count: 'exact', head: true }).eq('review_status', 'pending'),
        supabase!.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'delivered'),
        supabase!.from('order_disputes').select('id', { count: 'exact', head: true }).is('resolved_at', null),
      ]);
      if (!active) return;
      if (!pendingDrivers.error) setBadge('drivers', pendingDrivers.count ?? 0);
      if (!toSettle.error) setBadge('money', toSettle.count ?? 0);
      if (!openReports.error) setBadge('reports', openReports.count ?? 0);
    };
    void loadCounts();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void loadCounts(); });
    return () => { active = false; subscription.remove(); };
  }, [online, setBadge]);
  const tabs: { key: AdminTabKey; label: string; symbol: { ios: SFSymbol; android: AndroidSymbol; web: AndroidSymbol } }[] = [
    { key: 'orders', label: 'الطلبات', symbol: { ios: 'list.bullet', android: 'list', web: 'list' } },
    { key: 'drivers', label: 'السائقون', symbol: { ios: 'person.2', android: 'group', web: 'group' } },
    { key: 'money', label: 'المال', symbol: { ios: 'creditcard', android: 'payments', web: 'payments' } },
    { key: 'reports', label: 'البلاغات', symbol: { ios: 'exclamationmark.triangle', android: 'warning', web: 'warning' } },
    { key: 'more', label: 'المزيد', symbol: { ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' } },
  ];
  const pane = (key: AdminTabKey) => ({ flex: 1, display: tab === key ? 'flex' : 'none' } as const);
  return <View style={{ flex: 1, backgroundColor: color.background }}>
    <View style={pane('orders')}><AdminOrdersTab userId={userId} onBadge={setBadge} onDetail={setInDetail} focusOrderId={focusOrderId} onFocusHandled={clearFocus} /></View>
    {visited.drivers ? <View style={pane('drivers')}><AdminDriversTab userId={userId} active={tab === 'drivers'} onBadge={setBadge} /></View> : null}
    {visited.money ? <View style={pane('money')}><AdminMoneyTab userId={userId} active={tab === 'money'} onBadge={setBadge} onOpenOrder={(id) => { setFocusOrderId(id); openTab('orders'); }} /></View> : null}
    {visited.reports ? <View style={pane('reports')}><AdminReportsTab userId={userId} active={tab === 'reports'} onBadge={setBadge} onOpenOrder={(id) => { setFocusOrderId(id); openTab('orders'); }} /></View> : null}
    {visited.more ? <View style={pane('more')}><AdminMoreTab email={email} theme={theme} onToggleTheme={onToggleTheme} onSignOut={onSignOut} /></View> : null}
    {!(tab === 'orders' && inDetail) ? <SafeAreaView edges={['bottom']} style={{ backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.border }}>
      <View style={{ flexDirection: 'row', paddingHorizontal: 6, paddingTop: 6, paddingBottom: 4 }}>
        {tabs.map((item) => { const on = tab === item.key; const count = badges[item.key] ?? 0; return <Pressable key={item.key} onPress={() => openTab(item.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={count ? `${item.label}، ${count}` : item.label} style={{ flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
          <View style={{ width: 52, height: 30, borderRadius: 15, backgroundColor: on ? color.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            <SymbolView name={item.symbol} tintColor={on ? color.background : color.muted} size={22} />
            {count ? <View style={{ position: 'absolute', top: -5, left: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#F0CC83', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ color: '#0B1411', fontSize: 11, fontWeight: '900' }}>{count}</Text></View> : null}
          </View>
          <Text style={{ color: on ? color.text : color.muted, fontSize: 11.5, fontWeight: '700' }}>{item.label}</Text>
        </Pressable>; })}
      </View>
    </SafeAreaView> : null}
  </View>;
}

function AdminOrdersTab({ userId, onBadge, onDetail, focusOrderId, onFocusHandled }: { userId: string; onBadge: AdminBadgeSetter; onDetail: (open: boolean) => void; focusOrderId: string | null; onFocusHandled: () => void }) {
  const insets = useSafeAreaInsets();
  const { colors: color, styles: style } = useMobileTheme();
  const online = useInternetAvailable();
  const [, setMessage] = useToastMessage();
  const [orders, setOrders] = useState<AdminMobileOrder[]>([]);
  const [drivers, setDrivers] = useState<AdminMobileDriver[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [addresses, setAddresses] = useState<Record<string, AdminAddress>>({});
  const [driverPhones, setDriverPhones] = useState<Record<string, string>>({});
  const [declines, setDeclines] = useState<Record<string, string[]>>({});
  const [cashCollected, setCashCollected] = useState<Record<string, number | null>>({});
  const [deliveryNotes, setDeliveryNotes] = useState<Record<string, string>>({});
  const [dispute, setDispute] = useState<{ id: string; reason: string; details: string; opened_by: string; created_at: string } | null>(null);
  const [resolution, setResolution] = useState('');
  const [openDisputes, setOpenDisputes] = useState<Record<string, boolean>>({});
  const [cancelOpen, setCancelOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timeline, setTimeline] = useState<{ id: number; event_type: string; actor_id: string | null; created_at: string; details: Record<string, unknown> | null }[] | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [pending, setPending] = useState<Record<string, { driver_id: string; expires_at: string }[]>>({});
  const showToast = useAppToast();
  const previousStatuses = useRef<Record<string, string>>({});
  const namesRef = useRef<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<AdminFilter>('all');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [finishedShown, setFinishedShown] = useState(12);
  const [filterDriver, setFilterDriver] = useState('');
  const [filterPeriod, setFilterPeriod] = useState<AdminPeriod>('all');
  const [openFilter, setOpenFilter] = useState<'driver' | 'period' | 'status' | null>(null);
  const [visible, setVisible] = useState(25);
  // Settled and cancelled orders show as one compact row; tapping opens the full card (one at a time).
  const [openFinished, setOpenFinished] = useState<string | null>(null);
  const [sheet, setSheet] = useState<AdminMobileOrder | null>(null);
  const [fee, setFee] = useState('');
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'all' | 'driver'>('all');
  const [driverId, setDriverId] = useState('');
  const [busy, setBusy] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const initialised = useRef(false);

  // Last known screen data: shown instantly on open (also after an app restart), then refreshed.
  type AdminOrdersSnapshot = { orders: AdminMobileOrder[]; drivers: AdminMobileDriver[]; names: Record<string, string>; addresses: Record<string, AdminAddress>; driverPhones: Record<string, string>; declines: Record<string, string[]>; pending: Record<string, { driver_id: string; expires_at: string }[]>; openDisputes: Record<string, boolean> };
  const snapshotKey = cacheKey(userId, 'admin-orders');
  const hasServerData = useRef(false);
  const applySnapshot = useCallback((snapshot: AdminOrdersSnapshot) => {
    setOrders(snapshot.orders); setDrivers(snapshot.drivers); setNames(snapshot.names); namesRef.current = snapshot.names;
    setAddresses(snapshot.addresses); setDriverPhones(snapshot.driverPhones); setDeclines(snapshot.declines); setPending(snapshot.pending); setOpenDisputes(snapshot.openDisputes);
    setCashCollected(Object.fromEntries(snapshot.orders.map((order) => [order.id, order.cash_collected_minor])));
    setDeliveryNotes(Object.fromEntries(snapshot.orders.flatMap((order) => order.delivery_note ? [[order.id, order.delivery_note]] : [])));
  }, []);
  useEffect(() => {
    let active = true;
    void readPersisted<AdminOrdersSnapshot>(snapshotKey, 3 * 24 * 60 * 60 * 1000).then((entry) => {
      if (!active || !entry || hasServerData.current) return;
      applySnapshot(entry.value);
      previousStatuses.current = Object.fromEntries(entry.value.orders.map((order) => [order.id, order.status]));
      setLoading(false);
    });
    return () => { active = false; };
  }, [snapshotKey, applySnapshot]);

  // Two waves instead of six sequential round trips: on a slow connection each wave costs seconds.
  const refresh = useCallback(async () => {
    if (!supabase) return;
    try {
      // Fallback for projects without pg_cron: checking for orders nobody answered also happens whenever
      // the admin refreshes. It is idempotent and only flags orders that are already overdue.
      void supabase.rpc('flag_unanswered_orders').then(() => undefined, () => undefined);
      const [orderResult, driverResult, disputeResult, nameMap] = await Promise.all([
        supabase.from('orders').select('id,is_urgent,customer_id,address_id,delivered_at,delivery_proof_path,purchase_amount_minor,request_text,status,delivery_fee_minor,delivery_quote_set_at,driver_id,created_at,cash_collected_minor,delivery_note,shopping_admin_alerted_at,delivery_admin_alerted_at').order('created_at', { ascending: false }).limit(150),
        supabase.from('driver_profiles').select('user_id,vehicle_description').eq('review_status', 'approved').eq('is_online', true).order('created_at'),
        supabase.from('order_disputes').select('order_id').is('resolved_at', null),
        loadAdminNames(),
      ]);
      if (orderResult.error || driverResult.error) { setMessage('تعذر تحميل الطلبات أو السائقين. حدّث الصفحة عند عودة الاتصال.'); return; }
      const rows = [...(orderResult.data ?? [])].sort((a, b) => Number(!!b.is_urgent) - Number(!!a.is_urgent));
      const searchingIds = rows.filter((order) => order.status === 'searching').map((order) => order.id);
      const driverIds = [...new Set(rows.flatMap((order) => order.driver_id ? [order.driver_id] : []))];
      const addressIds = [...new Set(rows.flatMap((order) => order.address_id ? [order.address_id] : []))];
      const [declineResult, offerResult, phoneResult, addressResult] = await Promise.all([
        searchingIds.length ? supabase.from('order_events').select('order_id,actor_id').eq('event_type', 'driver_declined_offer').in('order_id', searchingIds) : Promise.resolve(null),
        searchingIds.length ? supabase.from('order_offers').select('order_id,driver_id,expires_at').eq('status', 'pending').in('order_id', searchingIds) : Promise.resolve(null),
        driverIds.length ? supabase.from('driver_profiles').select('user_id,phone_e164').in('user_id', driverIds) : Promise.resolve(null),
        addressIds.length ? supabase.from('addresses').select('id,label,street,city,neighborhood,building,landmark,contact_phone').in('id', addressIds) : Promise.resolve(null),
      ]);
      const declineMap: Record<string, string[]> = {};
      for (const row of declineResult?.data ?? []) if (row.actor_id) declineMap[row.order_id] = [...new Set([...(declineMap[row.order_id] ?? []), row.actor_id])];
      const pendingMap: Record<string, { driver_id: string; expires_at: string }[]> = {};
      for (const row of offerResult?.data ?? []) pendingMap[row.order_id] = [...(pendingMap[row.order_id] ?? []), { driver_id: row.driver_id, expires_at: row.expires_at }];
      for (const order of rows) {
        const before = previousStatuses.current[order.id];
        if (before === 'searching' && ['accepted', 'assigned'].includes(order.status) && order.driver_id) showToast(`قبل ${nameMap[order.driver_id] ?? 'سائق'} الطلب #${order.id.slice(0, 6)}`, 'success');
      }
      previousStatuses.current = Object.fromEntries(rows.map((order) => [order.id, order.status]));
      const snapshot: AdminOrdersSnapshot = {
        orders: rows,
        drivers: driverResult.data ?? [],
        names: nameMap,
        // Keep the previous values when a secondary request fails so the screen never loses data.
        addresses: addressResult?.error ? readMemory<AdminOrdersSnapshot>(snapshotKey)?.value.addresses ?? {} : Object.fromEntries((addressResult?.data ?? []).map((address) => [address.id, address])),
        driverPhones: phoneResult?.error ? readMemory<AdminOrdersSnapshot>(snapshotKey)?.value.driverPhones ?? {} : Object.fromEntries((phoneResult?.data ?? []).flatMap((row) => row.phone_e164 ? [[row.user_id, row.phone_e164]] : [])),
        declines: declineMap,
        pending: pendingMap,
        openDisputes: disputeResult.error ? readMemory<AdminOrdersSnapshot>(snapshotKey)?.value.openDisputes ?? {} : Object.fromEntries((disputeResult.data ?? []).map((row) => [row.order_id, true])),
      };
      hasServerData.current = true;
      applySnapshot(snapshot);
      writePersisted(snapshotKey, snapshot);
      if (!initialised.current) { initialised.current = true; if (!rows.some((order) => adminStatusGroup(order.status) === 'action' || (order.status === 'searching'))) setFilter('all'); }
    } catch {
      setMessage('تعذر تحميل الطلبات. حدّث الصفحة عند عودة الاتصال.');
    } finally {
      setLoading(false);
    }
  }, [setMessage, showToast, snapshotKey, applySnapshot]);
  // Realtime bursts (one order change fires several events) collapse into one refresh.
  const schedulerRef = useRef<ReturnType<typeof createRefreshScheduler> | null>(null);
  useEffect(() => { const scheduler = createRefreshScheduler(refresh, 700); schedulerRef.current = scheduler; return () => scheduler.cancel(); }, [refresh]);
  const scheduleRefresh = useCallback(() => { schedulerRef.current?.schedule(); }, []);
  const refreshNow = useCallback(() => schedulerRef.current?.now() ?? refresh(), [refresh]);

  useEffect(() => { if (online) void refreshNow(); }, [online, refreshNow]);
  useEffect(() => {
    if (!supabase || !online) return;
    const channel = supabase.channel(`admin-mobile-orders-${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, scheduleRefresh).on('postgres_changes', { event: '*', schema: 'public', table: 'driver_profiles' }, scheduleRefresh).on('postgres_changes', { event: '*', schema: 'public', table: 'order_offers' }, scheduleRefresh).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_events' }, (payload) => { const row = payload.new as { event_type?: string; order_id?: string; actor_id?: string | null }; if (row.event_type === 'driver_declined_offer') { showToast(`اعتذر ${row.actor_id ? namesRef.current[row.actor_id] ?? 'سائق' : 'سائق'} عن الطلب #${(row.order_id ?? '').slice(0, 6)}. ما زال عند باقي السائقين.`, 'warning'); scheduleRefresh(); } else if (row.event_type === 'no_driver_response') { showToast(`ما حدا رد على الطلب #${(row.order_id ?? '').slice(0, 6)}. أعد إرساله أو أسنده لسائق.`, 'warning'); scheduleRefresh(); } }).subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [online, scheduleRefresh, showToast, userId]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') scheduleRefresh(); });
    return () => subscription.remove();
  }, [scheduleRefresh]);

  const manualRefresh = async () => {
    if (refreshing) return;
    if (!online && !(await recheckBackend())) { setMessage('التحديث يحتاج اتصالاً بالإنترنت.'); return; }
    setRefreshing(true); await loadAdminNames(true); await refreshNow(); setRefreshing(false); setMessage('تم تحديث الطلبات.');
  };
  // Offers that already ran out of time are still "pending" in the database until the next send, so
  // only the ones whose time has not passed count as waiting for an answer.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 30 * 1000); return () => clearInterval(timer); }, []);
  const liveOffers = useCallback((orderId: string) => (pending[orderId] ?? []).filter((offer) => Date.parse(offer.expires_at) > clock), [pending, clock]);
  // 10 minutes after the order was sent with nobody left who can still answer: it needs the admin.
  const noResponse = useCallback((order: AdminMobileOrder) => order.status === 'searching' && !order.driver_id && !!order.delivery_quote_set_at
    && clock - Date.parse(order.delivery_quote_set_at) >= 15 * 60 * 1000 && liveOffers(order.id).length === 0, [clock, liveOffers]);
  const groupOf = useCallback((order: AdminMobileOrder) => openDisputes[order.id] ? 'action' : order.status === 'searching' && ((declines[order.id]?.length ?? 0) > 0 || noResponse(order)) ? 'action' : adminStatusGroup(order.status), [openDisputes, declines, noResponse]);
  const statusLabel = (order: AdminMobileOrder) => noResponse(order) ? 'ما حدا رد على الطلب' : order.status === 'searching' && liveOffers(order.id).length === 1 ? 'بانتظار رد السائق' : (orderStatus[order.status] ?? order.status);
  const nameOf = (id: string | null) => id ? (names[id] ?? '#' + id.slice(0, 6)) : '—';
  // Customers who never set a name only have an email on file: show their phone number instead, which is
  // what the admin actually uses to reach them. The email stays as the last resort.
  const customerTitle = (order: AdminMobileOrder) => { const name = nameOf(order.customer_id); return name.includes('@') ? 'عميل بدون اسم' : name; };
  const customerLabel = (order: AdminMobileOrder) => {
    const name = nameOf(order.customer_id);
    if (!name.includes('@')) return name;
    const phone = order.address_id ? addresses[order.address_id]?.contact_phone : null;
    return phone ? ltrPhone(phone) : name;
  };
  const counts = useMemo(() => {
    const result: Record<string, number> = { all: orders.length, action: 0, searching: 0, active: 0, done: 0 };
    for (const order of orders) { const group = groupOf(order); if (group in result) result[group] += 1; }
    return result;
  }, [orders, groupOf]);
  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matchesStatus = (order: AdminMobileOrder) => { const group = groupOf(order); return filter === 'all' || (filter === 'action' ? group === 'action' : filter === 'active' ? group === 'active' || group === 'searching' : filter === 'done' ? adminStatusGroup(order.status) === 'done' : order.status === 'cancelled'); };
    return orders.filter((order) => matchesStatus(order) && (!filterDriver || order.driver_id === filterDriver) && inAdminPeriod(order.created_at, filterPeriod) && (!term || order.id.toLowerCase().includes(term) || order.request_text.toLowerCase().includes(term) || (names[order.customer_id ?? ''] ?? '').toLowerCase().includes(term)));
  }, [orders, filter, filterDriver, filterPeriod, search, names, groupOf]);
  const driverCounts = useMemo(() => { const map: Record<string, number> = {}; for (const order of orders) if (order.driver_id) map[order.driver_id] = (map[order.driver_id] ?? 0) + 1; return map; }, [orders]);
  const isFinished = useCallback((order: AdminMobileOrder) => (adminStatusGroup(order.status) === 'done' || order.status === 'cancelled') && !openDisputes[order.id] && order.status !== 'disputed', [openDisputes]);
  const activeList = useMemo(() => list.filter((order) => !isFinished(order)), [list, isFinished]);
  const finishedList = useMemo(() => list.filter((order) => isFinished(order)), [list, isFinished]);

  useEffect(() => { onBadge('orders', counts.action); }, [counts.action, onBadge]);
  useEffect(() => { if (counts.action === 0 && filter === 'action') setFilter('all'); }, [counts.action, filter]);
  const toneForOrder = (order: AdminMobileOrder) => noResponse(order) ? { bg: '#3A2D18', fg: '#F0CC83' } : toneFor(order.status);
  const toneFor = (status: string) => {
    const group = adminStatusGroup(status);
    if (status === 'cancelled') return { bg: '#451E21', fg: '#FF8A8A' };
    if (group === 'action') return { bg: '#3A2D18', fg: '#F0CC83' };
    if (group === 'searching') return { bg: '#1C2F3A', fg: '#80CAFF' };
    if (group === 'active') return { bg: '#26391C', fg: color.primary === '#343A32' ? '#385616' : '#B7FF30' };
    return { bg: color.raised, fg: color.muted };
  };
  const openSheet = useCallback((order: AdminMobileOrder) => {
    setFee(order.delivery_quote_set_at ? String(order.delivery_fee_minor) : ''); setReason(''); setMode('all'); setDriverId(''); setPricingOpen(false); setSheet(order);
  }, []);
  useEffect(() => { onDetail(!!sheet); }, [sheet, onDetail]);
  useEffect(() => {
    if (!focusOrderId) return;
    const target = orders.find((order) => order.id === focusOrderId);
    if (target) { openSheet(target); onFocusHandled(); }
  }, [focusOrderId, orders, openSheet, onFocusHandled]);
  useEffect(() => {
    setDispute(null); setResolution('');
    if (!sheet || !(sheet.status === 'disputed' || openDisputes[sheet.id]) || !supabase) return;
    let active = true;
    void supabase.from('order_disputes').select('id,reason,details,opened_by,created_at').eq('order_id', sheet.id).is('resolved_at', null).limit(1).then(({ data }) => { if (active) setDispute(data?.[0] ?? null); });
    return () => { active = false; };
  }, [sheet, openDisputes]);
  const cancelOrder = async (reason: string) => {
    if (!supabase || !sheet) return;
    setCancelling(true);
    const { error } = await supabase.rpc('cancel_admin_order', { p_order_id: sheet.id, p_reason: reason });
    setCancelling(false);
    if (error) { setCancelOpen(false); setMessage('ما قدرنا نلغي الطلب. إذا السائق اشترى الأغراض لازم يكون في بلاغ مفتوح على الطلب.'); return; }
    setCancelOpen(false); setSheet(null); await refreshNow(); setMessage('تم إلغاء الطلب.');
  };
  const pauseOrder = async () => {
    if (!supabase || !dispute) return;
    if (!(await confirmAction('إيقاف الطلب مؤقتاً؟', 'السائق والعميل بيشوفوا إن الطلب متوقف مؤقتاً. بيرجع لحالته لما تحل البلاغ.', 'إيقاف الطلب'))) return;
    setResolving(true);
    const { error } = await supabase.rpc('admin_pause_order', { p_dispute_id: dispute.id });
    setResolving(false);
    if (error) { setMessage('ما قدرنا نوقف الطلب. تأكد أنه ما زال جارياً وجرّب مرة ثانية.'); return; }
    setSheet(null); await refreshNow(); setMessage('تم إيقاف الطلب مؤقتاً.');
  };
  useEffect(() => {
    setTimeline(null);
    if (!sheet || !timelineOpen || !supabase) return;
    let active = true;
    void supabase.from('order_events').select('id,event_type,actor_id,created_at,details').eq('order_id', sheet.id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(30).then(({ data }) => { if (active) setTimeline((data ?? []) as { id: number; event_type: string; actor_id: string | null; created_at: string; details: Record<string, unknown> | null }[]); });
    return () => { active = false; };
  }, [sheet, timelineOpen]);
  const resolveDispute = async () => {
    if (!supabase || !dispute) return;
    if (resolution.trim().length < 5) { setMessage('اكتب ملخص الحل (5 أحرف على الأقل).'); return; }
    setResolving(true);
    const { error } = await supabase.rpc('resolve_order_dispute', { p_dispute_id: dispute.id, p_resolution: resolution.trim() });
    setResolving(false);
    if (error) { setMessage('ما قدرنا نسجل الحل. جرّب مرة ثانية.'); return; }
    setSheet(null); await refreshNow(); setMessage('تم حل البلاغ.');
  };
  const actionable = !!sheet && ['requested', 'quoted', 'searching'].includes(sheet.status) && !sheet.driver_id;
  const priceAndRoute = async () => {
    if (!supabase || !sheet) return;
    const amount = Number(fee);
    if (!fee || !Number.isSafeInteger(amount) || amount < 0 || amount > 100000000) { setMessage('أدخل أجرة توصيل صحيحة.'); return; }
    if (mode === 'driver' && !driverId) { setMessage('اختر السائق الذي تريد إسناد الطلب له.'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_price_and_dispatch_order', { p_order_id: sheet.id, p_fee_minor: amount, p_driver_id: mode === 'driver' ? driverId : null, p_reason: reason.trim() });
    setBusy(false);
    if (error) { setMessage('ما قدرنا نحفظ الأجرة أو نرسل الطلب. تأكد من توفر السائق وحاول مرة ثانية.'); return; }
    setSheet(null); setPricingOpen(false); await refreshNow();
    setMessage(mode === 'driver' ? 'تم تحديد الأجرة وإرسال الطلب للسائق المحدد، بانتظار رده.' : data ? `تم إرسال العرض إلى ${data} سائق متاح؛ أول من يقبل يحصل على الطلب.` : 'تم حفظ الأجرة، ولا يوجد سائق متاح حالياً. أعد الإرسال عند توفر سائق.');
  };

  const pill = (on: boolean) => ({ minHeight: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1, borderColor: on ? color.primary : color.border, backgroundColor: on ? color.primary : color.surface, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 7 });
  const input = { minHeight: 50, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: color.border, backgroundColor: color.raised, color: color.text, textAlign: 'left' as const, fontSize: 15 } as const;
  const header = <AdminTopBar />;

  if (sheet) {
    const address = sheet.address_id ? addresses[sheet.address_id] : undefined;
    const { pickup, body } = splitPickup(sheet.request_text);
    const delivered = ['delivered', 'settled'].includes(sheet.status);
    const tone = toneForOrder(sheet);
    const card = { backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: 18, padding: 12 } as const;
    const tag = (label: string, value: string) => <View key={label} style={{ flexDirection: 'row', gap: 5, backgroundColor: color.raised, borderColor: color.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 }}><Text style={{ color: color.muted, fontSize: 12 }}>{label}</Text><Text style={{ color: color.text, fontSize: 12, fontWeight: '800' }}>{value}</Text></View>;
    const segment = (on: boolean) => ({ flex: 1, minHeight: 46, borderRadius: 13, borderWidth: 1.5, borderColor: on ? color.primary : color.border, backgroundColor: on ? color.primary : color.surface, alignItems: 'center' as const, justifyContent: 'center' as const });
    const chosenDriver = drivers.find((driver) => driver.user_id === driverId);
    return <SafeAreaView style={[style.safe, { flex: 1 }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: color.border }}>
          <Pressable onPress={() => setSheet(null)} accessibilityRole="button" accessibilityLabel="رجوع" style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' }}><SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} tintColor={color.text} size={18} /></Pressable>
          <View style={{ flex: 1 }}><Text style={{ color: color.muted, fontSize: 11.5, textAlign: 'left' }}>#{sheet.id.slice(0, 8)} · {timeAgo(sheet.created_at)}</Text><Text style={{ color: color.text, fontSize: 18, fontWeight: '900', textAlign: 'left' }}>طلب #{sheet.id.slice(0, 6)}</Text></View>
          <View style={{ backgroundColor: tone.bg, borderRadius: 11, paddingHorizontal: 10, minHeight: 26, justifyContent: 'center' }}><Text style={{ color: tone.fg, fontSize: 11.5, fontWeight: '900' }}>{statusLabel(sheet)}</Text></View>
        </View>
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 20 }}>
          <View style={card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
              <View style={{ width: 42, height: 42, borderRadius: 21, borderWidth: 2, borderColor: color.primary, backgroundColor: color.raised, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 19 }}>👤</Text></View>
              <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: color.text, fontSize: 18, fontWeight: '900', textAlign: 'left' }}>{customerTitle(sheet)}</Text>{address?.contact_phone ? <Text style={{ color: color.muted, fontSize: 12.5, textAlign: 'left', writingDirection: 'ltr' }}>{ltrPhone(address.contact_phone)}</Text> : null}</View>
              {address?.contact_phone ? <Pressable onPress={() => void Linking.openURL(`tel:${address.contact_phone}`)} accessibilityRole="button" accessibilityLabel="اتصال بالعميل" style={{ minHeight: 44, borderRadius: 13, backgroundColor: color.primary, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: color.background, fontSize: 14, fontWeight: '900' }}>📞 اتصال</Text></Pressable> : null}
            </View>
            <View style={{ height: 1, backgroundColor: color.border, marginVertical: 10 }} />
            <View style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start' }}>
              <Text style={{ fontSize: 16 }}>📍</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: color.text, fontSize: 14.5, fontWeight: '800', lineHeight: 22, textAlign: 'left' }}>{address ? [address.neighborhood, address.label].filter(Boolean).join(' · ') : '—'}</Text>
                {address && [address.city, address.street, address.building ? 'بناء ' + address.building : '', address.landmark].some(Boolean) ? <Text style={{ color: color.muted, fontSize: 12.5, lineHeight: 19, textAlign: 'left' }}>{[address.city, address.street, address.building ? 'بناء ' + address.building : '', address.landmark].filter(Boolean).join(' · ')}</Text> : null}
              </View>
            </View>
          </View>
          <View style={[card, { gap: 9 }]}>
            <Text style={{ color: color.text, fontSize: 15, fontWeight: '700', lineHeight: 25, textAlign: 'left' }}>{body}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{[...(pickup ? [tag('الشراء من', pickup)] : [])]}</View>
            <AdminImageStrip orderId={sheet.id} />
          </View>
          {delivered && <View style={[card, { borderColor: color.accent, gap: 9 }]}>
            <Text style={{ color: color.accent, fontSize: 14.5, fontWeight: '900', textAlign: 'left' }}>✅ إيصال الطلب</Text>
            <OrderReceipt admin data={{ id: sheet.id, createdAt: sheet.created_at, deliveredAt: sheet.delivered_at, deliveryProofPath: sheet.delivery_proof_path, request: sheet.request_text, address: sheet.address_id ? addresses[sheet.address_id] ?? null : null, purchase: sheet.purchase_amount_minor, fee: sheet.delivery_fee_minor, collected: cashCollected[sheet.id] ?? null, note: deliveryNotes[sheet.id] ?? null, driverName: nameOf(sheet.driver_id), customerName: customerLabel(sheet) }} />
            {sheet.driver_id && driverPhones[sheet.driver_id] ? <Pressable onPress={() => void Linking.openURL(`tel:${driverPhones[sheet.driver_id!]}`)} accessibilityRole="button" accessibilityLabel="اتصال بالسائق" style={{ minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: color.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: color.primary, fontSize: 14, fontWeight: '900' }}>📞 اتصال بالسائق · {ltrPhone(driverPhones[sheet.driver_id])}</Text></Pressable> : null}
          </View>}
          {(sheet.status === 'disputed' || openDisputes[sheet.id]) && <View style={[card, { borderColor: '#C98A2B', gap: 8 }]}>
            <Text style={{ color: '#F0CC83', fontSize: 14.5, fontWeight: '900', textAlign: 'left' }}>⚠️ بلاغ من {dispute ? (dispute.opened_by === sheet.customer_id ? 'العميل' : 'السائق') + ' ' + nameOf(dispute.opened_by) : '…'}</Text>
            {dispute ? <>
              <Text style={{ color: color.text, fontSize: 14, fontWeight: '800', textAlign: 'left' }}>{dispute.reason} · <Text style={{ color: color.muted, fontWeight: '500' }}>{timeAgo(dispute.created_at)}</Text></Text>
              <Text selectable style={{ color: color.text, fontSize: 14, lineHeight: 23, textAlign: 'left' }}>{dispute.details}</Text>
              <TextInput value={resolution} onChangeText={setResolution} multiline textAlign="left" textAlignVertical="top" placeholder="اكتب ملخص الحل أو الخطوة التي تمت" placeholderTextColor={color.muted} style={{ minHeight: 70, borderRadius: 12, borderWidth: 1, borderColor: color.border, backgroundColor: color.raised, color: color.text, padding: 10, fontSize: 14 }} accessibilityLabel="ملخص الحل" />
              <Pressable disabled={resolving || !online} onPress={() => void resolveDispute()} accessibilityRole="button" style={{ minHeight: 48, borderRadius: 14, backgroundColor: '#B7FF30', alignItems: 'center', justifyContent: 'center', opacity: resolving || !online ? 0.55 : 1 }}><Text style={{ color: '#0B1411', fontSize: 15, fontWeight: '900' }}>{resolving ? 'لحظة…' : sheet.status === 'disputed' ? '✅ حل البلاغ وإعادة الطلب' : '✅ تم حل البلاغ'}</Text></Pressable>
              {sheet.status !== 'disputed' && ['accepted', 'assigned', 'shopping', 'awaiting_approval', 'purchased', 'delivering'].includes(sheet.status) ? <Pressable disabled={resolving || !online} onPress={() => void pauseOrder()} accessibilityRole="button" style={{ minHeight: 44, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C98A2B', alignItems: 'center', justifyContent: 'center', opacity: resolving || !online ? 0.55 : 1 }}><Text style={{ color: '#F0CC83', fontSize: 13.5, fontWeight: '800' }}>⏸ إيقاف الطلب مؤقتاً</Text></Pressable> : null}
            </> : <Text style={{ color: color.muted, fontSize: 13, textAlign: 'left' }}>عم نحمّل تفاصيل البلاغ…</Text>}
          </View>}
          {sheet.status === 'searching' && ((declines[sheet.id]?.length ?? 0) > 0 || liveOffers(sheet.id).length > 0 || noResponse(sheet)) && <View style={[card, { gap: 6 }]}>
            {noResponse(sheet) ? <Text style={{ color: '#F0CC83', fontSize: 13.5, fontWeight: '800', lineHeight: 21, textAlign: 'left' }}>⏰ ما حدا من السائقين رد خلال 10 دقايق. أعد الإرسال للكل أو أسنده لسائق محدد.</Text> : null}
            {liveOffers(sheet.id).map((offer) => <Text key={offer.driver_id} style={{ color: '#F0CC83', fontSize: 13.5, fontWeight: '800', textAlign: 'left' }}>⏳ {nameOf(offer.driver_id)} · بانتظار رده</Text>)}
            {(declines[sheet.id] ?? []).map((id) => <Text key={id} style={{ color: '#FF8A8A', fontSize: 13.5, fontWeight: '800', textAlign: 'left' }}>⚠️ {nameOf(id)} · اعتذر</Text>)}
          </View>}
          <View style={[card, { gap: 8 }]}>
            <Pressable onPress={() => setTimelineOpen((value) => !value)} accessibilityRole="button" accessibilityState={{ expanded: timelineOpen }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 38 }}><Text style={{ color: color.text, fontSize: 14, fontWeight: '900' }}>🕘 سجل الطلب</Text><Text style={{ color: color.primary, fontSize: 12.5, fontWeight: '900' }}>{timelineOpen ? 'إخفاء ⌃' : 'عرض ⌄'}</Text></Pressable>
            {timelineOpen ? (timeline === null ? <Text style={{ color: color.muted, fontSize: 13, textAlign: 'left' }}>عم نحمّل السجل…</Text> : timeline.length ? timeline.map((event) => { const detail = event.details ?? {}; const from = typeof detail.previous_status === 'string' ? detail.previous_status : typeof detail.previous_order_status === 'string' ? detail.previous_order_status : ''; return <View key={event.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, borderTopWidth: 1, borderTopColor: color.border, paddingTop: 6 }}><View style={{ flex: 1 }}><Text style={{ color: color.text, fontSize: 13.5, fontWeight: '800', textAlign: 'left' }}>{eventLabels[event.event_type] ?? event.event_type}{from ? ` (من: ${orderStatus[from] ?? from})` : ''}</Text><Text style={{ color: color.muted, fontSize: 11.5, textAlign: 'left' }}>{event.actor_id ? nameOf(event.actor_id) : 'النظام'}</Text></View><Text style={{ color: color.muted, fontSize: 11.5 }}>{shortDateTimeFormatter.format(new Date(event.created_at))}</Text></View>; }) : <Text style={{ color: color.muted, fontSize: 13, textAlign: 'left' }}>ما في أحداث مسجلة.</Text>) : null}
          </View>
          {!['delivered', 'settled', 'cancelled'].includes(sheet.status) && <View style={[card, { gap: 8 }]}>
            <Pressable disabled={cancelling || !online} onPress={() => setCancelOpen(true)} accessibilityRole="button" style={{ minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: '#FF8A8A', alignItems: 'center', justifyContent: 'center', opacity: cancelling || !online ? 0.55 : 1 }}><Text style={{ color: '#FF8A8A', fontSize: 14.5, fontWeight: '900' }}>🚫 إلغاء الطلب</Text></Pressable>
          </View>}
          <CancelReasonSheet target={cancelOpen ? { id: sheet.id, label: `طلب #${sheet.id.slice(0, 6)} · ${sheet.request_text}` } : null} busy={cancelling} warning={sheet.purchase_amount_minor !== null || ['purchased', 'delivering'].includes(sheet.status) ? 'السائق اشترى الأغراض أصلاً. الإلغاء بعد الشراء بيحتاج بلاغاً مفتوحاً على الطلب، وبتضل المبالغ مسجلة للتسوية اليدوية.' : undefined} onClose={() => setCancelOpen(false)} onConfirm={(reason) => void cancelOrder(reason)} />
          {!delivered && !actionable && <View style={card}><Text style={{ color: color.muted, fontSize: 13.5, textAlign: 'center', lineHeight: 22 }}>{sheet.driver_id ? `الطلب مع السائق ${nameOf(sheet.driver_id)} ولا يحتاج إجراء منك.` : 'ما في إجراءات متاحة لهالطلب حالياً.'}</Text></View>}
          <Modal visible={actionable && pricingOpen} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => setPricingOpen(false)}>
          <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={() => setPricingOpen(false)} accessibilityRole="button" accessibilityLabel="إغلاق" />
          <View style={{ backgroundColor: color.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderTopWidth: 1, borderColor: color.border, maxHeight: '88%' }}>
          <View style={{ alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: color.border, marginTop: 10 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 }}><Text style={{ color: color.text, fontSize: 19, fontWeight: '900' }}>تسعير وإرسال</Text><Pressable onPress={() => setPricingOpen(false)} accessibilityRole="button" accessibilityLabel="إغلاق" style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: color.text, fontSize: 18 }}>✕</Text></Pressable></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 10 }}>
            <Text style={{ color: color.muted, fontSize: 12.5, fontWeight: '800', textAlign: 'left' }}>أجرة التوصيل</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: color.border, backgroundColor: color.raised, borderRadius: 13, paddingHorizontal: 8 }}>
              <Pressable onPress={() => setFee(String(Math.max(0, (Number(fee) || 0) - 1000)))} accessibilityRole="button" accessibilityLabel="نقّص ألف" style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: color.text, fontSize: 22, fontWeight: '900' }}>−</Text></Pressable>
              <TextInput value={fee} onChangeText={(value) => setFee(value.replace(/\D/g, '').slice(0, 9))} keyboardType="number-pad" placeholder="مثال: 15000" placeholderTextColor={color.muted} style={{ flex: 1, minHeight: 50, color: color.primary, fontSize: 20, fontWeight: '900', textAlign: 'left' }} accessibilityLabel="أجرة التوصيل" />
              <Text style={{ color: color.muted, fontSize: 13, fontWeight: '700' }}>ل.س</Text>
              <Pressable onPress={() => setFee(String(Math.min(100000000, (Number(fee) || 0) + 1000)))} accessibilityRole="button" accessibilityLabel="زِد ألف" style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: color.text, fontSize: 22, fontWeight: '900' }}>+</Text></Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>{[10000, 15000, 20000, 25000].map((amount) => <Pressable key={amount} onPress={() => setFee(String(amount))} accessibilityRole="button" style={{ flex: 1, minHeight: 38, borderRadius: 10, borderWidth: 1, borderColor: fee === String(amount) ? color.primary : color.border, backgroundColor: fee === String(amount) ? color.raised : color.surface, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: fee === String(amount) ? color.primary : color.muted, fontSize: 12.5, fontWeight: '800' }}>{numberFormatter.format(amount)}</Text></Pressable>)}</View>
            <View style={{ height: 1, backgroundColor: color.border, marginVertical: 2 }} />
            <Text style={{ color: color.muted, fontSize: 12.5, fontWeight: '800', textAlign: 'left' }}>إرسال إلى</Text>
            <View style={{ flexDirection: 'row', gap: 7 }}>
              <Pressable onPress={() => setMode('all')} accessibilityRole="radio" accessibilityState={{ selected: mode === 'all' }} style={segment(mode === 'all')}><Text style={{ color: mode === 'all' ? color.background : color.text, fontSize: 13.5, fontWeight: '800' }}>كل المتاحين ({drivers.length})</Text></Pressable>
              <Pressable onPress={() => setMode('driver')} accessibilityRole="radio" accessibilityState={{ selected: mode === 'driver' }} style={segment(mode === 'driver')}><Text style={{ color: mode === 'driver' ? color.background : color.text, fontSize: 13.5, fontWeight: '800' }}>سائق محدد</Text></Pressable>
            </View>
            {mode === 'driver' && (drivers.length ? <View style={{ gap: 6 }}>{drivers.map((driver) => { const on = driverId === driver.user_id; return <Pressable key={driver.user_id} onPress={() => setDriverId(driver.user_id)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 46, paddingHorizontal: 11, borderRadius: 12, borderWidth: 1, borderColor: on ? color.primary : color.border, backgroundColor: on ? color.raised : color.surface }}><Text style={{ fontSize: 15 }}>{on ? '✅' : '🛵'}</Text><Text style={{ flex: 1, color: color.text, fontSize: 13.5, fontWeight: '800', textAlign: 'left' }}>{nameOf(driver.user_id)}</Text><Text style={{ color: color.muted, fontSize: 12 }}>{driver.vehicle_description || 'بدون وصف'}</Text></Pressable>; })}</View> : <Text style={{ color: '#F0CC83', fontSize: 13, textAlign: 'left' }}>ما في سائق متاح حالياً. فيك ترسل للجميع لما يتوفر سائق.</Text>)}
          <Text style={{ color: color.muted, fontSize: 12.5, lineHeight: 20, textAlign: 'left' }}>الزبون بيدفع ثمن المشتريات + أجرة التوصيل{Number(fee) > 0 ? ` (${numberFormatter.format(Number(fee))} ل.س)` : ''}.</Text>
          </ScrollView>
          <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18 + insets.bottom, borderTopWidth: 1, borderTopColor: color.border }}>
            <Pressable disabled={busy || !online} onPress={() => void priceAndRoute()} accessibilityRole="button" style={{ minHeight: 54, borderRadius: 17, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center', opacity: busy || !online ? 0.55 : 1 }}><Text style={{ color: color.background, fontSize: 16, fontWeight: '900' }}>{busy ? 'عم نحفظ ونرسل…' : mode === 'driver' ? (chosenDriver ? `تحديد الأجرة وإسناد ${nameOf(chosenDriver.user_id)}` : 'تحديد الأجرة وإسناد السائق') : 'تحديد الأجرة وإرسال للجميع'}</Text></Pressable>
          </View>
          </View>
          </KeyboardAvoidingView>
          </Modal>
        </ScrollView>
        {actionable && <View style={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 12, borderTopWidth: 1, borderTopColor: color.border, backgroundColor: color.background }}>
          <Pressable onPress={() => setPricingOpen(true)} accessibilityRole="button" style={{ minHeight: 54, borderRadius: 17, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: color.background, fontSize: 16, fontWeight: '900' }}>{sheet.status === 'searching' ? 'إعادة الإرسال أو إسناد سائق ←' : sheet.delivery_quote_set_at ? 'إرسال الطلب للسائقين ←' : 'تحديد الأجرة والإرسال ←'}</Text></Pressable>
        </View>}
      </KeyboardAvoidingView>
    </SafeAreaView>;
  }
  const cancelledCount = orders.filter((order) => order.status === 'cancelled').length;
  const filtersOn = !!filterDriver || filterPeriod !== 'all' || filter !== 'all';
  const clearFilters = () => { setFilter('all'); setFilterDriver(''); setFilterPeriod('all'); setVisible(25); setFinishedShown(12); };
  const filterPill = (key: 'driver' | 'period' | 'status', label: string, on: boolean) => <Pressable key={key} onPress={() => setOpenFilter(key)} accessibilityRole="button" accessibilityLabel={label} style={{ flex: 1, minWidth: 0, minHeight: 42, borderRadius: 21, borderWidth: 1, borderColor: on ? color.primary : color.border, backgroundColor: on ? 'rgba(183,255,48,0.14)' : color.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8 }}>
    <Text numberOfLines={1} ellipsizeMode="tail" style={{ flexShrink: 1, color: on ? color.primary : color.text, fontSize: 14, fontWeight: on ? '900' : '700' }}>{label}</Text>
    <Text style={{ color: on ? color.primary : color.muted, fontSize: 10 }}>⌄</Text>
  </Pressable>;
  const renderFinished = (order: AdminMobileOrder, index: number) => {
    const tone = toneForOrder(order); const cancelled = order.status === 'cancelled'; const open = openFinished === order.id;
    const purchase = order.purchase_amount_minor ?? 0; const collected = cashCollected[order.id] ?? order.cash_collected_minor ?? null;
    const total = cancelled ? null : collected ?? purchase + order.delivery_fee_minor;
    const barColor = cancelled ? adminTone.bad.fg : order.status === 'settled' ? color.primary : adminTone.ok.fg;
    const parsed = splitPickup(order.request_text);
    const row = (label: string, value: string, tint?: string) => <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}><Text style={{ color: color.muted, fontSize: 14 }}>{label}</Text><Text style={{ color: tint ?? color.text, fontSize: 14, fontWeight: '900' }}>{value}</Text></View>;
    return <View key={order.id} style={{ borderTopWidth: index ? 1 : 0, borderTopColor: color.border }}>
      <Pressable onPress={() => setOpenFinished(open ? null : order.id)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`طلب #${order.id.slice(0, 6)}، ${statusLabel(order)}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 }}>
        <View style={{ width: 5, alignSelf: 'stretch', borderRadius: 3, backgroundColor: barColor }} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text numberOfLines={1} style={{ color: color.text, fontSize: 16.5, fontWeight: '900', textAlign: 'left' }}>{parsed.body}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <View style={{ backgroundColor: tone.bg, borderRadius: 10, paddingHorizontal: 9, minHeight: 22, justifyContent: 'center' }}><Text style={{ color: tone.fg, fontSize: 12, fontWeight: '900' }}>{statusLabel(order)}</Text></View>
            <Text numberOfLines={1} style={{ flexShrink: 1, color: color.muted, fontSize: 12.5 }}>{timeAgo(order.created_at)} · #{order.id.slice(0, 6)}</Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-start' }}>{total === null ? <Text style={{ color: color.muted, fontSize: 16, fontWeight: '900' }}>—</Text> : <><Text style={{ color: color.text, fontSize: 16, fontWeight: '900' }}>{numberFormatter.format(total)}</Text><Text style={{ color: color.muted, fontSize: 11.5 }}>ل.س</Text></>}</View>
      </Pressable>
      {open ? <View style={{ borderTopWidth: 1, borderTopColor: color.border, backgroundColor: color.background, padding: 14, gap: 12 }}>
        {!cancelled ? <View style={{ flexDirection: 'row', gap: 4 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{adminStages.map((stage) => <View key={stage} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: color.accent }} />)}</View> : null}
        <View style={{ gap: 7 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><View style={{ width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: color.primary }} /><Text numberOfLines={1} style={{ flex: 1, color: color.text, fontSize: 14.5, textAlign: 'left' }}>{parsed.pickup ? `من ${parsed.pickup}` : 'من أقرب محل للسائق'}</Text></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: color.primary }} /><Text numberOfLines={1} style={{ flex: 1, color: color.text, fontSize: 14.5, textAlign: 'left' }}>إلى {order.address_id && addresses[order.address_id] ? `${addresses[order.address_id].neighborhood}، ${addresses[order.address_id].city}` : '—'}</Text></View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: 14, padding: 10 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text numberOfLines={1} style={{ color: color.muted, fontSize: 14, textAlign: 'left' }}>العميل · <Text style={{ color: color.text, fontWeight: '900' }}>{customerLabel(order)}</Text></Text>
            {order.driver_id ? <Text numberOfLines={1} style={{ color: color.muted, fontSize: 14, textAlign: 'left' }}>السائق · <Text style={{ color: color.text, fontWeight: '900' }}>{nameOf(order.driver_id)}</Text></Text> : null}
            {!cancelled && order.delivered_at ? <Text style={{ color: adminTone.ok.fg, fontSize: 12.5, fontWeight: '700', textAlign: 'left' }}>✓ تسليم {timeAgo(order.delivered_at)}</Text> : null}
          </View>
          <AdminImageStrip orderId={order.id} bucket={cancelled ? 'order-images' : 'delivery-proofs'} proofPath={order.delivery_proof_path} size={56} />
        </View>
        {!cancelled ? <View style={{ backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 }}>
          {row('المشتريات', order.purchase_amount_minor === null ? '—' : numberFormatter.format(order.purchase_amount_minor) + ' ل.س')}
          {row('أجرة التوصيل', numberFormatter.format(order.delivery_fee_minor) + ' ل.س')}
          {row('المبلغ المستلم', total === null ? '—' : numberFormatter.format(total) + ' ل.س', color.primary)}
        </View> : null}
        <Pressable onPress={() => openSheet(order)} accessibilityRole="button" style={{ minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: color.text, fontSize: 14.5, fontWeight: '900' }}>فتح تفاصيل الطلب</Text></Pressable>
      </View> : null}
    </View>;
  };
  return <SafeAreaView edges={['top']} style={[style.safe, { flex: 1 }]}>
    {header}
    <KeyboardScroll contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void manualRefresh()} tintColor={color.primary} colors={[color.primary]} progressBackgroundColor={color.surface} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View><Text style={{ color: color.text, fontSize: 24, fontWeight: '900', textAlign: 'left' }}>الطلبات</Text><Text style={{ color: color.muted, fontSize: 12.5, textAlign: 'left', marginTop: 2 }}>{counts.action ? `${counts.action} طلب بانتظار إجراء منك` : 'ما في طلبات بانتظار إجراء'}</Text></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={() => { if (searchOpen || search) { setSearchOpen(false); setSearch(''); } else setSearchOpen(true); }} accessibilityRole="button" accessibilityLabel="بحث" style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' }}><SymbolView name={searchOpen || search ? { ios: 'xmark', android: 'close', web: 'close' } : { ios: 'magnifyingglass', android: 'search', web: 'search' }} tintColor={color.primary} size={18} /></Pressable>
          <Pressable disabled={refreshing} onPress={() => void manualRefresh()} accessibilityRole="button" style={[pill(false), refreshing && { opacity: 0.6 }]}><Text style={{ color: color.primary, fontSize: 12, fontWeight: '800' }}>{refreshing ? 'لحظة…' : '↻ تحديث'}</Text></Pressable>
        </View>
      </View>
      {searchOpen || search ? <TextInput value={search} autoFocus={searchOpen && !search} onChangeText={(value) => { setSearch(value); setVisible(25); }} placeholder="ابحث برقم الطلب أو النص أو اسم العميل" placeholderTextColor={color.muted} style={input} accessibilityLabel="بحث في الطلبات" /> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {filterPill('driver', filterDriver ? nameOf(filterDriver).split(' ')[0] : 'السائق', !!filterDriver)}
        {filterPill('period', filterPeriod === 'all' ? 'الفترة' : adminPeriodLabels[filterPeriod], filterPeriod !== 'all')}
        {filterPill('status', filter === 'all' ? 'الحالة' : adminStatusLabels[filter], filter !== 'all')}
      </View>
      {filtersOn ? <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: color.muted, fontSize: 13 }}><Text style={{ color: color.text, fontWeight: '900' }}>{list.length}</Text> طلب</Text><Pressable onPress={clearFilters} hitSlop={8} accessibilityRole="button"><Text style={{ color: color.primary, fontSize: 13, fontWeight: '900' }}>مسح الفلاتر</Text></Pressable></View> : null}
      {openFilter === 'driver' ? <FilterSheet title="السائق" value={filterDriver} options={[{ key: '', label: 'كل السائقين', sub: String(orders.filter((order) => order.driver_id).length) }, ...Object.keys(driverCounts).map((id) => ({ key: id, label: nameOf(id), sub: String(driverCounts[id]), initial: nameOf(id).slice(0, 1) }))]} onSelect={(key) => { setFilterDriver(key); setVisible(25); setFinishedShown(12); }} onClose={() => setOpenFilter(null)} /> : null}
      {openFilter === 'period' ? <FilterSheet title="الفترة" value={filterPeriod} options={(Object.keys(adminPeriodLabels) as AdminPeriod[]).map((key) => ({ key, label: adminPeriodLabels[key] }))} onSelect={(key) => { setFilterPeriod(key as AdminPeriod); setVisible(25); setFinishedShown(12); }} onClose={() => setOpenFilter(null)} /> : null}
      {openFilter === 'status' ? <FilterSheet title="الحالة" value={filter} options={[{ key: 'all', label: adminStatusLabels.all, sub: String(orders.length) }, { key: 'action', label: adminStatusLabels.action, sub: String(counts.action) }, { key: 'active', label: adminStatusLabels.active, sub: String(counts.active + counts.searching) }, { key: 'done', label: adminStatusLabels.done, sub: String(counts.done) }, { key: 'cancelled', label: adminStatusLabels.cancelled, sub: String(cancelledCount) }]} onSelect={(key) => { setFilter(key as AdminFilter); setVisible(25); setFinishedShown(12); }} onClose={() => setOpenFilter(null)} /> : null}
      {counts.action > 0 && !search ? <Pressable onPress={() => { setFilter(filter === 'action' ? 'all' : 'action'); setVisible(25); }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: adminTone.warn.bg, borderColor: adminTone.warn.fg, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, minHeight: 50 }}>
        <View style={{ backgroundColor: adminTone.warn.fg, borderRadius: 12, minWidth: 26, paddingHorizontal: 8, minHeight: 24, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: color.background, fontSize: 13.5, fontWeight: '900' }}>{counts.action}</Text></View>
        <Text style={{ flex: 1, color: adminTone.warn.fg, fontSize: 15, fontWeight: '900', textAlign: 'left' }}>{counts.action === 1 ? 'طلب يحتاج إجراءك' : 'طلبات تحتاج إجراءك'}</Text>
        <Text style={{ color: adminTone.warn.fg, fontSize: 13.5, fontWeight: '900' }}>{filter === 'action' ? 'عرض الكل' : 'عرض ›'}</Text>
      </Pressable> : null}
      {loading ? [0, 1, 2].map((item) => <SkeletonCard key={item} style={{ gap: 12 }}><View style={[skRow, { justifyContent: 'space-between' }]}>{sk(90, 26, { borderRadius: 13 })}{sk(70, 12)}</View>{sk('90%', 12, { alignSelf: 'flex-start' })}{sk('60%', 12, { alignSelf: 'flex-start' })}<View style={[skRow, { justifyContent: 'space-between' }]}>{sk(110, 12)}{sk(80, 36, { borderRadius: 12 })}</View></SkeletonCard>)
        : list.length ? <>
          {activeList.length && finishedList.length ? <Text style={{ color: color.muted, fontSize: 14, fontWeight: '900', textAlign: 'left' }}>جارية · <Text style={{ color: color.text }}>{activeList.length}</Text></Text> : null}
          {activeList.slice(0, visible).map((order) => {
            const tone = toneForOrder(order); const hasReport = !!openDisputes[order.id] || order.status === 'disputed'; const needs = groupOf(order) === 'action' && ['requested', 'quoted', 'searching'].includes(order.status); const declinedNames = (declines[order.id] ?? []).map((id) => nameOf(id)); const pendingOffers = liveOffers(order.id); const silent = noResponse(order); const delayLabel = order.status === 'shopping' && order.shopping_admin_alerted_at ? 'متأخر بالتسوّق' : order.status === 'delivering' && order.delivery_admin_alerted_at ? 'متأخر بالتوصيل' : null;
            return <Pressable key={order.id} onPress={() => openSheet(order)} accessibilityRole="button" accessibilityLabel={`طلب #${order.id.slice(0, 6)}، ${orderStatus[order.status] ?? order.status}`} style={{ backgroundColor: color.surface, borderColor: order.is_urgent ? '#F5A623' : needs || hasReport ? '#C98A2B' : color.border, borderWidth: order.is_urgent ? 2 : 1, borderRadius: 20, padding: order.is_urgent ? 13 : 14, gap: 9 }}>
              {order.is_urgent ? <UrgentStrip /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ backgroundColor: tone.bg, borderRadius: 12, paddingHorizontal: 10, minHeight: 26, justifyContent: 'center' }}><Text style={{ color: tone.fg, fontSize: 12, fontWeight: '900' }}>{statusLabel(order)}</Text></View>
                <Text style={{ color: color.muted, fontSize: 11.5 }}>{timeAgo(order.created_at)} · #{order.id.slice(0, 6)}</Text>
              </View>
              {delayLabel ? <View style={{ alignSelf: 'flex-start', backgroundColor: '#451E21', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 }}><Text style={{ color: '#FF8A8A', fontSize: 11.5, fontWeight: '900' }}>{delayLabel}</Text></View> : null}
              <View style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
                <AdminOrderThumb orderId={order.id} bucket={adminStatusGroup(order.status) === 'done' ? 'delivery-proofs' : 'order-images'} proofPath={order.delivery_proof_path} />
                <Text numberOfLines={3} style={{ flex: 1, color: color.text, fontSize: 15, fontWeight: '800', lineHeight: 23, textAlign: 'left' }}>{splitPickup(order.request_text).body}</Text>
              </View>
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: color.primary }} /><Text numberOfLines={1} style={{ flex: 1, color: color.text, fontSize: 12.5, fontWeight: '800', textAlign: 'left' }}>{splitPickup(order.request_text).pickup ? `من ${splitPickup(order.request_text).pickup}` : 'من أقرب محل للسائق'}</Text></View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color.primary }} /><Text numberOfLines={1} style={{ flex: 1, color: color.muted, fontSize: 12.5, textAlign: 'left' }}>إلى {order.address_id && addresses[order.address_id] ? `${addresses[order.address_id].neighborhood}، ${addresses[order.address_id].city}` : '—'}</Text></View>
              </View>
              {order.status !== 'cancelled' ? <View style={{ flexDirection: 'row', gap: 4 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{adminStages.map((stage, step) => { const doneSteps = adminDoneSteps[order.status] ?? 0; return <View key={stage} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: step < doneSteps ? color.accent : step === doneSteps ? color.primary : color.raised }} />; })}</View> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text numberOfLines={1} style={{ color: color.muted, fontSize: 12.5, flex: 1, textAlign: 'left' }}>👤 {customerLabel(order)}</Text>
                <Text style={{ color: color.primary, fontSize: 13, fontWeight: '900' }}>{order.delivery_quote_set_at ? numberFormatter.format(order.delivery_fee_minor) + ' ل.س' : 'بلا أجرة'}</Text>
              </View>
              {order.driver_id ? <Text numberOfLines={1} style={{ color: adminStatusGroup(order.status) === 'done' ? color.accent : color.muted, fontSize: 12.5, fontWeight: adminStatusGroup(order.status) === 'done' ? '800' : '400', textAlign: 'left' }}>{adminStatusGroup(order.status) === 'done' ? `✅ سلّمه ${nameOf(order.driver_id)}${order.delivered_at ? ' · ' + timeAgo(order.delivered_at) : ''}${(cashCollected[order.id] ?? null) !== null ? ' · استلم ' + numberFormatter.format(cashCollected[order.id] as number) : ''}` : `🛵 ${nameOf(order.driver_id)}`}</Text> : null}
              {hasReport ? <View style={{ backgroundColor: 'rgba(240,204,131,0.12)', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8 }}><Text style={{ color: '#F0CC83', fontSize: 12.5, fontWeight: '800', textAlign: 'left' }}>⚠️ بلاغ مفتوح على هالطلب</Text></View> : null}
              {declinedNames.length ? <View style={{ backgroundColor: 'rgba(255,138,138,0.12)', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8 }}><Text style={{ color: '#FF8A8A', fontSize: 12.5, fontWeight: '800', textAlign: 'left' }}>⚠️ اعتذر {declinedNames.length} ({declinedNames.join('، ')})</Text></View> : null}
              {silent ? <View style={{ backgroundColor: 'rgba(240,204,131,0.12)', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8 }}><Text style={{ color: '#F0CC83', fontSize: 12.5, fontWeight: '800', textAlign: 'left' }}>⏰ ما حدا من السائقين رد من {Math.floor((clock - Date.parse(order.delivery_quote_set_at ?? order.created_at)) / 60000)} دقيقة. أعد الإرسال للكل أو أسنده لسائق.</Text></View> : null}
              {order.status === 'searching' && pendingOffers.length ? <View style={{ backgroundColor: 'rgba(240,204,131,0.12)', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8 }}><Text style={{ color: '#F0CC83', fontSize: 12.5, fontWeight: '800', textAlign: 'left' }}>{pendingOffers.length === 1 ? `⏳ ${nameOf(pendingOffers[0].driver_id)} · باقي ${minutesLeft(pendingOffers[0].expires_at)} د للرد` : `⏳ بانتظار رد ${pendingOffers.length} سائقين`}</Text></View> : null}
              {needs ? <View style={{ minHeight: 42, borderRadius: 14, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: color.background, fontSize: 14, fontWeight: '900' }}>{order.status === 'searching' ? 'إعادة الإرسال أو إسناد سائق ←' : order.delivery_quote_set_at ? 'إرسال الطلب للسائقين ←' : 'تحديد الأجرة وإرسال ←'}</Text></View> : null}
            </Pressable>;
          })}
          {finishedList.length ? <>
            {(() => { const shown = finishedList.slice(0, finishedShown); const groups: { label: string; items: AdminMobileOrder[] }[] = []; for (const order of shown) { const label = dayLabel(order.delivered_at ?? order.created_at); const last = groups[groups.length - 1]; if (last && last.label === label) last.items.push(order); else groups.push({ label, items: [order] }); } return groups.map((group) => <View key={`${group.label}-${group.items[0].id}`} style={{ gap: 6 }}>
              <Text style={{ color: color.muted, fontSize: 13, fontWeight: '900', textAlign: 'left', paddingHorizontal: 2 }}>{group.label}</Text>
              <View style={{ backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: 18, overflow: 'hidden' }}>{group.items.map((order, index) => renderFinished(order, index))}</View>
            </View>); })()}
            {finishedList.length > finishedShown ? <Pressable onPress={() => setFinishedShown((value) => value + 25)} accessibilityRole="button" style={{ minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: color.text, fontSize: 14, fontWeight: '800' }}>عرض المزيد ({finishedList.length - finishedShown})</Text></Pressable> : null}
          </> : null}
          {activeList.length > visible && <Pressable onPress={() => setVisible((value) => value + 25)} accessibilityRole="button" style={[pill(false), { alignSelf: 'center', justifyContent: 'center' }]}><Text style={{ color: color.primary, fontSize: 13, fontWeight: '800' }}>عرض المزيد ({activeList.length - visible})</Text></Pressable>}
        </> : <View style={{ alignItems: 'center', padding: 34, gap: 8 }}><Text style={{ color: color.text, fontSize: 17, fontWeight: '900' }}>ما في طلبات هون</Text><Text style={{ color: color.muted, fontSize: 13.5, textAlign: 'center' }}>{search ? 'ما لقينا نتيجة لبحثك.' : 'لما تنضاف طلبات بهالتصنيف بتظهر هون.'}</Text></View>}
    </KeyboardScroll>
  </SafeAreaView>;
}

function CustomerHome({ onSignOut, userId, email, inviteToken, openOrderId, showDriverFlow, driverStatus = null, theme, onToggleTheme }: { driverStatus?: string | null; onSignOut: () => void; userId: string; email: string; inviteToken?: string; openOrderId?: string; showDriverFlow: boolean; theme: 'dark' | 'light'; onToggleTheme: () => void }) {
  const { colors: c, styles: s } = useMobileTheme();
  const online = useInternetAvailable();
  const [request, setRequest] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [focusedField, setFocusedField] = useState<'request' | 'pickup' | null>(null);
  // Field borders: strong lime while typing in it, soft green once it has a value.
  const fieldBorder = (field: 'request' | 'pickup', filled: boolean) => focusedField === field ? { borderColor: '#B7FF30', borderWidth: 1.5 } : filled ? { borderColor: 'rgba(183,255,48,0.38)' } : null;
  const [addressesDone, setAddressesDone] = useState(false);
  const [homeSettled, setHomeSettled] = useState(false);
  const [homeTimedOut, setHomeTimedOut] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setHomeTimedOut(true), 2500); return () => clearTimeout(timer); }, []);
  const [pickup, setPickup] = useState('');
  const [tab, setTab] = useState(() => inviteToken ? 'profile' : 'home');
  const [tabHistory, setTabHistory] = useState<string[]>([]);
  const [notificationCount,setNotificationCount]=useState(0);
  const [notificationOrderId,setNotificationOrderId]=useState<string|null>(null);
  const [orderFilter,setOrderFilter]=useState<'all'|'live'|'done'>('all');
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
  const [, setOrderActionMessage] = useToastMessage();
  const [sending, setSending] = useState(false);
  const [, setRequestMessage] = useToastMessage();
  const [orderImages, setOrderImages] = useState<OrderImage[]>([]);
  const [pendingOrderId, setPendingOrderId] = useState('');
  const requestKey = useRef(newRequestKey());
  const [draftLoadedFor, setDraftLoadedFor] = useState('');
  const draftReady = draftLoadedFor === userId;
  const [draftSaveError, setDraftSaveError] = useState(false);
  const [tabScale] = useState(() => new Animated.Value(1));
  const [activeTabAnimation, setActiveTabAnimation] = useState('home');
  const navigate = useCallback((nextTab: string) => {
    if (nextTab !== 'orders') setNotificationOrderId(null);
    if (nextTab !== tab) setTabHistory((history) => [...history, tab]);
    setTab(nextTab);
    setActiveTabAnimation(nextTab);
    tabScale.setValue(0.82);
    Animated.spring(tabScale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 7 }).start();
  }, [tab, tabScale]);
  useEffect(() => {
    if (openOrderId) navigate('orders');
  }, [openOrderId, navigate]);
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
    // The driver-application status is already known by SignedInHome; no extra request here.
    if (active && driverStatus) setTab((current) => current === 'home' ? 'profile' : current);
    return () => { active = false; };
  }, [driverStatus]);
  useEffect(() => {
    let active = true;
    draftDirty.current = false;
    void loadCustomerOrderDraft(userId).then((draft) => {
      if (!active) return;
      if (draft && !draftDirty.current) {
        setRequest(draft.request);
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
      void saveCustomerOrderDraft(userId, { schemaVersion: 1, savedAt: new Date().toISOString(), request, addressId, idempotencyKey: requestKey.current, pendingOrderId: pendingOrderId || undefined, images: orderImages.map(({ id, mimeType, extension, uploaded }) => ({ id, mimeType, extension, uploaded })) })
        .then(() => setDraftSaveError(false))
        .catch(() => setDraftSaveError(true));
    }, 800); // saved after a pause in typing, not on nearly every keystroke
    return () => clearTimeout(timeout);
  }, [userId, draftReady, request, addressId, pendingOrderId, orderImages]);
  // The delivery address is re-read when coming back from the address book, otherwise at most once a minute.
  const addressesFetchedAt = useRef(0);
  const addressesDirty = useRef(true);
  useEffect(() => { if (tab === 'addresses') addressesDirty.current = true; }, [tab]);
  useEffect(() => {
    if (!draftReady || tab !== 'home' || !supabase || !online) return;
    if (!addressesDirty.current && Date.now() - addressesFetchedAt.current < 60 * 1000) return;
    let active = true;
    void supabase.from('addresses').select('id,label,city,neighborhood,is_default,street,contact_phone,building,landmark').eq('user_id', userId).order('is_default', { ascending: false }).order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        setAddressesDone(true);
        if (error) { setRequestMessage('ما قدرنا نحمّل عنوان التوصيل. العنوان المحفوظ ما تغيّر؛ جرّب تحدّث الصفحة.'); return; }
        addressesDirty.current = false; addressesFetchedAt.current = Date.now();
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
      const signedAvatar = await signedImageUrl('profile-avatars', avatarPath);
      if (active) setProfileAvatarUrl(signedAvatar);
    });
    return () => { active = false; };
  }, [userId]);
  const pickProfileAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.78, exif: false });
    if (result.canceled || !result.assets[0]) return;
    const picked = result.assets[0];
    // A profile photo is shown at most ~120 px wide: 512 px keeps it sharp at a fraction of the size.
    const shrunk = await shrinkPhoto(picked, 512, 0.8);
    const asset = shrunk ? { ...picked, uri: shrunk.uri, mimeType: shrunk.mimeType, fileSize: undefined } : picked;
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
    const localAvatarUri = profileAvatarDraft?.uri ?? null;
    setProfileName(data.display_name); setProfileNameDraft(data.display_name); setProfileAvatarPath(data.avatar_path); setProfileAvatarDraft(null);
    // Saved: return at once showing the photo already on the device; signing its link and deleting
    // the old file continue in the background instead of holding the screen.
    if (uploadedAvatarPath && localAvatarUri) setProfileAvatarUrl(localAvatarUri);
    setProfileBusy(false); setProfileMessage('تم حفظ تعديلات الحساب.'); goBack();
    if (uploadedAvatarPath && data.avatar_path) {
      const savedPath = data.avatar_path;
      void signedImageUrl('profile-avatars', savedPath).then((url) => { if (url) setProfileAvatarUrl(url); });
      if (previousAvatarPath && previousAvatarPath !== savedPath) void supabase.storage.from('profile-avatars').remove([previousAvatarPath]);
    }
  };
  const applyCustomerOrders = useCallback((rows: CustomerOrder[]) => {
    setOrders(rows);
    setOrdersAreStale(false);
    void saveCustomerOrdersSnapshot(userId, rows).then((snapshot) => { if (snapshot) setOrdersSyncedAt(snapshot.syncedAt); }).catch(() => {});
  }, [userId]);
  const lastFlagCheck = useRef(0);
  const fetchCustomerOrders = useCallback(async () => {
    if (!supabase || !online) return null;
    // A customer with an order that has waited 15+ minutes also triggers the server-side check (fallback when
    // pg_cron isn't available); at most once a minute.
    const { data, error } = await supabase.from('orders').select('id,is_urgent,status,request_text,delivery_fee_minor,delivery_quote_set_at,delivery_quote_approved_at,purchase_amount_minor,purchase_approved_at,created_at,driver_id,delivered_at,delivery_proof_path').order('created_at', { ascending: false }).limit(30);
    if (error) return null;
    const rows = data ?? [];
    const overdue = rows.some((order) => order.status === 'searching' && !!order.delivery_quote_set_at && Date.now() - Date.parse(order.delivery_quote_set_at) >= 15 * 60 * 1000);
    if (overdue && Date.now() - lastFlagCheck.current > 60 * 1000) { lastFlagCheck.current = Date.now(); void supabase.rpc('flag_unanswered_orders').then(() => undefined, () => undefined); }
    return rows;
  }, [online]);
  const ordersFetchedAt = useRef(0);
  const refreshOrdersRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let hasServerOrders = false;
    let cached: CustomerOrderSnapshot | null = null;
    const applyCached = (snapshot: CustomerOrderSnapshot) => {
      setOrders(snapshot.orders.map((order) => ({ ...order, request_text: '' })));
      setOrdersSyncedAt(snapshot.syncedAt);
      ordersLoaded.current = true;
      setOrdersLoading(false);
    };
    if (!ordersLoaded.current) setOrdersLoading(true);
    void loadCustomerOrdersSnapshot(userId).then((snapshot: CustomerOrderSnapshot | null) => {
      if (!active) return;
      cached = snapshot;
      if (!snapshot) { if (!online) { setOrdersAreStale(true); ordersLoaded.current = true; setOrdersLoading(false); } return; }
      // Online: wait for the server answer instead of painting the cached list first, which made
      // the page flash twice (cached rows with empty titles, then the real ones).
      if (hasServerOrders || online) return;
      setOrdersAreStale(true);
      applyCached(snapshot);
    });
    const refresh = async () => {
      const rows = await fetchCustomerOrders();
      if (active && rows) { hasServerOrders = true; ordersLoaded.current = true; ordersFetchedAt.current = Date.now(); applyCustomerOrders(rows); }
      else if (active) { setOrdersAreStale(true); if (cached && !hasServerOrders) applyCached(cached); }
      if (active && online) setOrdersLoading(false);
    };
    void refresh();
    if (!online || !supabase) return () => { active = false; };
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { refreshTimer = null; void refresh(); }, 400);
    };
    refreshOrdersRef.current = scheduleRefresh;
    const channel = supabase.channel(`customer-orders-${userId}`)
      // Only this customer's orders (every order event in the system used to trigger a reload).
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${userId}` }, scheduleRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, scheduleRefresh)
      .subscribe();
    const appStateSubscription = AppState.addEventListener('change', (state) => { if (state === 'active') scheduleRefresh(); });
    return () => { active = false; refreshOrdersRef.current = null; appStateSubscription.remove(); if (refreshTimer) clearTimeout(refreshTimer); void supabase?.removeChannel(channel); };
  }, [online, userId, fetchCustomerOrders, applyCustomerOrders]);
  // Changing tabs no longer reloads orders and re-opens the realtime connection; realtime keeps
  // the list current, and a tab switch only refreshes data older than 30 s.
  useEffect(() => { if ((tab === 'home' || tab === 'orders') && ordersFetchedAt.current && Date.now() - ordersFetchedAt.current > 30 * 1000) refreshOrdersRef.current?.(); }, [tab]);
  const activeCustomerOrders = orders.filter((order) => customerGroup(order.status) === 'live');
  const bannerLabels: Record<string, string> = { requested: 'عم نجهّز طلبك', quoted: 'عم نفتش على سائق لطلبك', searching: 'عم نفتش على سائق لطلبك', accepted: 'قبل السائق طلبك', assigned: 'قبل السائق طلبك', shopping: 'السائق عم يجهّز طلبك', awaiting_approval: 'السائق عم يجهّز طلبك', purchased: 'طلبك جاهز للتوصيل', delivering: '🛵 طلبك بالطريق لعندك', disputed: 'طلبك قيد مراجعة الدعم' };
  const submitOrder = async () => {
    if (!draftReady) { setRequestMessage('عم نسترجع مسودتك المحفوظة. جرّب بعد لحظة.'); return; }
    if (!online) { setRequestMessage('إرسال الطلب يحتاج اتصالاً. مسودتك محفوظة على هالجهاز.'); return; }
    if (!supabase) return;
    if (orderImages.some((image) => !image.uploaded && !image.uri)) { setRequestMessage('أعد اختيار الصور التي تحتاج رفعاً، ثم أرسل الطلب لإكماله.'); return; }
    if (!pendingOrderId && !addressReadyForOrder) { setRequestMessage('أضف عنوان تسليم بدمشق أو ريف دمشق حتى نكمل الطلب.'); return; }
    if (!pendingOrderId && (!addressId || !request.trim())) { setRequestMessage('اختار العنوان واكتب تفاصيل طلبك.'); return; }
    // Feedback first: the button switches to its busy state before any storage or network work.
    setSending(true); setRequestMessage('');
    await saveCustomerOrderDraft(userId, { schemaVersion: 1, savedAt: new Date().toISOString(), request, addressId, idempotencyKey: requestKey.current, pendingOrderId: pendingOrderId || undefined, images: orderImages.map(({ id, mimeType, extension, uploaded }) => ({ id, mimeType, extension, uploaded })) }).catch(() => setDraftSaveError(true));
    let orderId = pendingOrderId;
    if (!orderId) {
      const { data, error } = await supabase.rpc('create_customer_order', { p_idempotency_key: requestKey.current, p_address_id: addressId, p_request_text: composeRequest(pickup, request), ...(urgent ? { p_is_urgent: true } : {}) });
      if (error || !data) {
        setSending(false);
        setRequestMessage(error?.message.includes('Damascus and Rif Dimashq') ? 'التوصيل متاح حالياً بدمشق وريف دمشق فقط. عدّل عنوان التسليم.' : 'ما قدرنا نرسل الطلب. تأكد من العنوان والاتصال وحاول مرة ثانية.');
        return;
      }
      orderId = data;
      setPendingOrderId(orderId);
      await saveCustomerOrderDraft(userId, { schemaVersion: 1, savedAt: new Date().toISOString(), request, addressId, idempotencyKey: requestKey.current, pendingOrderId: orderId, images: orderImages.map(({ id, mimeType, extension, uploaded }) => ({ id, mimeType, extension, uploaded })) }).catch(() => setDraftSaveError(true));
    }
    let existingImageNames = new Set<string>();
    // Only a resumed order can already have uploaded photos; a brand-new one skips this round trip.
    const resumingOrder = !!pendingOrderId;
    if (orderImages.length && resumingOrder) {
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
          await saveCustomerOrderDraft(userId, { schemaVersion: 1, savedAt: new Date().toISOString(), request, addressId, idempotencyKey: requestKey.current, pendingOrderId: orderId, images: updatedImages.map(({ id, mimeType, extension, uploaded }) => ({ id, mimeType, extension, uploaded })) }).catch(() => setDraftSaveError(true));
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
        await saveCustomerOrderDraft(userId, { schemaVersion: 1, savedAt: new Date().toISOString(), request, addressId, idempotencyKey: requestKey.current, pendingOrderId: orderId, images: updatedImages.map(({ id, mimeType, extension, uploaded }) => ({ id, mimeType, extension, uploaded })) }).catch(() => setDraftSaveError(true));
      } catch {
        setSending(false);
        setRequestMessage('وصل طلبك، بس ما قدرنا نرفع كل الصور. اضغط إرسال الطلب مرة ثانية لنكمل الرفع بدون إنشاء طلب جديد.');
        return;
      }
    }
    setSending(false);
    await clearCustomerOrderDraft(userId);
    forgetOrderImages('order-images', orderId);
    refreshOrdersRef.current?.();
    requestKey.current = newRequestKey(); setRequest(''); setUrgent(false); setPickup(''); setOrderImages([]); setPendingOrderId(''); setRequestMessage('وصلنا طلبك! الإدارة رح تحدد أجرة التوصيل وتتابع إسناده لسائق.'); navigate('orders');
  };
  const pickOrderImages = async () => {
    if (sending) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 3 - orderImages.length, quality: 0.65, exif: false });
    if (result.canceled) return;
    const assets = await Promise.all(result.assets.map(async (picked) => {
      const shrunk = await shrinkPhoto(picked, 1600, 0.7);
      return shrunk ? { ...picked, uri: shrunk.uri, mimeType: shrunk.mimeType, fileSize: undefined } : picked;
    }));
    const accepted = assets.flatMap((asset) => {
      const mimeType = asset.mimeType?.toLowerCase() ?? 'image/jpeg';
      const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' } as Record<string, string>)[mimeType];
      return extension && (asset.fileSize === undefined || asset.fileSize <= 5 * 1024 * 1024) ? [{ id: newRequestKey(), uri: asset.uri, mimeType, extension, uploaded: false }] : [];
    });
    setOrderImages((current) => [...current, ...accepted].slice(0, 3));
    if (accepted.length < result.assets.length) setRequestMessage('الصور المدعومة: JPEG وPNG وWebP وHEIC، وبحجم أقصى 5 ميغابايت للصورة.');
    else if (accepted.length) setRequestMessage('انضافت الصور لطلبك. فيك تبدّلها أو تحذفها قبل الإرسال.');
  };
  const removeOrderImage = (imageId: string) => {
    setOrderImages((current) => current.filter((image) => image.id !== imageId));
    setRequestMessage('انحذفت الصورة من الطلب.');
  };
  const [cancelTarget, setCancelTarget] = useState<{ id: string; label: string } | null>(null);
  const cancelOrder = async (orderId: string, reason: string) => {
    if (!supabase) return;
    setOrderActionBusy(orderId); setOrderActionMessage('');
    const { error } = await supabase.rpc('cancel_customer_order', { p_order_id: orderId, p_reason: reason });
    setOrderActionBusy(''); setCancelTarget(null);
    if (error) { setOrderActionMessage('ما قدرنا نلغي الطلب بهالمرحلة. تواصل مع الدعم إذا بلش الشراء.'); return; }
    // Mark it cancelled right away; the list is re-read in the background.
    setOrders((current) => current.map((order) => order.id === orderId ? { ...order, status: 'cancelled' } : order));
    setOrderActionMessage('انلغى الطلب قبل إتمام الشراء.');
    void fetchCustomerOrders().then((rows) => { if (rows) applyCustomerOrders(rows); });
  };
  const hasAddress = !!addressId;
  const addressReadyForOrder = hasAddress;
  const accountInitial = (profileName.trim()[0] || email.trim()[0] || 'ح').toLocaleUpperCase('ar');
  const orderCounts = { all: orders.length, live: orders.filter((order) => customerGroup(order.status) === 'live').length, done: orders.filter((order) => customerGroup(order.status) === 'done').length };
  // The page used to be keyed by tab, so every tab tap destroyed and rebuilt the whole customer UI,
  // including the hidden notifications inbox (6 requests + push registration each time). It now
  // stays mounted and only scrolls back to the top.
  // Cards are heavy (status track, photos, driver, report form), so 10 render first and more on demand.
  const [ordersVisible, setOrdersVisible] = useState(10);
  // Finished and cancelled orders show as one compact row; tapping opens the full card (one at a time).
  const [openFinished, setOpenFinished] = useState<string | null>(null);
  // A manual refresh keeps the list on screen; only the refresh button dims while it runs.
  const [ordersRefreshing, setOrdersRefreshing] = useState(false);
  // After 15 minutes without a driver the order card changes its message (the server also sends a notification).
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 60 * 1000); return () => clearInterval(timer); }, []);
  const waitedLong = (order: { delivery_quote_set_at: string | null }) => !!order.delivery_quote_set_at && clock - Date.parse(order.delivery_quote_set_at) >= 15 * 60 * 1000;
  // Pull down on any customer screen to reload orders and notifications.
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const pullRefresh = async () => {
    if (pullRefreshing) return;
    if (!online && !(await recheckBackend())) { setOrderActionMessage('التحديث يحتاج اتصالاً بالإنترنت.'); return; }
    setPullRefreshing(true);
    setNotificationsRefreshKey((value) => value + 1);
    try { const rows = await fetchCustomerOrders(); if (rows) applyCustomerOrders(rows); } finally { setPullRefreshing(false); }
  };
  const bodyScrollRef = useRef<ScrollHandle>(null);
  useEffect(() => { bodyScrollRef.current?.scrollTo({ y: 0, animated: false }); }, [tab]);
  const displayedOrders = notificationOrderId ? [...orders].sort((left,right) => Number(right.id === notificationOrderId) - Number(left.id === notificationOrderId)) : orders;
  const filteredOrders = displayedOrders.filter((order) => orderFilter === 'all' || customerGroup(order.status) === orderFilter);
  // The home page opens only once its first data (draft, delivery address, orders) is in, so it paints
  // once instead of loading in pieces. It never returns to the skeleton after that.
  const homeReady = !homeSettled && ((draftReady && (addressesDone || !online) && !ordersLoading) || homeTimedOut);
  if (homeReady) setHomeSettled(true);
  return <SafeAreaView style={s.safe}>
    <View accessibilityRole="main" style={{flex:1}}>
      <View style={s.header}><View style={s.brand}><View style={s.brandMark}><Image source={require('../../assets/images/labbayk-delivery-logo.png')} style={s.brandLogo} contentFit="contain" accessibilityLabel="شعار لَبّيك"/></View><View><Text style={s.brandName}>لَبّيك</Text><Text style={s.brandTag}>اطلب، والباقي علينا.</Text></View></View><View style={s.headerActions}><Pressable onPress={() => navigate('profile')} style={s.accountAvatar} accessibilityRole="button" accessibilityLabel="فتح حسابي">{profileAvatarUrl ? <Image source={avatarSource(profileAvatarUrl, profileAvatarPath)} cachePolicy="memory-disk" style={s.avatarImage} contentFit="cover" accessibilityLabel="صورة الحساب"/> : <Text style={s.accountAvatarText}>{accountInitial}</Text>}</Pressable></View></View>
      <KeyboardScroll ref={bodyScrollRef} style={s.bodyScroll} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={() => void pullRefresh()} tintColor={c.primary} colors={[c.primary]} progressBackgroundColor={c.surface} />}>
      <StaggeredSections transitionKey={`${tab}-${tab === 'orders' && ordersLoading ? 'loading' : 'ready'}`}>
      {tab === 'addresses' ? <EntranceSection transitionKey={tab}><AddressBook userId={userId} onBack={goBack} backLabel={`العودة إلى ${tabHistory[tabHistory.length - 1] === 'profile' ? 'حسابي' : 'الرئيسية'}`} onAddressSaved={(address) => { addressIdRef.current = address.id; setAddressId(address.id); setAddressSummary(`${address.label} · ${address.neighborhood}`); setSelectedAddress(address); }} /></EntranceSection> : tab === 'home' && !homeSettled ? <CustomerHomeSkeleton /> : tab === 'home' ? <>
      {tab === 'home' && activeCustomerOrders.length > 0 && <Pressable onPress={() => { setOrderFilter('live'); navigate('orders'); }} accessibilityRole="button" accessibilityLabel={activeCustomerOrders.length === 1 ? `${bannerLabels[activeCustomerOrders[0].status] ?? 'طلبك جارٍ'}. تتبّع الطلب` : `لديك ${activeCustomerOrders.length} طلبات جارية. عرض`} style={{ backgroundColor: c.surface, borderColor: '#3F6A2E', borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 10, gap: 8, marginBottom: 10 }}>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 9 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: '#B7FF30', shadowColor: '#B7FF30', shadowOpacity: 0.6, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } }} />
          <Text style={{ flex: 1, color: c.text, fontSize: 14, fontWeight: '900', textAlign: 'right' }}>{activeCustomerOrders.length === 1 ? (bannerLabels[activeCustomerOrders[0].status] ?? 'طلبك جارٍ') : `لديك ${activeCustomerOrders.length} طلبات جارية`}</Text>
          <Text style={{ color: c.primary, fontSize: 12, fontWeight: '900' }}>{activeCustomerOrders.length === 1 ? 'تتبّع ‹' : 'عرض ‹'}</Text>
        </View>
        {activeCustomerOrders.length === 1 ? <View style={{ flexDirection: 'row-reverse', gap: 4 }}>{trackSteps.map((label, index) => { const current = trackIndex(activeCustomerOrders[0].status); return <View key={label} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: index <= current && current >= 0 ? '#B7FF30' : c.border, opacity: index === current ? 0.65 : 1 }} />; })}</View>
          : activeCustomerOrders.slice(0, 2).map((order) => <View key={order.id} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 8 }}><Text numberOfLines={1} style={{ flex: 1, color: c.muted, fontSize: 12.5, textAlign: 'right' }}>{splitPickup(order.request_text).body}</Text><Text style={{ color: c.text, fontSize: 12.5, fontWeight: '800' }}>{bannerLabels[order.status] ?? orderStatus[order.status] ?? order.status}</Text></View>)}
      </Pressable>}
      {selectedAddress && <Pressable style={s.address} onPress={() => navigate('addresses')} accessibilityRole="button" accessibilityLabel={`تغيير عنوان التوصيل: ${addressSummary}`} accessibilityHint="يفتح تفاصيل العنوان لتعديله"><View style={s.pin}><SymbolView name={{ios:'house.fill',android:'home',web:'home'}} tintColor={theme === 'light' ? '#385616' : c.primary} size={17}/></View><View style={s.addressCopy}><Text style={s.addressEyebrow}>عنوان التوصيل الحالي</Text><Text style={s.addressName} numberOfLines={1}>{addressSummary}</Text></View><View style={s.addressChangeButton}><SymbolView name={{ios:'pencil',android:'edit',web:'edit'}} tintColor="#0B1411" size={14}/><Text numberOfLines={1} style={s.addressChange}>تغيير</Text></View></Pressable>}
      <View style={[s.heroImageWrap, sending && { opacity: 0.45 }]}><Image source={require('../../assets/images/labbayk-hero.jpg')} style={s.heroImage} contentFit="cover" contentPosition={{ top: '12%' }} accessibilityLabel="لَبّيك لتلبية احتياجاتك اليومية. كل شي ناقصك، بطلب واحد. اطلب منتجاتك الآن واستلمها بسرعة وأمان."/></View>
      <View pointerEvents={sending ? 'none' : 'auto'} style={[s.formCard, sending && { opacity: 0.45 }]}><View style={s.formHeader}><View style={{ width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(183,255,48,0.1)', borderWidth: 1, borderColor: 'rgba(183,255,48,0.28)' }}><SymbolView name={{ ios: 'bag', android: 'shopping_bag', web: 'shopping_bag' }} tintColor="#B7FF30" size={15}/></View><View style={s.formHeaderCopy}><Text style={s.formTitle}>شو بدك نجيبلك؟</Text></View></View>{draftSaveError ? <Text style={s.formMessage}>تعذّر حفظ المسودة على هذا الجهاز.</Text> : null}
        <View style={s.formSection}><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}><Text style={s.label}>تفاصيل الطلب</Text><UrgentChip on={urgent} disabled={!!pendingOrderId || sending} onPress={() => setUrgent((value) => !value)} /></View><TextInput editable={draftReady && !pendingOrderId} value={request} onChangeText={(value) => { draftDirty.current = true; setRequest(value); }} maxLength={4000} multiline textAlignVertical="top" placeholder="مثال: ربطة خبز، كيلو بندورة، وعلبة حليب." placeholderTextColor="#809087" onFocus={() => setFocusedField('request')} onBlur={() => setFocusedField((current) => current === 'request' ? null : current)} style={[s.input,s.orderRequestInput,fieldBorder('request', request.trim().length > 0),urgent&&{borderColor:'#F5A623'}]} accessibilityLabel="اكتب تفاصيل طلبك" /></View>
        <View style={s.formSection}><TextInput editable={draftReady && !pendingOrderId} value={pickup} onChangeText={(value) => setPickup(value.slice(0, 120))} maxLength={120} placeholder="عندك محلّ مفضّل نشتري منه؟ (اختياري)" placeholderTextColor="#809087" onFocus={() => setFocusedField('pickup')} onBlur={() => setFocusedField((current) => current === 'pickup' ? null : current)} style={[s.input, { minHeight: 54, paddingVertical: 0, borderRadius: 16, textAlign: 'right', writingDirection: 'rtl' }, fieldBorder('pickup', pickup.trim().length > 0)]} accessibilityLabel="مكان الشراء"/></View>
        <View style={s.photoSection}><View style={s.photoHead}><Text style={s.label}>صور تساعدنا نفهم طلبك</Text><Text style={s.photoCount}>{orderImages.length}/3</Text></View>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
            {orderImages.map((image, index) => <View key={image.id} style={{ width: 62, height: 62, borderRadius: 14, borderWidth: 1, borderColor: '#405449', backgroundColor: '#15231a', padding: 3 }}>
              {image.uri ? <Image source={{ uri: image.uri }} cachePolicy="none" style={{ width: '100%', height: '100%', borderRadius: 11 }} contentFit="cover" accessibilityLabel={`صورة ${index + 1} من الطلب`}/> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.muted, fontSize: 10, textAlign: 'center' }}>{image.uploaded ? 'مرفقة' : 'أعد الاختيار'}</Text></View>}
              {image.uploaded ? <View style={{ position: 'absolute', bottom: 5, right: 5, width: 16, height: 16, borderRadius: 8, backgroundColor: '#52D5A0', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#06210F', fontSize: 10, fontWeight: '900' }}>✓</Text></View> : null}
              {!(sending || !!pendingOrderId) ? <Pressable onPress={() => removeOrderImage(image.id)} style={{ position: 'absolute', top: 4, left: 4, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11,20,17,0.8)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }} hitSlop={6} accessibilityRole="button" accessibilityLabel={`حذف الصورة ${index + 1}`}><Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '900' }}>✕</Text></Pressable> : null}
            </View>)}
            {orderImages.length > 0 && orderImages.length < 3 ? <Pressable onPress={() => void pickOrderImages()} disabled={sending} style={{ width: 62, height: 62, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#5F7A3E', alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel="إضافة صورة"><Text style={{ color: '#B7FF30', fontSize: 26, fontWeight: '400' }}>＋</Text></Pressable> : null}
          </View>
          {orderImages.length === 0 && <Pressable onPress={() => void pickOrderImages()} disabled={sending} style={{ minHeight: 52, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#5F7A3E', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 }} accessibilityRole="button" accessibilityLabel="إضافة صورة"><View style={s.addImageIcon}><Text style={s.attachmentIcon}>＋</Text></View><Text style={s.addImageTitle}>إضافة صورة</Text></Pressable>}
        </View>
      </View>
      <View style={[s.note, sending && { opacity: 0.45 }]}><Text style={s.noteIcon}>ⓘ</Text><Text style={s.noteText}>بعد إرسال الطلب، الإدارة بتحدد أجرة التوصيل وبتعيّن سائق أو بتبعته للسائقين المتاحين. الدفع كاش عند الاستلام.</Text></View>
      <Pressable disabled={sending || !draftReady || !online} onPress={() => { if (!hasAddress) { navigate('addresses'); return; } void submitOrder(); }} style={[s.submit, (sending || !draftReady || !online)&&s.disabled]} accessibilityRole="button">{sending ? <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 10 }}><Text style={s.submitText}>جاري إرسال طلبك</Text><ActivityIndicator color="#0B1411" /></View> : <Text style={s.submitText}>{!hasAddress?'إضافة عنوان تسليم':!online?'بانتظار الاتصال':pendingOrderId?'إكمال رفع الصور وإرسال الطلب':'إرسال الطلب'}</Text>}</Pressable>
      </> : tab === 'orders' ? <View style={s.orderPage}><StaggeredSections transitionKey={`${tab}-orders`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 2 }}>
          <View><Text style={s.accountPageTitle}>طلباتي</Text></View>
          <Pressable onPress={async () => { if (ordersLoading || ordersRefreshing) return; if (!online && !(await recheckBackend())) { setOrderActionMessage('التحديث يحتاج اتصالاً بالإنترنت.'); return; } setNotificationsRefreshKey((value) => value + 1); setOrdersRefreshing(true); void fetchCustomerOrders().then((rows) => { if (rows) { applyCustomerOrders(rows); setOrderActionMessage('تم تحديث الطلبات.'); } else setOrderActionMessage('ما قدرنا نحدّث الطلبات. جرّب مرة ثانية.'); }).finally(() => setOrdersRefreshing(false)); }} accessibilityRole="button" accessibilityLabel="تحديث الطلبات والتنبيهات" accessibilityState={{ busy: ordersRefreshing }} style={[s.ordersRefreshButton, ordersRefreshing && { opacity: 0.5 }]}>
            <SymbolView name={{ios:'arrow.clockwise',android:'refresh',web:'refresh'}} tintColor={c.primary} size={19}/>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 4, marginVertical: 10, padding: 4, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.raised }}>
          {([['all', 'الكل'], ['live', 'جارية'], ['done', 'مسلّمة']] as const).map(([key, label]) => { const on = orderFilter === key; return <Pressable key={key} onPress={() => { setOrderFilter(key); setOrdersVisible(10); }} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ flex: 1, minWidth: 0, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 5, borderRadius: 14, backgroundColor: on ? '#B7FF30' : 'transparent' }}><Text numberOfLines={1} style={{ color: on ? '#0B1411' : c.muted, fontSize: 12.5, fontWeight: '800' }}>{label}</Text><View style={{ minWidth: 22, height: 22, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: on ? 'rgba(11,20,17,0.12)' : c.surface }}><Text style={{ color: on ? '#0B1411' : c.muted, fontSize: 10.5, fontWeight: '900' }}>{orderCounts[key]}</Text></View></Pressable>; })}
        </View>
        {ordersAreStale && <View style={s.offlineOrders}>
          <Text style={s.offlineOrdersTitle}>{ordersSyncedAt ? 'بيانات محفوظة وقديمة للعرض فقط' : 'ما في نسخة محفوظة من طلباتك'}</Text>
          <Text style={s.offlineOrdersCopy}>{ordersSyncedAt ? 'آخر مزامنة ' + shortDateTimeFormatter.format(new Date(ordersSyncedAt)) + ' · الموافقات والإلغاء تحتاج اتصال.' : 'اتصل بالإنترنت حتى نحمّل أحدث حالة لطلباتك.'}</Text>
          {online && <Pressable onPress={() => { void fetchCustomerOrders().then((rows) => rows && applyCustomerOrders(rows)); }} accessibilityRole="button" style={s.retryOrdersButton}>
            <Text style={s.retryOrdersText}>تحديث الطلبات ↻</Text>
          </Pressable>}
        </View>}
        {!ordersLoading && orders.length > 0 && filteredOrders.length === 0 && <View style={s.empty}>
          <Text style={s.emptyMark}>≋</Text>
          <Text style={s.emptyTitle}>{orderFilter === 'live' ? 'ما عندك طلبات جارية حالياً' : 'ما عندك طلبات مسلّمة لحد الآن'}</Text>
          <Text style={s.emptyCopy}>اختَر فلتر ثاني أو اعرض كل طلباتك.</Text>
          <Pressable onPress={() => setOrderFilter('all')} style={s.profileAction} accessibilityRole="button"><Text style={s.profileActionText}>عرض كل الطلبات</Text></Pressable>
        </View>}
        <CancelReasonSheet target={cancelTarget} busy={!!orderActionBusy} onClose={() => setCancelTarget(null)} onConfirm={(reason) => cancelTarget && void cancelOrder(cancelTarget.id, reason)} />
        {ordersLoading ? <OrdersSkeleton styles={s} /> : orders.length ? filteredOrders.slice(0, ordersVisible).map((order) => { const group = customerGroup(order.status); const done = group === 'done'; const cancelled = group === 'cancelled'; const hasDriver = !!order.driver_id && !cancelled && !['searching', 'requested', 'quoted'].includes(order.status);
          const finished = group !== 'live';
          const expanded = !finished || openFinished === order.id || order.id === notificationOrderId;
          if (!expanded) {
            const title = splitPickup(order.request_text).body;
            const when = shortDateTimeFormatter.format(new Date(order.delivered_at ?? order.created_at));
            const total = (order.purchase_amount_minor ?? 0) + order.delivery_fee_minor;
            return <Pressable key={order.id} onPress={() => setOpenFinished(order.id)} accessibilityRole="button" accessibilityState={{ expanded: false }} accessibilityLabel={`${cancelled ? 'طلب ملغي' : 'طلب منتهي'}: ${title}. اضغط لعرض التفاصيل`} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 60, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, marginBottom: 9 }}>
              <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: cancelled ? 'rgba(255,138,138,0.16)' : 'rgba(82,213,160,0.16)' }}><Text style={{ color: cancelled ? '#FF8A8A' : c.accent, fontSize: 16, fontWeight: '900' }}>{cancelled ? '✕' : '✓'}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: c.text, fontSize: 14.5, fontWeight: '800', textAlign: 'right' }}>{title}</Text><Text numberOfLines={1} style={{ color: c.muted, fontSize: 12, textAlign: 'right' }}>{when}</Text></View>
              {cancelled ? <View style={{ backgroundColor: '#451E21', borderRadius: 11, paddingHorizontal: 10, minHeight: 26, justifyContent: 'center' }}><Text style={{ color: '#FF8A8A', fontSize: 12, fontWeight: '900' }}>ملغي</Text></View> : <Text style={{ color: c.text, fontSize: 14, fontWeight: '900' }}>{numberFormatter.format(total)}</Text>}
              <View style={{ minHeight: 30, paddingHorizontal: 11, borderRadius: 15, borderWidth: 1, borderColor: '#3D5A45', backgroundColor: '#1F2E24', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#B7FF30', fontSize: 12, fontWeight: '800' }}>التفاصيل</Text></View>
            </Pressable>;
          }
          return <View key={order.id} style={{ backgroundColor: c.surface, borderColor: order.id === notificationOrderId ? '#B7FF30' : order.is_urgent && group === 'live' ? '#F5A623' : group === 'live' ? '#3F6A2E' : c.border, borderWidth: order.id === notificationOrderId || (order.is_urgent && group === 'live') ? 2 : 1, borderRadius: 22, padding: 14, gap: 11, marginBottom: 11 }}>
          {order.id === notificationOrderId && <Text style={s.notificationOrderLabel}>الطلب المرتبط بهذا الإشعار</Text>}
          {!finished && order.is_urgent ? <UrgentStrip /> : null}
          {finished && <Pressable disabled={openFinished !== order.id} onPress={() => setOpenFinished(null)} accessibilityRole="button" accessibilityLabel="طيّ التفاصيل" style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: cancelled ? 'rgba(255,138,138,0.16)' : 'rgba(82,213,160,0.16)' }}><Text style={{ color: cancelled ? '#FF8A8A' : c.accent, fontSize: 16, fontWeight: '900' }}>{cancelled ? '✕' : '✓'}</Text></View>
            <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={2} style={{ color: c.text, fontSize: 14.5, fontWeight: '800', textAlign: 'right' }}>{splitPickup(order.request_text).body}</Text><Text numberOfLines={1} style={{ color: c.muted, fontSize: 12, textAlign: 'right' }}>{shortDateTimeFormatter.format(new Date(order.delivered_at ?? order.created_at))} · #{order.id.slice(0, 6)}</Text></View>
            {cancelled ? <View style={{ backgroundColor: '#451E21', borderRadius: 11, paddingHorizontal: 10, minHeight: 26, justifyContent: 'center' }}><Text style={{ color: '#FF8A8A', fontSize: 12, fontWeight: '900' }}>ملغي</Text></View> : <Text style={{ color: c.text, fontSize: 14, fontWeight: '900' }}>{numberFormatter.format((order.purchase_amount_minor ?? 0) + order.delivery_fee_minor)}</Text>}
            {openFinished === order.id ? <View style={{ minHeight: 30, paddingHorizontal: 11, borderRadius: 15, borderWidth: 1, borderColor: '#3D5A45', backgroundColor: '#1F2E24', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#B7FF30', fontSize: 12, fontWeight: '800' }}>إخفاء</Text></View> : null}
          </Pressable>}
          {!finished && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: cancelled ? '#451E21' : done ? c.raised : '#26391C', borderRadius: 12, paddingHorizontal: 11, minHeight: 28 }}><Text style={{ color: cancelled ? '#FF8A8A' : done ? c.accent : '#B7FF30', fontSize: 12.5, fontWeight: '900' }}>{done ? '✅ ' : ''}{orderStatus[order.status] ?? order.status}</Text></View>
            <Text style={{ color: c.muted, fontSize: 11.5 }}>{shortDateTimeFormatter.format(new Date(order.created_at))} · #{order.id.slice(0, 6)}</Text>
          </View>}
          {!finished && <View style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
            {!ordersAreStale && <AdminOrderThumb orderId={order.id} />}
            <View style={{ flex: 1 }}><Text numberOfLines={3} style={{ color: c.text, fontSize: 15, fontWeight: '800', lineHeight: 23, textAlign: 'right' }}>{ordersAreStale ? 'تفاصيل الطلب تظهر عند رجوع الاتصال.' : splitPickup(order.request_text).body}</Text></View>
          </View>}
          {!cancelled && <OrderTrack status={order.status} />}
          {order.status === 'searching' && <View style={{ backgroundColor: waitedLong(order) ? 'rgba(240,204,131,0.12)' : c.raised, borderColor: waitedLong(order) ? '#C98A2B' : c.border, borderWidth: 1, borderRadius: 14, padding: 11, gap: 3 }}>
            <Text style={{ color: waitedLong(order) ? '#F0CC83' : c.text, fontSize: 13.5, fontWeight: '900', textAlign: 'right' }}>{waitedLong(order) ? 'لسا ما لقينا سائق' : 'عم ندور على سائق لطلبك'}</Text>
            <Text style={{ color: c.muted, fontSize: 12.5, lineHeight: 20, textAlign: 'right' }}>{waitedLong(order) ? 'مرّ وقت وما لقينا سائق متاح. فيك تنتظر شوي أو تلغي الطلب، وفريقنا عم يتابعه.' : 'فيك تنتظر أو تلغي الطلب بأي وقت. رح يوصلك إشعار أول ما يقبله سائق.'}</Text>
          </View>}
          {hasDriver && !ordersAreStale && <CustomerDriverRow orderId={order.id} status={order.status} />}
          {done && !ordersAreStale ? <View style={{ backgroundColor: c.raised, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4 }}>
            {([['وقت التوصيل', order.delivered_at ? `${notificationTimeFormatter.format(new Date(order.delivered_at))}${(order.delivered_at ? Math.max(1, Math.round((Date.parse(order.delivered_at) - Date.parse(order.created_at)) / 60000)) : null) ? ` · خلال ${(order.delivered_at ? Math.max(1, Math.round((Date.parse(order.delivered_at) - Date.parse(order.created_at)) / 60000)) : null)} دقيقة` : ''}` : '—', false], ['مبلغ المشتريات', numberFormatter.format(order.purchase_amount_minor ?? 0), false], ['أجرة التوصيل', numberFormatter.format(order.delivery_fee_minor), false], ['المجموع', numberFormatter.format((order.purchase_amount_minor ?? 0) + order.delivery_fee_minor) + ' ل.س', true]] as const).map(([label, value, strong], index) => <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: index ? 1 : 0, borderTopColor: c.border }}><Text style={{ color: strong ? c.text : c.muted, fontSize: 13, fontWeight: strong ? '900' : '500' }}>{label}</Text><Text style={{ color: c.text, fontSize: 13, fontWeight: strong ? '900' : '800' }}>{value}</Text></View>)}
          </View> : 
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, backgroundColor: c.raised, borderColor: c.border, borderWidth: 1, borderRadius: 14, paddingVertical: 7, paddingHorizontal: 11 }}><Text style={{ color: c.muted, fontSize: 11.5, textAlign: 'right' }}>أجرة التوصيل</Text><Text style={{ color: c.text, fontSize: 14, fontWeight: '900', textAlign: 'right' }}>{ordersAreStale ? '—' : order.delivery_quote_set_at ? numberFormatter.format(order.delivery_fee_minor) + ' ل.س' : 'قيد التحديد'}</Text></View>
            {order.purchase_amount_minor !== null ? <View style={{ flex: 1, backgroundColor: c.raised, borderColor: c.border, borderWidth: 1, borderRadius: 14, paddingVertical: 7, paddingHorizontal: 11 }}><Text style={{ color: c.muted, fontSize: 11.5, textAlign: 'right' }}>مبلغ المشتريات</Text><Text style={{ color: c.text, fontSize: 14, fontWeight: '900', textAlign: 'right' }}>{ordersAreStale ? '—' : numberFormatter.format(order.purchase_amount_minor ?? 0) + ' ل.س'}</Text></View> : null}
          </View>}
          {done && !ordersAreStale && <View style={{ borderColor: c.accent, borderWidth: 1, borderRadius: 16, padding: 9, gap: 7 }}><Text style={{ color: c.accent, fontSize: 13.5, fontWeight: '900', textAlign: 'right' }}>صورة التسليم{order.delivered_at ? ' · ' + shortDateTimeFormatter.format(new Date(order.delivered_at)) : ''}</Text><AdminImageStrip orderId={order.id} bucket="delivery-proofs" proofPath={order.delivery_proof_path} size={84} emptyText="ما في صورة تسليم لهذا الطلب." /></View>}
          {(['requested','quoted','searching','accepted','assigned','awaiting_approval'].includes(order.status) || (order.status === 'shopping' && order.purchase_amount_minor === null)) && <Pressable disabled={orderActionBusy === order.id || !online || ordersAreStale} onPress={() => setCancelTarget({ id: order.id, label: `طلب #${order.id.slice(0, 6)} · ${splitPickup(order.request_text).body}` })} style={[s.cancelOrder, (orderActionBusy === order.id || !online || ordersAreStale) && s.disabled]} accessibilityRole="button"><Text style={s.cancelOrderText}>{orderActionBusy === order.id ? 'عم نلغي الطلب…' : 'إلغاء الطلب'}</Text></Pressable>}
          <SupportIssueForm orderId={order.id} status={order.status} disabled={ordersAreStale} userId={userId}/>
        </View>; }) : <View style={s.empty}>
          <Text style={s.emptyMark}>≋</Text>
          <Text style={s.emptyTitle}>{ordersAreStale ? 'ما في طلبات محفوظة للعرض' : 'ما عندك طلبات حالياً'}</Text>
          <Text style={s.emptyCopy}>{ordersAreStale ? 'اتصل بالإنترنت حتى نحمّل أحدث حالة.' : 'أول طلب إلك رح يظهر هون.'}</Text>
          <Pressable onPress={() => navigate('home')} style={s.profileAction} accessibilityRole="button"><Text style={s.profileActionText}>ابدأ طلب جديد <Text style={s.submitArrow}>←</Text></Text></Pressable>
        </View>}
        {!ordersLoading && filteredOrders.length > ordersVisible ? <Pressable onPress={() => setOrdersVisible((count) => count + 10)} accessibilityRole="button" style={s.retryOrdersButton}><Text style={s.retryOrdersText}>عرض المزيد ({filteredOrders.length - ordersVisible})</Text></Pressable> : null}
      </StaggeredSections></View> : tab === 'notifications' ? <View style={s.profilePage}><View style={s.accountIntro}><Text style={s.accountPageTitle}>التنبيهات</Text></View></View> : tab === 'profile-edit' ? <View style={s.profilePage}><StaggeredSections transitionKey={`${tab}-edit`}>
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:8}}><Text style={[s.pageTitle,{flex:1}]}>تعديل الملف الشخصي</Text><Pressable onPress={() => navigate('profile')} style={[s.backNavigation,{alignSelf:'auto',marginBottom:0,marginLeft:12}]} accessibilityRole="button" accessibilityLabel="العودة إلى حسابي"><Text style={s.backNavigationText}>رجوع</Text></Pressable></View>
        <View style={s.profileCard}>
          <View style={s.profileEditPhotoWrap}>
            {profileAvatarDraft ? <Image source={{ uri: profileAvatarDraft.uri }} cachePolicy="none" style={s.profileEditPhoto} contentFit="cover" accessibilityLabel="معاينة الصورة الجديدة"/> : profileAvatarUrl ? <Image source={avatarSource(profileAvatarUrl, profileAvatarPath)} cachePolicy="memory-disk" style={s.profileEditPhoto} contentFit="cover" accessibilityLabel="صورة الحساب"/> : <Text style={s.profileEditInitial}>{accountInitial}</Text>}
          </View>
          <Pressable onPress={() => void pickProfileAvatar()} disabled={profileBusy} style={[s.profilePhotoButton, profileBusy && s.disabled]} accessibilityRole="button"><Text style={s.profilePhotoButtonText}>{profileAvatarDraft || profileAvatarPath ? 'تغيير الصورة' : 'اختيار صورة'}</Text></Pressable>
          {showDriverFlow&&<View style={s.accountRoleTag}><Text style={s.accountRoleTagText}>متقدم لمساحة السائق</Text></View>}
          <Text style={s.label}>البريد الإلكتروني</Text>
          <View style={s.readOnlyEmail}><Text selectable style={s.readOnlyEmailText}>{email}</Text><Text style={s.readOnlyEmailHint}>بريد تسجيل الدخول · غير قابل للتعديل</Text></View>
          <Text style={s.label}>اسم صاحب الحساب</Text>
          <TextInput value={profileNameDraft} onChangeText={setProfileNameDraft} maxLength={120} placeholder="اكتب اسمك" placeholderTextColor="#839188" textAlign="right" style={s.field} accessibilityLabel="اسم صاحب الحساب"/>
          <Pressable disabled={profileBusy} onPress={() => void saveProfile()} style={[s.saveAddress, profileBusy && s.disabled]} accessibilityRole="button"><Text style={s.saveAddressText}>{profileBusy ? 'عم نحفظ…' : 'حفظ التعديلات'}</Text></Pressable>
        </View>
      </StaggeredSections></View> : <View style={s.profilePage}><StaggeredSections transitionKey={`${tab}-profile`}>
        <View style={s.accountIntro}><Text style={s.accountPageTitle}>حسابي</Text></View>
        <View style={s.profileSectionCard}>
          <View style={s.profileSectionHeading}><Text style={s.profileSectionTitle}>الملف الشخصي</Text></View>
          <View style={s.profileIdentityRow}>
            <View style={s.customerIdentityAvatar}>{profileAvatarUrl ? <Image source={avatarSource(profileAvatarUrl, profileAvatarPath)} cachePolicy="memory-disk" style={s.avatarImage} contentFit="cover" accessibilityLabel="صورة الحساب"/> : <Text style={s.accountAvatarLargeText}>{accountInitial}</Text>}</View>
            <View style={s.profileIdentityCopy}>{showDriverFlow&&<View style={s.accountRoleTag}><Text style={s.accountRoleTagText}>متقدم لمساحة السائق</Text></View>}<Text style={s.profileIdentityName} numberOfLines={2}>{profileName || 'حساب لَبّيك'}</Text><Text style={s.profileEmail} numberOfLines={1}>{email}</Text></View>
          </View>
          <Pressable onPress={() => { setProfileNameDraft(profileName); setProfileAvatarDraft(null); navigate('profile-edit'); }} style={[s.profileSectionAction,s.profileSectionActionPrimary]} accessibilityRole="button"><Text style={[s.profileSectionActionText,s.profileSectionActionTextPrimary]}>تعديل الملف الشخصي</Text><SymbolView name={{ ios: 'pencil', android: 'edit', web: 'edit' }} tintColor={theme === 'light' ? '#17210F' : c.background} size={17}/></Pressable>
        </View>
        <View style={s.profileSectionCard}>
          <View style={s.profileSectionHeading}><View style={s.profileHeadingIcon}><SymbolView name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }} tintColor={c.primary} size={21}/></View><Text style={s.profileSectionTitle}>عنوان التوصيل</Text></View>
          {selectedAddress ? <View style={s.profileAddressSummary}><Text style={s.profileAddressName}>{selectedAddress.label}</Text><Text style={s.profileAddressLine}>{selectedAddress.neighborhood}، {selectedAddress.city}</Text><Text style={s.profileAddressLine}>{selectedAddress.street}{selectedAddress.building ? '، بناء ' + selectedAddress.building : ''}</Text><View style={{marginTop:8,paddingTop:8,borderTopWidth:1,borderTopColor:c.border}}><Text style={s.profileAddressLine}>رقم التواصل</Text><Text style={[s.profileAddressPhone,{marginTop:3,fontSize:14,writingDirection:'ltr',textAlign:'left'}]}>{ltrPhone(selectedAddress.contact_phone)}</Text></View></View> : <View style={s.profileAddressEmpty}><Text style={s.profileAddressEmptyTitle}>ما أضفت عنوان توصيل بعد</Text><Text style={s.profileAddressLine}>أضف عنوانك حتى يصير إرسال الطلب أسرع.</Text></View>}
          <Pressable onPress={() => navigate('addresses')} style={[s.profileSectionAction, s.profileSectionActionPrimary]} accessibilityRole="button"><Text style={[s.profileSectionActionText, s.profileSectionActionTextPrimary]}>{selectedAddress ? 'تعديل العنوان' : 'إضافة عنوان توصيل'}</Text><SymbolView name={{ ios: 'pencil', android: 'edit', web: 'edit' }} tintColor={theme === 'light' ? '#17210F' : c.background} size={17}/></Pressable>
        </View>
        <View style={s.profileSectionCard}><View style={s.profileSectionHeading}><View style={s.profileHeadingIcon}><SymbolView name={{ios:'circle.lefthalf.filled',android:'contrast',web:'contrast'}} tintColor={c.primary} size={21}/></View><Text style={s.profileSectionTitle}>المظهر</Text></View><Pressable onPress={onToggleTheme} accessibilityRole="switch" accessibilityState={{checked:theme==='dark'}} accessibilityLabel={theme === 'dark' ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'} style={{minHeight:58,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:8}}><View style={s.profileThemeCopy}><Text style={s.profileThemeTitle}>الوضع {theme === 'dark' ? 'الداكن' : 'الفاتح'}</Text><Text style={s.profileThemeHint}>التبديل إلى الوضع {theme === 'dark' ? 'الفاتح' : 'الداكن'}</Text></View><View style={{width:52,height:30,borderRadius:15,backgroundColor:theme==='dark'?'#779C38':c.border,justifyContent:'center'}}><View style={{position:'absolute',left:theme==='dark'?25:3,top:3,width:24,height:24,borderRadius:12,backgroundColor:'#F5F5F5'}}/></View></Pressable></View>
        <PushStatusCard userId={userId} />
        <LegalLinksSection theme={theme}/>
        <Pressable onPress={onSignOut} style={[s.profileLogout,{marginTop:64,borderColor:c.border}]} accessibilityRole="button"><SymbolView name={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' }} tintColor={c.muted} size={19}/><Text style={[s.profileLogoutText,{color:c.muted}]}>تسجيل الخروج</Text></Pressable>
        {showDriverFlow && <DriverApplicationFlow key={inviteToken ?? 'driver-application'} userId={userId} initialToken={inviteToken} knownStatus={driverStatus}/>}
      </StaggeredSections></View>}
      </StaggeredSections>
      <View style={tab === 'notifications' ? undefined : s.hidden}>
        <NotificationInbox userId={userId} refreshKey={notificationsRefreshKey} standalone={tab === 'notifications'} active={tab === 'notifications'} onUnreadCountChange={setNotificationCount} onOpenOrder={(orderId) => { setNotificationOrderId(orderId); navigate('orders'); }}/>
      </View>
      </KeyboardScroll>
      <View style={s.footer}>
        {[{ key: 'home', label: 'الرئيسية', symbol: 'house.fill' }, { key: 'orders', label: 'طلباتي', symbol: 'list.bullet.rectangle' }, { key: 'notifications', label: 'التنبيهات', symbol: 'bell.fill' }, { key: 'profile', label: 'حسابي', symbol: 'person.crop.circle.fill' }].map(({ key, label, symbol }) => {
          const materialSymbol = (key === 'home' ? 'home' : key === 'orders' ? 'receipt_long' : key === 'notifications' ? 'notifications' : 'person') as AndroidSymbol;
          const selected = tab === key || ((tab === 'addresses' || tab === 'profile-edit') && key === 'profile');
          return <Pressable key={key} accessibilityRole="button" accessibilityLabel={key === 'notifications' && notificationCount > 0 ? `${label}، ${notificationCount} غير مقروء` : label} accessibilityState={{ selected }} onPress={() => navigate(key)} style={[s.footerButton, selected && s.footerButtonActive]}>
            <View style={s.footerIconWrap}><Animated.View style={[s.footerIcon, { transform: [{ scale: activeTabAnimation === key ? tabScale : 1 }] }]}><SymbolView name={{ ios: symbol as SFSymbol, android: materialSymbol, web: materialSymbol }} tintColor={selected ? (theme === 'light' ? '#17210F' : c.background) : c.muted} size={21}/></Animated.View>{key === 'notifications' && notificationCount > 0 ? <View style={s.navigationNotificationBadge}><Text style={s.navigationNotificationBadgeText}>{notificationCount > 99 ? '99+' : notificationCount}</Text></View> : null}{key === 'orders' && activeCustomerOrders.length > 0 ? <View style={[s.navigationNotificationBadge, { backgroundColor: '#B7FF30', borderColor: theme === 'light' ? '#FFFFFF' : '#0B1411' }]}><Text style={[s.navigationNotificationBadgeText, { color: '#0B1411' }]}>{activeCustomerOrders.length}</Text></View> : null}</View>
            <Text style={[s.footerItem, selected && s.footerActive]}>{label}</Text>
          </Pressable>;
        })}
      </View>
    </View>
  </SafeAreaView>;
}

function useInternetAvailable() {
  const network = useNetworkState();
  const [backendHealth, setBackendHealth] = useState<BackendHealth>(getBackendHealth);
  useEffect(() => subscribeBackendHealth(setBackendHealth), []);
  // While the network state is still resolving (undefined) assume online so pages don't flash an offline warning.
  // A successful Supabase response is stronger evidence than Android's occasionally stale reachability flag.
  return (network.isConnected !== false && network.isInternetReachable !== false)
    || backendHealth === 'reachable'
    || backendHealth === 'degraded';
}

function OrderImageGallery({ orderId, bucket = 'order-images', label = 'صور الطلب', defaultOpen = false }: { orderId: string; bucket?: 'order-images' | 'delivery-proofs'; label?: string; defaultOpen?: boolean }) {
  const { colors: tc, styles: s } = useMobileTheme();
  const online = useInternetAvailable();
  const [expanded, setExpanded] = useState(defaultOpen);
  const [selected, setSelected] = useState<CachedImage | null>(null);
  const images = useOrderImages(bucket, orderId, expanded);
  const loading = expanded && images === null && online;
  const urls = images ?? [];
  return <View style={s.orderGallery}>
    <Pressable onPress={() => setExpanded((current) => !current)} accessibilityRole="button" accessibilityState={{ expanded }} style={{ minHeight: 46, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, borderRadius: 15, borderWidth: 1.5, borderColor: tc.border, backgroundColor: tc.surface }}>
      <Text style={{ color: tc.text, fontSize: 13.5, fontWeight: '800' }}>📷 {label}</Text><Text style={{ color: tc.primary, fontSize: 12.5, fontWeight: '900' }}>{expanded ? 'إخفاء ⌃' : 'عرض ⌄'}</Text>
    </Pressable>
    {expanded && (loading ? <ActivityIndicator color={c.primary}/> : urls.length ? <View style={s.uploadedPhotoList}>{urls.map((image) => <Pressable key={image.key} onPress={() => setSelected(image)} accessibilityRole="button" accessibilityLabel="فتح صورة الطلب"><Image source={{ uri: image.url, cacheKey: image.key }} cachePolicy="memory-disk" transition={120} style={s.orderGalleryImage} contentFit="cover" accessibilityLabel="صورة من الطلب"/></Pressable>)}</View> : <Text style={s.orderGalleryTitle}>{online ? 'ما في صور مرفقة بهالطلب.' : 'الاتصال مطلوب لعرض الصور.'}</Text>)}
    <Modal visible={selected !== null} transparent animationType="fade" onRequestClose={() => setSelected(null)}><Pressable onPress={() => setSelected(null)} style={{flex:1,alignItems:'center',justifyContent:'center',padding:18,backgroundColor:'rgba(0,0,0,0.94)'}}><Text style={{position:'absolute',top:54,right:20,color:'#fff',fontSize:16,fontWeight:'800'}}>إغلاق ✕</Text>{selected?<Image source={{uri:selected.url,cacheKey:selected.key}} cachePolicy="memory-disk" style={{width:'100%',height:'82%'}} contentFit="contain" accessibilityLabel="صورة الطلب بالحجم الكامل"/>:null}</Pressable></Modal>
  </View>;
}

function NetworkStatusBanner() {
  const { colors: c } = useMobileTheme();
  const insets = useSafeAreaInsets();
  const online = useInternetAvailable();
  const [backendHealth, setBackendHealth] = useState<BackendHealth>(getBackendHealth);
  useEffect(() => subscribeBackendHealth(setBackendHealth), []);
  // While the app thinks it is offline, quietly ask the backend again every 15 s so it recovers by
  // itself (a stale Android reachability flag would otherwise keep the banner until a restart).
  useEffect(() => {
    if (online) return;
    const timer = setInterval(() => { void recheckBackend(); }, 15_000);
    return () => clearInterval(timer);
  }, [online]);
  // Short, calm wording: the person needs to know the app is fine and will recover by itself.
  const message = !online
    ? 'النت مقطوع حالياً. تطبيقك بيضل شغّال، وبيتحدّث لحاله أول ما يرجع الاتصال.'
    : backendHealth === 'unreachable'
      ? 'ما قدرنا نوصل للخدمة هلأ. عم نعيد المحاولة تلقائياً.'
      : backendHealth === 'degraded'
        ? 'الاتصال ضعيف شوي. إذا تأخّرت البيانات، اسحب الشاشة لتحدّثها.'
        : '';
  if (!message) return null;
  const light = c.background === lightPalette.background;
  // Sits below the status bar (not under it) and stays out of the way: one slim, soft line.
  return <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ paddingTop: insets.top, backgroundColor: light ? '#EEF3F8' : '#16222B' }}>
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: light ? '#D3DEE9' : '#27394A' }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: light ? '#6C8CAE' : '#80CAFF' }} />
      <Text style={{ color: light ? '#3C5873' : '#B9D9F2', textAlign: 'center', fontSize: 12, lineHeight: 18, flexShrink: 1 }}>{message}</Text>
    </View>
  </View>;
}

function SessionStabilityReleaseNote({ visible, theme, onDismiss }: { visible: boolean; theme: 'dark' | 'light'; onDismiss: () => void }) {
  const colors = theme === 'light' ? lightPalette : tokens.color;
  const dark = theme === 'dark';
  return <Modal visible={visible} transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={onDismiss}>
    <View accessibilityViewIsModal style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22, backgroundColor: 'rgba(5, 12, 8, 0.78)' }}>
      <View accessibilityRole="summary" accessibilityLabel="تحديث جديد: حسّنا عرض التطبيق بالعربية على أجهزة Android وiPhone" style={{ width: '100%', maxWidth: 430, padding: 21, borderRadius: 25, borderWidth: 1.5, borderColor: dark ? '#57763D' : '#B7D66C', backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: dark ? 0.4 : 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 }}>
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: 66, height: 66, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#B7FF30', borderWidth: 1, borderColor: '#A5E522' }}>
            <Text style={{ color: '#0B1411', fontSize: 34, lineHeight: 40, fontWeight: '900' }}>✓</Text>
          </View>
          <View style={{ marginTop: 16, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: dark ? '#344629' : '#EFF5E8', borderWidth: 1, borderColor: dark ? '#58753B' : '#C9D9A7' }}>
            <Text style={{ color: dark ? '#DFFFAD' : '#385616', fontSize: 12, fontWeight: '900', textAlign: 'center' }}>تحديث جديد</Text>
          </View>
          <Text style={{ color: colors.text, fontSize: 21, lineHeight: 30, fontWeight: '900', textAlign: 'center', marginTop: 13 }}>تجربة أوضح بالعربي</Text>
          <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 25, textAlign: 'center', marginTop: 9 }}>
            حسّنا عرض شاشة الدخول واتجاه الواجهة على أجهزة Android وiPhone. إذا ما ظهرت التغييرات، سكّر التطبيق وافتحه من جديد.
          </Text>
        </View>
        <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="إغلاق ملاحظات التحديث" style={{ minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 22, borderRadius: 15, backgroundColor: '#B7FF30', borderWidth: 1, borderColor: '#A5E522' }}>
          <Text style={{ color: '#0B1411', fontSize: 15, fontWeight: '900' }}>تمام، شكرًا</Text>
        </Pressable>
      </View>
    </View>
  </Modal>;
}

export default function HomeScreen() {
  const { invite: rawInvite, openOrder: rawOpenOrder } = useLocalSearchParams<{ invite?: string | string[]; openOrder?: string | string[] }>();
  const router = useRouter();
  const inviteFromLink = Array.isArray(rawInvite) ? rawInvite[0] : rawInvite;
  const openOrderId = Array.isArray(rawOpenOrder) ? rawOpenOrder[0] : rawOpenOrder;
  const [inviteToken, setInviteToken] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [sessionReleaseNoteVisible, setSessionReleaseNoteVisible] = useState(false);
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
    if (!Updates.isEnabled || Updates.isEmbeddedLaunch || !Updates.updateId) return;
    let active = true;
    void AsyncStorage.getItem(sessionStabilityReleaseNoteKey).then((seen) => {
      if (active && seen !== 'seen') setSessionReleaseNoteVisible(true);
    }).catch(() => { if (active) setSessionReleaseNoteVisible(true); });
    return () => { active = false; };
  }, []);
  const dismissSessionReleaseNote = useCallback(() => {
    setSessionReleaseNoteVisible(false);
    void AsyncStorage.setItem(sessionStabilityReleaseNoteKey, 'seen').catch(() => {});
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
    const authClient = supabase;
    let active = true;
    let resolved = false;
    let authEventResolvedSession = false;
    const readyTimeout = setTimeout(() => { if (active) setReady(true); }, 5000);
    const authErrorCode = (error: unknown) => {
      const value = error as { code?: unknown; status?: unknown; name?: unknown } | null;
      return {
        code: typeof value?.code === 'string' ? value.code : typeof value?.name === 'string' ? value.name : 'unknown',
        status: typeof value?.status === 'number' ? value.status : undefined,
      };
    };
    const { data: { subscription } } = authClient.auth.onAuthStateChange((event, value) => {
      if (!active) return;
      // INITIAL_SESSION(null) is not proof that a saved session is gone: Auth can
      // emit it when a refresh cannot finish yet (for example, while offline).
      // A real SIGNED_OUT or a non-empty session event is authoritative.
      if (value) {
        authEventResolvedSession = true;
        console.info('[auth-diagnostic]', JSON.stringify({ event, platform: Platform.OS, hasSession: true }));
        setSession(value);
      } else if (event === 'SIGNED_OUT') {
        authEventResolvedSession = true;
        console.info('[auth-diagnostic]', JSON.stringify({ event, platform: Platform.OS, hasSession: false }));
        setSession(null);
      } else if (event !== 'INITIAL_SESSION') {
        console.info('[auth-diagnostic]', JSON.stringify({ event, platform: Platform.OS, hasSession: false }));
      }
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
    });
    const appStateSubscription = Platform.OS === 'web' ? null : AppState.addEventListener('change', (state) => {
      if (state === 'active') void authClient.auth.startAutoRefresh();
      else void authClient.auth.stopAutoRefresh();
    });
    if (Platform.OS !== 'web' && AppState.currentState === 'active') void authClient.auth.startAutoRefresh();
    else if (Platform.OS !== 'web' && AppState.currentState !== null) void authClient.auth.stopAutoRefresh();
    // Open instantly from the session saved on the device; getSession() (which may need the network
    // to refresh an expired token) confirms or replaces it below.
    const storedSessionPromise = readStoredSession().then((stored) => {
      if (active && stored && !resolved && !authEventResolvedSession) { setSession(stored); setReady(true); }
      return stored;
    }).catch(() => null);
    void authClient.auth.getSession()
      .then(async ({ data, error }) => {
        resolved = true;
        if (!active || authEventResolvedSession) return;
        if (error) {
          const cached = await storedSessionPromise;
          console.warn('[auth-diagnostic]', JSON.stringify({ event: 'session_restore_failed', platform: Platform.OS, ...authErrorCode(error), hasCachedSession: !!cached }));
          if (active && !authEventResolvedSession && cached) setSession(cached);
          return;
        }
        if (data.session) {
          setSession(data.session);
          return;
        }
        // A delayed empty getSession result must not overwrite a session received
        // from Auth events or the secure device cache while startup was in flight.
        const cached = await storedSessionPromise;
        if (active && !authEventResolvedSession) setSession(cached);
      })
      .catch(async (error: unknown) => {
        // Temporary auth/network failures must not discard a session saved on this device.
        const stored = await storedSessionPromise;
        const diagnostic = authErrorCode(error);
        console.warn('[auth-diagnostic]', JSON.stringify({ event: 'session_restore_threw', platform: Platform.OS, ...diagnostic, hasCachedSession: !!stored }));
        if (active && !authEventResolvedSession && stored) setSession(stored);
      })
      .finally(() => { clearTimeout(readyTimeout); if (active) setReady(true); });
    return () => { active = false; clearTimeout(readyTimeout); subscription.unsubscribe(); appStateSubscription?.remove(); };
  }, []);
  const screen = !supabaseConfigured
    ? <AuthScreen inviteToken={inviteToken || undefined} theme={theme} />
    : !ready
      ? <AppShellSkeleton />
      : passwordRecovery
        ? <PasswordRecoveryScreen onDone={() => setPasswordRecovery(false)} theme={theme} />
      : !session
        ? <AuthScreen inviteToken={inviteToken || undefined} theme={theme} />
        : <SignedInHome userId={session.user.id} email={session.user.email ?? ''} inviteToken={inviteToken || undefined} openOrderId={openOrderId} onSignOut={async () => {
          // Show progress right away and never wait more than a few seconds on a weak connection.
          const upTo = (task: Promise<unknown>, ms: number) => Promise.race([task, new Promise((resolve) => setTimeout(resolve, ms))]);
          setSigningOut(true);
          try {
            await upTo(Promise.allSettled([clearCustomerOrderDraft(session.user.id), clearCustomerOrdersSnapshot(session.user.id), clearDriverOrdersSnapshot(session.user.id), unregisterPushNotifications(session.user.id), Image.clearDiskCache(), Image.clearMemoryCache(), clearUserCache(session.user.id)]), 4000);
            clearImageCaches();
            await upTo(supabase?.auth.signOut() ?? Promise.resolve(), 4000);
            await supabase?.auth.signOut({ scope: 'local' });
          } finally { setSigningOut(false); }
        }} theme={theme} onToggleTheme={() => applyTheme(theme === 'dark' ? 'light' : 'dark')} />;
  return <MobileThemeContext.Provider value={themeContext}><ToastProvider theme={theme}><View style={{ flex: 1, backgroundColor: colors.background }}><NetworkStatusBanner />{screen}{signingOut ? <View accessibilityRole="progressbar" accessibilityLabel="جاري تسجيل الخروج" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: 'rgba(11,20,17,0.88)', zIndex: 9999 }}><ActivityIndicator size="large" color="#B7FF30" /><Text style={{ color: '#EEF3EE', fontSize: 16, fontWeight: '800' }}>جاري تسجيل الخروج…</Text></View> : null}</View><SessionStabilityReleaseNote visible={sessionReleaseNoteVisible} theme={theme} onDismiss={dismissSessionReleaseNote} /></ToastProvider></MobileThemeContext.Provider>;
}

const styleDefinitions = {
  driverOrderTabs:{flexDirection:'row',gap:6,marginTop:12,marginBottom:8,padding:6,borderRadius:22,borderWidth:1,borderColor:c.border,backgroundColor:c.raised},driverOrderTab:{flex:1,minWidth:0,minHeight:58,flexDirection:'row-reverse',alignItems:'center',gap:7,paddingHorizontal:9,borderRadius:12,backgroundColor:'transparent',borderWidth:1,borderColor:'transparent'},driverOrderTabSelected:{backgroundColor:c.primary,borderColor:c.primary},driverOrderTabIcon:{width:30,height:30,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:c.surface},driverOrderTabIconSelected:{backgroundColor:'#17210F'},driverOrderTabCopy:{flex:1,minWidth:0},driverOrderTabTitle:{color:c.text,fontSize:13,fontWeight:'900',textAlign:'right'},driverOrderTabTitleSelected:{color:'#17210F'},driverOrderTabHint:{color:c.muted,fontSize:10.5,textAlign:'right',marginTop:3},driverOrderTabHintSelected:{color:'#385616'},driverOrderTabCount:{minWidth:23,height:23,paddingHorizontal:6,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:c.surface,color:c.primary,fontSize:11,fontWeight:'900',textAlign:'center'},driverOrderTabCountSelected:{backgroundColor:'#17210F',color:c.primary},
  driverIncomingCard:{padding:16,marginTop:10,marginBottom:12,borderRadius:22,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},driverActiveCard:{padding:15,marginTop:10,marginBottom:12,borderRadius:18,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},driverIncomingTop:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:10},driverFeeHighlight:{alignItems:'flex-end'},driverFeeLabel:{color:c.muted,fontSize:11,textAlign:'right'},driverFeeValue:{color:c.primary,fontSize:23,fontWeight:'900',textAlign:'right',marginTop:2},driverOfferRequest:{color:c.text,fontSize:14,lineHeight:22,fontWeight:'700',textAlign:'right',marginTop:12},driverOfferDestination:{marginTop:13,paddingVertical:4,paddingRight:12,marginRight:8,borderRightWidth:2,borderStyle:'dashed',borderRightColor:c.border},driverOfferSectionTitle:{flexDirection:'row-reverse',alignItems:'center',gap:6},driverDestinationAddress:{color:c.text,fontSize:12,fontWeight:'700',lineHeight:19,textAlign:'right',marginTop:6},driverOfferBudget:{marginTop:9,paddingHorizontal:12,paddingVertical:10,borderRadius:13,backgroundColor:c.raised},driverOfferExpiryRow:{flexDirection:'row-reverse',alignItems:'center',gap:6,marginTop:9},driverOrdersHint:{flexDirection:'row-reverse',alignItems:'center',gap:9,marginTop:10,marginBottom:16,padding:11,borderRadius:13,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},driverOrdersHintText:{flex:1,color:c.text,fontSize:11,lineHeight:18,textAlign:'right'},driverActiveHead:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:9},driverStatusChip:{maxWidth:'62%',paddingHorizontal:10,paddingVertical:6,borderRadius:12,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},driverStatusChipText:{color:c.primary,fontSize:10,fontWeight:'800',textAlign:'center'},driverOrderFacts:{flexDirection:'row-reverse',gap:8,marginTop:12},driverOrderFact:{flex:1,minWidth:0,padding:11,borderRadius:13,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},driverOrderFactLabel:{color:c.muted,fontSize:10,textAlign:'right'},driverOrderFactValue:{color:c.text,fontSize:12,fontWeight:'900',textAlign:'right',marginTop:4},driverWaitNotice:{marginTop:12,padding:12,borderRadius:13,backgroundColor:'#352D1D',borderWidth:1,borderColor:'#826B39'},driverWaitTitle:{color:'#F5D98F',fontSize:12,fontWeight:'900',textAlign:'right'},driverWaitCopy:{color:'#E4D4AA',fontSize:11,lineHeight:18,textAlign:'right',marginTop:4},driverEmptyIcon:{width:46,height:46,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:c.raised,marginBottom:4},
  driverIdentityRow:{flexDirection:'row-reverse',alignItems:'center',gap:14,paddingBottom:16,borderBottomWidth:1,borderBottomColor:c.border},driverIdentityAvatar:{width:82,height:82,flexShrink:0,overflow:'hidden',alignItems:'center',justifyContent:'center',borderRadius:41,borderWidth:2.5,borderColor:c.primary,backgroundColor:c.raised},driverIdentityCopy:{flex:1,minWidth:0,alignItems:'flex-start',gap:5},driverRoleTag:{paddingHorizontal:9,paddingVertical:4,borderRadius:10,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},driverRoleTagText:{color:c.primary,fontSize:10,fontWeight:'900'},driverIdentityName:{color:c.text,fontSize:18,fontWeight:'900',textAlign:'right'},driverIdentityEmail:{width:'100%',color:c.muted,fontSize:12,textAlign:'right',writingDirection:'ltr'},driverIdentityFacts:{flexDirection:'row-reverse',gap:9,marginTop:14},driverIdentityFact:{flex:1,minWidth:0,padding:12,borderRadius:13,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},driverIdentityFactLabel:{color:c.muted,fontSize:10,textAlign:'right'},driverIdentityFactValue:{color:c.text,fontSize:12,fontWeight:'800',textAlign:'right',marginTop:5},
  ordersIntroCard:{padding:17,borderRadius:22,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},ordersEyebrowLine:{flexDirection:'row-reverse',alignItems:'center',gap:7},ordersEyebrowDot:{width:8,height:8,borderRadius:4,backgroundColor:c.primary},
  addressEyebrow:{color:c.muted,fontSize:10,fontWeight:'700',textAlign:'right'},addressChangeButton:{minWidth:88,minHeight:38,flexShrink:0,flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:5,paddingHorizontal:12,borderRadius:12,backgroundColor:'#B7FF30',borderWidth:1,borderColor:'#A3E51E'},
  notificationItemHeading:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:8},notificationUnreadPill:{minHeight:21,alignItems:'center',justifyContent:'center',paddingHorizontal:8,borderRadius:11,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},notificationUnreadPillText:{color:c.primary,fontSize:10,fontWeight:'900'},
  formHeader:{flexDirection:'row',alignItems:'center',gap:10,paddingBottom:10,borderBottomWidth:1,borderBottomColor:'#33473b'},formStep:{width:38,height:38,borderRadius:13,backgroundColor:'#B7FF30',alignItems:'center',justifyContent:'center'},formStepText:{color:'#0B1411',fontSize:12,fontWeight:'900'},formHeaderCopy:{flex:1},formTitle:{color:c.text,fontSize:18,fontWeight:'900',textAlign:'right'},formSubtitle:{color:c.muted,fontSize:12,lineHeight:17,textAlign:'right',marginTop:3},cashBadge:{minHeight:38,borderRadius:12,paddingHorizontal:10,paddingVertical:6,backgroundColor:'#25382d',borderWidth:1,borderColor:'#405449',alignItems:'center',justifyContent:'center'},cashBadgeText:{color:'#DFFFAD',fontSize:10,fontWeight:'800'},formSection:{marginTop:12},sectionHead:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',marginBottom:9},sectionHeadLabel:{color:c.text,fontSize:13,fontWeight:'800',textAlign:'right'},sectionHint:{color:'#8fa196',fontSize:11,textAlign:'right'},orderRequestInput:{minHeight:90,backgroundColor:'#121d16',borderColor:'#3b5143',borderRadius:16,fontSize:15,lineHeight:23,textAlign:'right'},moneyField:{minHeight:54,flexDirection:'row-reverse',alignItems:'center',gap:11,paddingHorizontal:14,borderRadius:15,borderWidth:1,borderColor:'#42564a',backgroundColor:'#111c16'},moneyInput:{flex:1,minWidth:0,paddingVertical:10,color:c.text,fontSize:16,fontWeight:'800',fontFamily:'Tajawal_800ExtraBold'},currencyBadge:{paddingHorizontal:12,paddingVertical:8,borderRadius:10,backgroundColor:'#283b2d'},currencyBadgeText:{color:'#DFFFAD',fontSize:13,fontWeight:'900'},budgetHint:{color:'#8fa196',fontSize:11,marginTop:7,textAlign:'right'},photoSection:{marginTop:12,paddingTop:12,borderTopWidth:1,borderTopColor:'#33473b'},photoHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:10},photoCount:{color:'#DFFFAD',fontSize:12,fontWeight:'800',paddingHorizontal:10,paddingVertical:6,borderRadius:12,backgroundColor:'#26382c'},uploadedPhotoList:{flexDirection:'row-reverse',gap:8,marginBottom:10},uploadedPhotoTile:{flex:1,aspectRatio:1,padding:6,borderRadius:16,borderWidth:1,borderColor:'#405449',backgroundColor:'#15231a'},uploadedPhotoPreview:{width:'100%',height:'100%',borderRadius:11,backgroundColor:'#223128'},uploadedPhotoStatus:{position:'absolute',top:13,right:13,flexDirection:'row-reverse',alignItems:'center',gap:5,paddingHorizontal:7,paddingVertical:5,borderRadius:10,backgroundColor:'rgba(11,20,17,.88)'},imageStatusDot:{width:6,height:6,borderRadius:3,backgroundColor:'#F6C76A'},imageStatusUploaded:{backgroundColor:'#B7FF30'},orderImageStatusText:{color:'#fff',fontSize:9,fontWeight:'700'},imageActions:{flexDirection:'row-reverse',gap:6,marginTop:7},replaceImageButton:{flex:1,minHeight:42,alignItems:'center',justifyContent:'center',borderRadius:10,backgroundColor:'#263b2c',borderWidth:1,borderColor:'#547044'},replaceImageText:{color:'#DFFFAD',fontSize:10,fontWeight:'800'},removeImageButton:{flex:1,minHeight:42,alignItems:'center',justifyContent:'center',borderRadius:10,backgroundColor:'#302321',borderWidth:1,borderColor:'#65423a'},removeImageText:{color:'#FFC1AD',fontSize:10,fontWeight:'800'},addImageCard:{minHeight:76,flexDirection:'row-reverse',alignItems:'center',gap:11,paddingHorizontal:13,borderWidth:1,borderStyle:'dashed',borderColor:'#567148',borderRadius:15,backgroundColor:'#17251b'},addImageIcon:{width:42,height:42,borderRadius:13,backgroundColor:'#2c4128',alignItems:'center',justifyContent:'center'},addImageCopy:{flex:1},addImageTitle:{color:'#EAF5EC',fontSize:13,fontWeight:'800',textAlign:'right'},addImageHint:{color:'#91A397',fontSize:10,marginTop:3,textAlign:'right'},addImageArrow:{color:c.primary,fontSize:17},
  tabIconBadge:{width:36,height:36,borderRadius:13,alignItems:'center',justifyContent:'center'},tabIconBadgeActive:{backgroundColor:c.primary},tabIconBadgeIdle:{backgroundColor:'#1D2B24',borderWidth:1,borderColor:'#30443A'},savedManualNotice:{marginTop:12,padding:14,borderRadius:14,borderWidth:1,borderColor:'#826b39',backgroundColor:'#292418'},savedManualTitle:{color:'#f5d98f',fontSize:13,fontWeight:'800',textAlign:'right'},savedManualCopy:{color:'#e4d4aa',fontSize:12,lineHeight:18,textAlign:'right',marginTop:4},formLocationHint:{color:'#B9C7BE',fontSize:12,lineHeight:18,marginTop:-5,marginBottom:15,textAlign:'right'},
  safe: { flex: 1, backgroundColor: c.background }, bodyScroll:{flex:1}, content: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 12, paddingBottom: 28 },
  themeToggle:{width:44,height:44,borderRadius:14,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},headerActions:{flexDirection:'row',alignItems:'center',gap:6},backNavigation:{minHeight:40,alignSelf:'flex-end',flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:7,paddingHorizontal:12,marginBottom:8,borderRadius:12,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},backNavigationText:{color:c.primary,fontSize:12,fontWeight:'800',textAlign:'right'},
  header: { position:'relative',width:'100%',maxWidth:520,alignSelf:'center',height:64,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:'#1a2820',backgroundColor:c.background,zIndex:5 }, brand: { flexDirection: 'row', alignItems: 'center', gap: 9 }, brandMark: { width: 48, height: 48, borderRadius: 13, overflow:'hidden', backgroundColor:'#fff', alignItems: 'center', justifyContent: 'center' }, brandLogo:{width:'100%',height:'100%'}, brandMarkText: { fontSize: 25, fontWeight: '800', color: c.background }, brandName: { color: c.text, fontSize: 17, fontWeight: '800' }, brandTag: { color: c.muted, fontSize: 11, marginTop: 1 }, accountAvatar:{position:'relative',left:0,top:0,width:48,height:48,borderRadius:24,overflow:'hidden',alignItems:'center',justifyContent:'center',backgroundColor:'#27372D',borderWidth:2,borderColor:'#7FAE39'},accountAvatarText:{color:'#DFFFAD',fontSize:17,fontWeight:'800'},avatarImage:{width:'100%',height:'100%'},
  address: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 7, marginBottom: 1, minHeight: 48, paddingVertical: 7, paddingHorizontal: 11, backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border }, pin: { width: 30, height: 30, flexShrink: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: c.raised, borderRadius: 10 }, pinGlyph: { color: c.primary, fontSize: 17 }, addressCopy: { flex: 1, minWidth: 0 }, addressName: { color: c.text, fontSize: 12, fontWeight: '700', textAlign: 'right' }, addressChange: { color: '#0B1411', fontSize: 12, fontWeight: '900', flexShrink: 0 },
  heroImageWrap: { marginTop: 23, marginBottom: 19, borderRadius: 24, overflow: 'hidden', backgroundColor: '#8DE21A' }, heroImage: { width: '100%', aspectRatio: 900 / 510 },
  hero: { minHeight: 206, borderRadius: 24, backgroundColor: '#B7FF30', marginTop: 23, marginBottom: 19, padding: 20, overflow: 'hidden', justifyContent: 'center' }, heroCopy: { width: '57%', marginLeft: 'auto', zIndex: 2 }, heroEyebrow: { color: '#43552C', fontSize: 12, fontWeight: '700' }, heroTitle: { color: '#0B1411', fontSize: 23, lineHeight: 31, fontWeight: '800', marginTop: 10 }, heroDescription: { color: '#2F3F27', fontSize: 13, marginTop: 7 }, heroFoot: { position: 'absolute', right: 20, bottom: 17, flexDirection: 'row', alignItems: 'center', gap: 7 }, heroDash: { width: 18, height: 2, backgroundColor: '#526936', borderRadius: 2 }, heroFootText: { color: '#3F512A', fontSize: 11, fontWeight: '700' }, heroArt: { position: 'absolute', left: -7, top: 1, bottom: 0, width: '40%', alignItems: 'center', justifyContent: 'center' }, heroOrbit: { width: 134, height: 134, borderRadius: 67, borderWidth: 1, borderColor: 'rgba(11,20,17,.14)', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-14deg' }] }, heroCore: { width: 84, height: 84, borderRadius: 28, backgroundColor: '#fff', transform: [{ rotate: '14deg' }], alignItems: 'center', justifyContent: 'center', overflow:'hidden', shadowColor: '#31451B', shadowOpacity: .18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 }, heroLogo:{width:80,height:80,borderRadius:23}, heroPin: { position: 'absolute', right: 3, top: 9, height: 35, width: 35, borderRadius: 12, backgroundColor: '#18251A', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '14deg' }] }, heroPinText: { fontSize: 19, color: '#B7FF30' }, heroSpark: { position: 'absolute', left: 5, top: 26, height: 10, width: 10, borderRadius: 4, backgroundColor: '#F7FFE9', transform: [{ rotate: '30deg' }] }, heroDot: { position: 'absolute', right: 24, bottom: 10, height: 8, width: 8, borderRadius: 4, backgroundColor: '#4D622D' },
  formCard: { padding: 14, borderRadius: 18, backgroundColor: c.surface, borderColor: c.border, borderWidth: 1 }, draftNotice: { color: '#b6c3ba', fontSize: 10, marginBottom: 13, textAlign: 'left' }, label: { color: c.text, fontSize: 13, fontWeight: '700', marginBottom: 11, textAlign: 'right' }, input: { fontFamily: 'Tajawal_400Regular', minHeight: 98, borderWidth: 1, borderColor: '#405449', borderRadius: 12, backgroundColor: '#17231c', padding: 13, color: c.text, fontSize: 15, lineHeight: 23, textAlign: 'right' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }, chip: { paddingHorizontal: 16, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 18, borderWidth: 1, borderColor: '#405348', backgroundColor: '#223128' }, chipActive: { backgroundColor: '#344629', borderColor: c.primary }, chipText: { fontSize: 12, color: '#d4ddd7' }, chipTextActive: { color: '#e1ffc0', fontWeight: '700' }, divider: { height: 1, backgroundColor: c.border, marginTop: 16 }, attachment: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 8 }, orderImageList: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 8 }, orderImageTile: { width: 76, height: 76, borderRadius: 11, overflow: 'hidden', backgroundColor: '#223128' }, orderImagePreview: { width: 76, height: 76 }, orderImageStatus: { position: 'absolute', bottom: 2, right: 2, color: '#fff', fontSize: 9, backgroundColor: '#16221b', paddingHorizontal: 4, borderRadius: 4 }, orderImageRemove: { position: 'absolute', top: 2, right: 4, color: '#fff', fontSize: 18, textShadowColor: '#000', textShadowRadius: 3 }, offlineOrders: { padding: 13, marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: '#745C2C', backgroundColor: '#3A2D18', gap: 4 }, offlineOrdersTitle: { color: '#FFE2A0', fontSize: 12, fontWeight: '700' }, offlineOrdersCopy: { color: '#E9D8AA', fontSize: 11, lineHeight: 17 }, orderGallery: { marginTop: 10, gap: 6 }, orderGalleryTitle: { color: c.muted, fontSize: 11 }, orderGalleryImage: { width: 84, height: 84, borderRadius: 10, backgroundColor: '#223128' }, attachmentIcon: { color: c.primary, fontSize: 21 }, attachmentText: { color: c.text, fontSize: 13, fontWeight: '600' }, optional: { color: c.muted, fontSize: 11, fontWeight: '400' }, endArrow: { color: c.muted, marginLeft: 'auto' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 15, paddingHorizontal: 2 }, noteIcon: { color: '#99bd75', fontSize: 15 }, noteText: { color: c.muted, fontSize: 12, lineHeight: 19, flex: 1 }, submit: { height: 54, marginTop: 20, backgroundColor: c.primary, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, submitText: { color: c.background, fontSize: 15, fontWeight: '800' }, submitArrow: { fontSize: 17 }, pending: { color: '#819087', textAlign: 'center', fontSize: 10, lineHeight: 16, marginTop: 9 }, footer: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8, paddingBottom: 6, paddingHorizontal: 12, backgroundColor: c.background }, footerButton: { flex: 1, minWidth: 0, minHeight: 54, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, borderRadius: 14, paddingHorizontal: 2 }, footerButtonActive: { backgroundColor: c.primary }, footerIconWrap: { position: 'relative', width: 25, height: 25, alignItems: 'center', justifyContent: 'center' }, footerIcon: { width: 25, height: 25, alignItems: 'center', justifyContent: 'center' }, footerActive: { color: c.background, fontSize: 10, fontWeight: '800' }, footerItem: { color: c.muted, fontSize: 10, fontWeight: '700', textAlign: 'center' }, navigationNotificationBadge: { position: 'absolute', right: -5, top: -5, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderRadius: 9, backgroundColor: c.primary, borderWidth: 1, borderColor: c.background }, navigationNotificationBadgeText: { color: c.background, fontSize: 8, fontWeight: '900' }, empty: { minHeight: 320, marginTop: 26, borderWidth: 1, borderColor: c.border, borderRadius: 18, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', padding: 24 }, emptyMark: { color: c.primary, backgroundColor: '#344629', overflow: 'hidden', borderRadius: 16, padding: 10, fontSize: 26, fontWeight: '800' }, emptyTitle: { color: c.text, fontWeight: '700', fontSize: 16, marginTop: 18 }, emptyCopy: { color: c.muted, fontSize: 12, marginTop: 7 }, signOut: { marginTop: 22, borderWidth: 1, borderColor: c.danger, borderRadius: 10, paddingHorizontal: 18, minHeight: 44, justifyContent: 'center' }, signOutText: { color: c.danger, fontWeight: '700', fontSize: 13 },
  addressPage:{marginTop:24},addressPageHeader:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:4},backLink:{flexDirection:'row',alignItems:'center',gap:8,minHeight:44,alignSelf:'flex-start'},backArrow:{fontSize:18,color:c.primary},backText:{fontSize:12,color:'#D3EFA4',fontWeight:'700'},pageTitle:{color:c.text,fontSize:25,fontWeight:'800',textAlign:'right',marginTop:0,flexShrink:1},pageDescription:{color:c.muted,fontSize:13,textAlign:'right',marginTop:5,marginBottom:17},savedAddress:{flexDirection:'row-reverse',alignItems:'center',gap:11,padding:14,marginBottom:10,borderRadius:15,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},savedPin:{width:36,height:36,borderRadius:12,backgroundColor:'#344629',alignItems:'center',justifyContent:'center'},savedCopy:{flex:1,alignItems:'flex-start'},savedLabel:{color:c.text,fontSize:14,fontWeight:'700',textAlign:'right'},savedDetail:{color:c.muted,fontSize:11,marginTop:3,textAlign:'right'},deleteAddress:{minWidth:44,minHeight:44,padding:0,alignItems:"center",justifyContent:"center"},deleteText:{color:c.danger,fontSize:11,fontWeight:'700'},sectionTitle:{color:c.text,fontWeight:'800',fontSize:16,marginBottom:17,textAlign:'right'},zoneList:{gap:8,marginBottom:17},zoneOption:{minHeight:44,paddingHorizontal:12,paddingVertical:8,justifyContent:"center",alignItems:'flex-start',borderWidth:1,borderColor:'#405348',borderRadius:12,backgroundColor:'#1A2920'},zoneSelected:{borderColor:c.primary,backgroundColor:'#283922'},zoneName:{color:c.text,fontWeight:'700',fontSize:13,textAlign:'right'},zoneNameSelected:{color:'#DFFFAD'},zoneMeta:{color:c.muted,fontSize:11,marginTop:4},field:{fontFamily:'Tajawal_400Regular',minHeight:48,borderWidth:1,borderColor:'#405449',borderRadius:12,backgroundColor:'#17231c',paddingHorizontal:12,color:c.text,fontSize:14,marginBottom:14},inlineFields:{flexDirection:'row',gap:10},inline:{flex:1},saveAddress:{minHeight:50,borderRadius:13,backgroundColor:c.primary,alignItems:'center',justifyContent:'center',marginTop:5},disabled:{opacity:0.6},saveAddressText:{color:c.background,fontWeight:'800',fontSize:14},noZones:{padding:18,borderRadius:14,backgroundColor:'#17251C',borderWidth:1,borderColor:c.border,alignItems:'center'},noZonesTitle:{color:c.text,fontWeight:'700',fontSize:14},formMessage:{color:'#F6C76A',textAlign:'right',fontSize:12,marginTop:12,lineHeight:19},profileAction:{minHeight:44,borderRadius:12,borderWidth:1,borderColor:c.border,backgroundColor:'#1A2920',paddingHorizontal:15,justifyContent:'center',marginTop:20},profileActionText:{color:'#DFFFAE',fontSize:13,fontWeight:'700'},addressBackButton:{minHeight:38,alignSelf:'center',flexDirection:'row-reverse',alignItems:'center',gap:7,paddingHorizontal:12,borderRadius:12,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},addressBackArrow:{color:c.primary,fontSize:17,fontWeight:'800'},addressBackText:{color:c.primary,fontSize:12,fontWeight:'800'},addressHistoryHero:{flexDirection:'row-reverse',alignItems:'center',gap:12,padding:15,marginTop:12,marginBottom:15,borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},addressHistoryIcon:{width:46,height:46,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:c.raised},addressHistoryCopy:{flex:1,alignItems:'flex-start'},addressHistoryEyebrow:{color:c.accent,fontSize:10,fontWeight:'800',textAlign:'right'},addressHistoryTitle:{color:c.text,fontSize:19,fontWeight:'900',textAlign:'right',marginTop:2},addressHistorySubtitle:{color:c.muted,fontSize:11,lineHeight:17,textAlign:'right',marginTop:3},addressHistoryCount:{minWidth:48,alignItems:'center',justifyContent:'center',paddingHorizontal:8,paddingVertical:7,borderRadius:13,backgroundColor:c.raised},addressHistoryCountNumber:{color:c.primary,fontSize:17,fontWeight:'900'},addressHistoryCountLabel:{color:c.muted,fontSize:9,fontWeight:'700'},addressHistoryButton:{minHeight:70,flexDirection:'row-reverse',alignItems:'center',gap:12,paddingHorizontal:14,marginBottom:17,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},addressHistoryButtonIcon:{width:42,height:42,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:c.raised},addressHistoryButtonCopy:{flex:1,alignItems:'flex-start'},addressHistoryButtonTitle:{color:c.text,fontSize:14,fontWeight:'900',textAlign:'right'},addressHistoryButtonHint:{color:c.muted,fontSize:10,lineHeight:15,textAlign:'right',marginTop:3},addressHistoryButtonEnd:{width:30,height:30,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:c.raised},addressHistoryArrow:{color:c.primary,fontSize:17,fontWeight:'900'},historyAddressCard:{padding:14,marginBottom:11,borderRadius:17,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},historyAddressTop:{flexDirection:'row-reverse',alignItems:'center',gap:10},historyAddressDivider:{height:1,backgroundColor:c.border,marginVertical:11},historyAddressDetail:{color:c.text,fontSize:12,lineHeight:19,textAlign:'right'},historyAddressPhone:{color:c.muted,fontSize:11,marginTop:7,textAlign:'right'},historyEmpty:{minHeight:190,alignItems:'center',justifyContent:'center',padding:22,marginTop:5,borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},historyEmptyIcon:{width:48,height:48,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:c.raised,marginBottom:7},
  ordersIntro:{marginTop:4,marginBottom:12},ordersIntroCopy:{flex:1,minWidth:0},ordersIntroTop:{minHeight:38,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:9},ordersIntroMain:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:12},ordersIntroTools:{flexDirection:'row',alignItems:'center',gap:8},ordersBackButton:{minHeight:36,justifyContent:'center',paddingHorizontal:10,borderRadius:11,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},ordersBackButtonText:{color:c.primary,fontSize:11,fontWeight:'800',textAlign:'right'},ordersEyebrow:{color:c.accent,fontSize:12,fontWeight:'800',textAlign:'right'},ordersTitle:{color:c.text,fontSize:25,fontWeight:'900',textAlign:'right'},ordersDescription:{color:c.muted,fontSize:12,lineHeight:18,textAlign:'right',marginTop:4},ordersCountBadge:{width:58,height:58,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:c.raised,borderWidth:1,borderColor:c.border},ordersCountValue:{color:c.primary,fontSize:22,fontWeight:'900'},ordersCountLabel:{color:c.muted,fontSize:10,fontWeight:'700',marginTop:-2},ordersRefreshButton:{width:44,height:44,flexShrink:0,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:c.raised,borderWidth:1,borderColor:c.border},
  notificationCard:{borderRadius:18,padding:14,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,marginBottom:14},notificationHeader:{flexDirection:'row',alignItems:'center',gap:10},notificationSummary:{flex:1,minWidth:0,minHeight:54,flexDirection:'row',alignItems:'center',gap:9},notificationIcon:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:c.raised,borderWidth:1,borderColor:c.border},notificationCopy:{flex:1,minWidth:0},notificationTitle:{color:c.text,fontSize:14,fontWeight:'900',textAlign:'right'},notificationSubtitle:{color:c.muted,fontSize:11,marginTop:3,textAlign:'right'},notificationCount:{minWidth:30,height:28,paddingHorizontal:8,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:c.raised,borderWidth:1,borderColor:c.border},notificationCountText:{color:c.primary,fontSize:12,fontWeight:'900'},notificationExpandIcon:{width:32,height:32,borderRadius:11,alignItems:'center',justifyContent:'center',backgroundColor:c.raised,borderWidth:1,borderColor:c.border},notificationMarkAll:{minHeight:42,alignSelf:'flex-start',flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:8,paddingHorizontal:13,marginTop:10,borderRadius:13,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},notificationMarkAllText:{color:c.primary,fontSize:12,fontWeight:'800'},notificationList:{borderTopWidth:1,borderTopColor:c.border,marginTop:9},notificationItem:{minHeight:76,flexDirection:'row-reverse',alignItems:'flex-start',gap:10,paddingVertical:12,borderBottomWidth:1,borderBottomColor:c.border},notificationItemRead:{opacity:.62},notificationDot:{width:9,height:9,borderRadius:5,marginTop:5,backgroundColor:c.primary},notificationDotRead:{backgroundColor:c.muted},notificationItemCopy:{flex:1},notificationItemTitle:{color:c.text,fontSize:13,fontWeight:'800',textAlign:'right'},notificationItemBody:{color:c.muted,fontSize:12,lineHeight:18,marginTop:4,textAlign:'right'},notificationItemMeta:{color:c.muted,fontSize:10,marginTop:6,textAlign:'right'},notificationEmpty:{color:c.muted,fontSize:12,textAlign:'center',paddingVertical:16},
  ordersLoading:{minHeight:190,alignItems:'center',justifyContent:'center',gap:10},retryOrdersButton:{minHeight:44,alignSelf:'flex-start',justifyContent:'center',marginTop:8,paddingHorizontal:12,borderRadius:12,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},retryOrdersText:{color:c.primary,fontSize:12,fontWeight:'800'},
  orderCardHead:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:10},orderMeta:{flex:1,alignItems:'flex-start'},orderMetaId:{color:c.muted,fontSize:10,fontWeight:'700'},orderStatusPill:{minHeight:34,maxWidth:'67%',flexDirection:'row-reverse',alignItems:'center',gap:7,paddingHorizontal:10,borderRadius:18,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},orderStatusDot:{width:8,height:8,borderRadius:4,backgroundColor:c.primary},orderStatusCancelled:{backgroundColor:c.raised,borderColor:c.danger},orderStatusDotCancelled:{backgroundColor:c.danger},orderStatusTextCancelled:{color:c.danger},orderRequestBlock:{marginTop:13,padding:13,borderRadius:14,backgroundColor:c.raised},orderFacts:{flexDirection:'row-reverse',gap:9,marginTop:12},orderFact:{flex:1,minWidth:0,padding:11,borderRadius:13,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},orderFactLabel:{color:c.muted,fontSize:10,textAlign:'right'},orderFactValue:{color:c.text,fontSize:12,fontWeight:'800',textAlign:'right',marginTop:5},purchaseAmountLine:{color:c.accent,fontSize:11,fontWeight:'800',textAlign:'right',marginTop:10},
  requestMessage:{color:'#DFFFAD',fontSize:12,textAlign:'center',lineHeight:20,marginTop:11},orderPage:{marginTop:0},orderCard:{borderRadius:15,padding:15,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,marginBottom:10},notificationOrderCard:{borderColor:c.primary,borderWidth:2},notificationOrderLabel:{alignSelf:'flex-start',color:c.background,backgroundColor:c.primary,fontSize:10,fontWeight:'900',paddingHorizontal:9,paddingVertical:5,borderRadius:9,marginBottom:10},orderTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10},orderStatus:{color:c.primary,fontSize:10,fontWeight:'800',flexShrink:1},orderRequest:{color:c.muted,fontSize:13,lineHeight:20,marginTop:6,textAlign:'right'},orderBottom:{borderTopWidth:1,borderTopColor:c.border,marginTop:12,paddingTop:10,flexDirection:'row',justifyContent:'space-between',gap:8},orderDate:{color:c.muted,fontSize:10},orderFee:{color:'#B7D58D',fontSize:10},reviewActions:{flexDirection:'row',gap:9,marginTop:12},approvePurchase:{flex:1,minHeight:42,borderRadius:11,backgroundColor:c.primary,alignItems:'center',justifyContent:'center'},rejectPurchase:{flex:1,minHeight:44,borderRadius:11,borderWidth:1,borderColor:'#755544',backgroundColor:'#28221e',alignItems:'center',justifyContent:'center'},rejectPurchaseText:{color:'#ffc6a9',fontSize:12,fontWeight:'700'},deliveryCode:{color:c.primary,fontSize:28,fontWeight:'800',letterSpacing:8,textAlign:'center',paddingVertical:8,marginTop:8,backgroundColor:'#263621',borderRadius:12},profilePage:{marginTop:0,gap:13},driverApplyCard:{borderRadius:18,padding:17,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},driverApplyMark:{width:38,height:38,borderRadius:12,backgroundColor:'#344629',alignItems:'center',justifyContent:'center',marginBottom:12},driverApplyIcon:{color:c.primary,fontSize:19},driverApplyTitle:{color:c.text,fontSize:16,fontWeight:'800',textAlign:'right'},driverApplyCopy:{color:c.muted,fontSize:12,lineHeight:20,textAlign:'right',marginTop:6,marginBottom:16},driverStatus:{alignSelf:'flex-start',marginTop:13,borderRadius:20,overflow:'hidden',paddingHorizontal:12,paddingVertical:6,backgroundColor:'#2d4028',color:'#DFFFAD',fontSize:11,fontWeight:'700'},
  driverPanel:{borderRadius:20,padding:16,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},driverPanelTop:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:12},driverRefresh:{width:44,height:44,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#233229'},driverRefreshGlyph:{fontSize:20,color:c.primary},driverStatsRow:{flexDirection:'row-reverse',gap:10,marginBottom:14},driverStat:{flex:1,minHeight:68,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',paddingHorizontal:13,borderRadius:14,backgroundColor:'#18261e',borderWidth:1,borderColor:'#304439'},driverStatValue:{color:c.primary,fontSize:22,fontWeight:'900'},driverStatLabel:{color:'#B8C7BD',fontSize:11,fontWeight:'700'},driverWelcome:{marginTop:14,marginBottom:16,padding:18,borderRadius:20,backgroundColor:'#17271d',borderWidth:1,borderColor:'#344a38'},driverAppearanceCard:{padding:13,marginBottom:14,borderRadius:17,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},driverSettingsTitle:{color:c.text,fontSize:13,fontWeight:'900',textAlign:'right',marginBottom:9},driverWelcomeKicker:{color:c.primary,fontSize:11,fontWeight:'800',textAlign:'right'},driverWelcomeTitle:{color:c.text,fontSize:22,fontWeight:'900',textAlign:'right',marginTop:5},driverWelcomeCopy:{color:c.muted,fontSize:12,lineHeight:19,textAlign:'right',marginTop:5},driverContent:{width:'100%',maxWidth:520,alignSelf:'center',paddingHorizontal:20,paddingTop:4,paddingBottom:32},driverLogout:{position:'relative',left:0,top:0,minWidth:48,minHeight:40,paddingHorizontal:11,borderRadius:12,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center',backgroundColor:'#17231c'},driverLogoutText:{color:'#DFFFAD',fontSize:11,fontWeight:'800'},availabilityButton:{minHeight:68,flexDirection:'row-reverse',alignItems:'center',justifyContent:'flex-start',gap:11,paddingHorizontal:14,borderRadius:15,backgroundColor:'#202c25',borderWidth:1,borderColor:'#46534a',marginTop:10,marginBottom:16},availabilityOn:{backgroundColor:'#213323',borderColor:'#A5D46A'},availabilityDot:{width:12,height:12,borderRadius:6,backgroundColor:'#87978b'},availabilityDotOn:{backgroundColor:'#B7FF30'},availabilityCopy:{flex:1,alignItems:'flex-start',gap:4},availabilityText:{fontSize:13,fontWeight:'800',color:'#D1D9D3',textAlign:'right'},availabilityTextOn:{color:'#DFFFAD'},availabilityHint:{color:'#99AA9E',fontSize:10,textAlign:'right'},availabilityArrow:{color:c.primary,fontSize:17,fontWeight:'800'},driverOffersHead:{flexDirection:'row-reverse',alignItems:'center',gap:9,marginTop:17,marginBottom:12},offerCount:{color:c.primary,fontSize:11,fontWeight:'800'},offerCard:{borderRadius:16,padding:15,backgroundColor:'#17241C',borderWidth:1,borderColor:'#34473A',marginBottom:11},offerExpiry:{color:'#F0CC83',fontSize:10,marginTop:8},acceptOffer:{flex:1.5,minHeight:50,borderRadius:15,backgroundColor:c.primary,alignItems:'center',justifyContent:'center'},acceptOfferText:{color:'#0B1411',fontWeight:'900',fontSize:14},declineOffer:{flex:1,minHeight:50,borderRadius:15,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},declineOfferText:{color:c.muted,fontSize:14,fontWeight:'800'},cancelOrder:{minHeight:44,borderRadius:10,borderWidth:1,borderColor:'#63443a',alignItems:'center',justifyContent:'center',marginTop:10,backgroundColor:'#261d1a'},cancelOrderText:{color:'#ffc6a9',fontSize:11,fontWeight:'700'},noOffers:{minHeight:210,borderRadius:22,backgroundColor:c.surface,borderWidth:1.5,borderStyle:'dashed',borderColor:c.border,alignItems:'center',justifyContent:'center',padding:18,marginBottom:15},noOffersGlyph:{color:c.primary,fontSize:23},noOffersTitle:{color:c.text,fontWeight:'900',fontSize:18,marginTop:14},noOffersCopy:{color:c.muted,textAlign:'center',fontSize:14,lineHeight:23,marginTop:6},dropoff:{borderTopWidth:1,borderTopColor:c.border,marginTop:12,paddingTop:11},dropoffTitle:{color:'#DFFFAD',fontSize:11,fontWeight:'800'},dropoffText:{color:'#C4D0C8',fontSize:11,lineHeight:18,marginTop:4},dropoffPhone:{color:c.primary,fontSize:12,fontWeight:'800',marginTop:6,textAlign:'left'},
  profileCard:{borderRadius:18,padding:17,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},profileCardTop:{flexDirection:'row-reverse',alignItems:'center',gap:12,marginBottom:18},accountAvatarLarge:{width:52,height:52,borderRadius:26,overflow:'hidden',alignItems:'center',justifyContent:'center',backgroundColor:'#2b3c30',borderWidth:1,borderColor:c.primary},accountAvatarLargeText:{color:'#DFFFAD',fontSize:21,fontWeight:'800'},profileEmail:{color:c.muted,fontSize:12,marginTop:3,textAlign:'right'},profileEditPhotoWrap:{width:96,height:96,alignSelf:'center',marginTop:3,marginBottom:12,borderRadius:48,overflow:'hidden',alignItems:'center',justifyContent:'center',backgroundColor:'#2b3c30',borderWidth:2,borderColor:c.primary},profileEditPhoto:{width:'100%',height:'100%'},profileEditInitial:{color:'#DFFFAD',fontSize:34,fontWeight:'900'},profilePhotoButton:{minHeight:44,alignSelf:'center',justifyContent:'center',paddingHorizontal:16,marginBottom:19,borderRadius:13,borderWidth:1,borderColor:c.border,backgroundColor:c.raised},profilePhotoButtonText:{color:c.primary,fontSize:12,fontWeight:'800'},readOnlyEmail:{minHeight:52,justifyContent:'center',paddingHorizontal:13,marginBottom:16,borderRadius:12,borderWidth:1,borderColor:c.border,backgroundColor:c.raised},readOnlyEmailText:{color:c.text,fontSize:14,textAlign:'left'},readOnlyEmailHint:{color:c.muted,fontSize:10,textAlign:'right',marginTop:3},appearanceSetting:{minHeight:62,flexDirection:'row-reverse',alignItems:'center',gap:11,padding:11,borderRadius:14,borderWidth:1,borderColor:c.border,backgroundColor:c.raised},appearanceIcon:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:c.surface},appearanceCopy:{flex:1,alignItems:'flex-start'},appearanceTitle:{color:c.text,fontSize:13,fontWeight:'800',textAlign:'right'},appearanceHint:{color:c.muted,fontSize:10,marginTop:3,textAlign:'right'},appearanceArrow:{color:c.primary,fontSize:17,fontWeight:'800'},missingAddress:{flexDirection:'row-reverse',flexWrap:'wrap',alignItems:'center',gap:12,marginTop:14,marginBottom:16,padding:15,borderRadius:18,borderWidth:1,borderColor:'#456139',backgroundColor:'#1b2b20'},missingAddressIcon:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#2e4327'},missingAddressGlyph:{color:c.primary,fontSize:22},missingAddressCopy:{flex:1,minWidth:170},missingAddressTitle:{color:c.text,fontSize:15,fontWeight:'800',textAlign:'right'},missingAddressText:{color:c.muted,fontSize:12,lineHeight:18,textAlign:'right',marginTop:3},missingAddressButton:{width:'100%',minHeight:48,borderRadius:13,backgroundColor:c.primary,alignItems:'center',justifyContent:'center'},missingAddressButtonText:{color:c.background,fontSize:14,fontWeight:'800'},inputDisabled:{opacity:.48},chipDisabled:{opacity:.42},addressActions:{alignItems:'center'},editAddressText:{color:'#DFFFAD',fontSize:11,fontWeight:'700'},cancelEdit:{minHeight:44,alignItems:'center',justifyContent:'center',marginTop:7},
  accountIntro:{marginTop:2,marginBottom:3},accountPageTitle:{color:c.text,fontSize:26,fontWeight:'900',textAlign:'right'},accountPageSubtitle:{color:c.muted,fontSize:13,textAlign:'right',marginTop:4},profileSectionCard:{borderRadius:19,padding:15,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},profileSectionHeading:{flexDirection:'row-reverse',alignItems:'center',gap:9,marginBottom:14},profileHeadingIcon:{width:34,height:34,borderRadius:11,alignItems:'center',justifyContent:'center',backgroundColor:c.raised},profileSectionTitle:{color:c.text,fontWeight:'800',fontSize:16,textAlign:'right',flex:1},profileSectionTag:{color:c.primary,fontSize:10,fontWeight:'800',paddingHorizontal:9,paddingVertical:5,borderRadius:12,backgroundColor:c.raised,overflow:'hidden'},accountRoleTag:{alignSelf:'flex-start',paddingHorizontal:9,paddingVertical:5,borderRadius:11,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},accountRoleTagText:{color:c.primary,fontSize:10,fontWeight:'800'},customerIdentityAvatar:{width:68,height:68,borderRadius:34,overflow:'hidden',alignItems:'center',justifyContent:'center',backgroundColor:c.raised,borderWidth:3,borderColor:'#7FAE39'},profileIdentityRow:{flexDirection:'row-reverse',alignItems:'center',gap:12,paddingBottom:13,borderBottomWidth:1,borderBottomColor:c.border},profileIdentityCopy:{flex:1,alignItems:'flex-start',minWidth:0},profileIdentityName:{color:c.text,fontSize:16,fontWeight:'800',textAlign:'right',marginTop:7},profileSectionAction:{minHeight:46,marginTop:12,paddingHorizontal:13,borderRadius:13,borderWidth:1,borderColor:c.border,backgroundColor:c.raised,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:10},profileSectionActionText:{color:c.primary,fontSize:13,fontWeight:'800'},profileSectionActionPrimary:{backgroundColor:c.primary,borderColor:c.primary,justifyContent:'center'},profileSectionActionTextPrimary:{color:c.background},profileAddressSummary:{padding:13,borderRadius:14,backgroundColor:c.raised,borderWidth:1,borderColor:c.border,alignItems:'flex-start'},profileAddressName:{color:c.text,fontSize:14,fontWeight:'800',textAlign:'right'},profileAddressLine:{color:c.muted,fontSize:12,lineHeight:19,textAlign:'right',marginTop:3},profileAddressPhone:{color:c.accent,fontSize:11,fontWeight:'700',textAlign:'right',marginTop:7},profileAddressEmpty:{paddingVertical:3,alignItems:'flex-start'},profileAddressEmptyTitle:{color:c.text,fontSize:13,fontWeight:'800',textAlign:'right'},profileThemeRow:{minHeight:66,flexDirection:'row-reverse',alignItems:'center',gap:11,padding:11,borderRadius:14,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},profileThemeIcon:{width:40,height:40,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:c.surface},profileThemeCopy:{flex:1,alignItems:'flex-start'},profileThemeTitle:{color:c.text,fontSize:13,fontWeight:'800',textAlign:'right'},profileThemeHint:{color:c.muted,fontSize:11,marginTop:3,textAlign:'right'},profileThemeState:{minWidth:76,minHeight:40,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingHorizontal:10,borderRadius:13,backgroundColor:c.primary},profileThemeStateText:{color:c.primary,fontSize:11,fontWeight:'800'},profileLogout:{minHeight:48,marginTop:12,flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:9,paddingHorizontal:14,borderRadius:14,borderWidth:1,borderColor:c.danger,backgroundColor:c.raised},profileLogoutText:{color:c.danger,fontSize:13,fontWeight:'800'},
  driverHeaderProfile:{position:'absolute',left:18,top:6,minWidth:58,minHeight:52,alignItems:'center',justifyContent:'center',gap:2},driverHeaderAvatar:{width:42,height:42,borderRadius:21,overflow:'hidden',alignItems:'center',justifyContent:'center',backgroundColor:c.raised,borderWidth:2,borderColor:c.primary},driverHero:{minHeight:92,flexDirection:'row-reverse',alignItems:'center',gap:14,padding:15,marginTop:10,marginBottom:12,borderRadius:24,backgroundColor:'#213D29',borderWidth:1,borderColor:'#57763D',overflow:'hidden'},driverHeroOrb:{width:54,height:54,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#B7FF30'},driverHeroCopy:{flex:1,alignItems:'flex-start'},driverHeroEyebrow:{color:c.primary,fontSize:12,fontWeight:'900',textAlign:'right'},driverHeroTitle:{color:c.text,fontSize:19,fontWeight:'900',textAlign:'right',marginTop:5},driverHeroSubtitle:{color:c.muted,fontSize:11,lineHeight:18,textAlign:'right',marginTop:5},driverPageIntro:{width:'100%',marginTop:14,marginBottom:18,paddingHorizontal:2,alignItems:'flex-start'},driverProfileLoading:{minHeight:75,alignItems:'center',justifyContent:'center',gap:8,marginBottom:12,borderRadius:16,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},driverProfileCard:{padding:17,marginTop:4,marginBottom:18,borderRadius:22,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},driverPhotoRing:{width:104,height:104,alignSelf:'center',overflow:'hidden',alignItems:'center',justifyContent:'center',marginTop:5,borderRadius:52,borderWidth:3,borderColor:c.primary,backgroundColor:c.raised},driverPhotoImage:{width:'100%',height:'100%'},driverPhotoInitial:{color:c.primary,fontSize:38,fontWeight:'900'},driverPhotoButton:{minHeight:42,alignSelf:'center',flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:7,paddingHorizontal:13,marginTop:10,marginBottom:18,borderRadius:13,backgroundColor:c.raised,borderWidth:1,borderColor:c.border},driverPhotoButtonText:{color:c.primary,fontSize:12,fontWeight:'800'},driverRightText:{width:'100%',textAlign:'right'},driverRightContent:{alignItems:'flex-end'},driverInput:{minHeight:54,marginTop:7,marginBottom:14,paddingHorizontal:14,borderRadius:14,borderWidth:1,borderColor:c.border,backgroundColor:c.raised,color:c.text,fontSize:15,fontWeight:'700',fontFamily:'Tajawal_700Bold',textAlign:'right'},driverReadOnlyField:{minHeight:58,justifyContent:'center',paddingHorizontal:13,marginTop:7,marginBottom:14,borderRadius:14,borderWidth:1,borderColor:c.border,backgroundColor:c.raised},driverEmailText:{color:c.text,fontSize:13,textAlign:'right',writingDirection:'ltr'},driverFieldHint:{width:'100%',color:c.muted,fontSize:10,textAlign:'right',marginTop:5},driverPhoneRow:{minHeight:56,flexDirection:'row',alignItems:'center',gap:9,marginTop:7,borderRadius:14,borderWidth:1,borderColor:c.border,backgroundColor:c.raised,paddingHorizontal:10},driverPhoneInput:{flex:1,minWidth:0,minHeight:50,paddingHorizontal:6,color:c.text,fontSize:16,fontWeight:'800',textAlign:'right',writingDirection:'ltr'},driverCountryCode:{minHeight:38,flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:10,borderRadius:11,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},driverCountryCodeText:{color:c.text,fontSize:13,fontWeight:'900'},driverCountryFlag:{fontSize:17},driverRequired:{color:c.accent,fontSize:10,fontWeight:'800'},driverSaveButton:{minHeight:54,alignItems:'center',justifyContent:'center',marginTop:8,marginBottom:16,borderRadius:15,backgroundColor:c.primary},driverSaveButtonText:{color:c.background,fontSize:15,fontWeight:'900'},completeDriverProfile:{minHeight:56,alignItems:'center',justifyContent:'center',marginTop:12,marginBottom:14,paddingHorizontal:12,borderRadius:15,backgroundColor:c.primary},completeDriverProfileText:{color:c.background,fontSize:13,fontWeight:'900',textAlign:'center'},driverOrdersShortcut:{minHeight:69,flexDirection:'row-reverse',alignItems:'center',gap:11,paddingHorizontal:13,marginTop:3,marginBottom:13,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},driverShortcutIcon:{width:42,height:42,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:c.raised},driverShortcutTitle:{color:c.text,fontSize:13,fontWeight:'900',textAlign:'right'},driverShortcutCopy:{color:c.muted,fontSize:10,marginTop:4,textAlign:'right'},driverOnboardingCard:{width:'100%',marginTop:18,padding:20,borderRadius:23,borderWidth:1,borderColor:'#597344',backgroundColor:'#1B2B20'},driverOnboardingIcon:{width:58,height:58,alignSelf:'flex-end',alignItems:'center',justifyContent:'center',marginBottom:16,borderRadius:19,backgroundColor:c.primary},driverOnboardingStep:{color:c.accent,fontSize:11,fontWeight:'900',textAlign:'right'},driverOnboardingTitle:{color:c.text,fontSize:25,fontWeight:'900',textAlign:'right',marginTop:5},driverOnboardingCopy:{color:c.muted,fontSize:13,lineHeight:22,textAlign:'right',marginTop:8},driverOnboardingList:{gap:12,marginTop:21,padding:15,borderRadius:16,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},driverOnboardingListItem:{color:c.text,fontSize:12,lineHeight:20,fontWeight:'700',textAlign:'right'},driverOnboardingButton:{minHeight:56,alignItems:'center',justifyContent:'center',marginTop:19,borderRadius:15,backgroundColor:c.primary},driverOnboardingButtonText:{color:c.background,fontSize:14,fontWeight:'900'},

  driverHomePanel:{padding:0,borderWidth:0,borderRadius:0,backgroundColor:'transparent'},driverAvailabilityHero:{padding:16,marginBottom:14,borderRadius:21,borderWidth:1,borderColor:'#3C5843',backgroundColor:'#17251C'},driverAvailabilityHeroOn:{borderColor:c.primary,backgroundColor:'#1E3323'},driverAvailabilityHeroTop:{minHeight:60,flexDirection:'row-reverse',alignItems:'center',gap:12,marginBottom:13},driverAvailabilityHeroIcon:{width:46,height:46,alignItems:'center',justifyContent:'center',borderRadius:15,backgroundColor:c.raised},driverAvailabilityHeroIconOn:{backgroundColor:c.primary},driverAvailabilityHeroCopy:{flex:1,alignItems:'flex-end'},driverAvailabilityState:{color:c.text,fontSize:17,fontWeight:'900',textAlign:'right'},driverAvailabilityStateOn:{color:'#DFFFAD'},driverAvailabilityHint:{color:c.muted,fontSize:11,textAlign:'right',marginTop:4},driverAvailabilityAction:{minHeight:56,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:10,paddingHorizontal:14,borderRadius:14,backgroundColor:c.primary},driverAvailabilityActionOn:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border},driverAvailabilityActionText:{color:c.background,fontSize:13,fontWeight:'900'},driverAvailabilityActionTextOn:{color:c.text},driverSwitchTrack:{width:48,height:28,justifyContent:'center',padding:3,borderRadius:15,backgroundColor:'#26362D'},driverSwitchTrackOn:{backgroundColor:'#486D34'},driverSwitchThumb:{width:22,height:22,alignSelf:'flex-start',borderRadius:11,backgroundColor:'#A6B5AA'},driverSwitchThumbOn:{alignSelf:'flex-end',backgroundColor:'#B7FF30'},driverAvailabilityOffline:{color:'#9FC7E8',fontSize:12,lineHeight:19,textAlign:'right',marginTop:10},driverCommissionSummary:{position:'relative',minHeight:68,alignItems:'stretch',justifyContent:'center',gap:11,paddingHorizontal:13,marginBottom:13,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},driverCommissionBadge:{position:'absolute',left:13,top:'50%',transform:[{translateY:-20}],width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:c.raised},driverCommissionTitle:{color:c.text,fontSize:12,fontWeight:'900',textAlign:'right',writingDirection:'rtl'},driverCommissionCopy:{color:c.muted,fontSize:10,lineHeight:16,textAlign:'right',writingDirection:'rtl',marginTop:4},driverOrdersSkeleton:{minHeight:132,padding:15,marginBottom:15,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,justifyContent:'center'},driverSkeletonTop:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',marginBottom:15},driverSkeletonPill:{width:76,height:19,borderRadius:10,backgroundColor:c.raised},driverSkeletonLine:{height:10,width:'43%',borderRadius:6,backgroundColor:c.raised,marginBottom:10,alignSelf:'flex-end'},driverSkeletonButton:{width:116,height:36,alignSelf:'flex-start',marginTop:3,borderRadius:11,backgroundColor:c.raised},driverFooter:{flexDirection:'row',alignItems:'center',gap:3,borderTopWidth:1,borderTopColor:c.border,paddingTop:6,paddingBottom:6,paddingHorizontal:5,backgroundColor:c.background},driverFooterButton:{flex:1,minWidth:0,minHeight:58,alignItems:'center',justifyContent:'center',gap:1,borderRadius:14,paddingHorizontal:2},driverFooterButtonActive:{backgroundColor:c.primary},driverFooterIconWrap:{width:26,height:27,alignItems:'center',justifyContent:'center'},driverFooterLabel:{color:c.muted,fontSize:10,fontWeight:'700',textAlign:'center'},driverFooterLabelActive:{color:c.background,fontSize:10,fontWeight:'900'},driverTabBadge:{position:'absolute',right:-5,top:-4,minWidth:16,height:16,alignItems:'center',justifyContent:'center',paddingHorizontal:3,borderRadius:8,backgroundColor:c.danger,borderWidth:1,borderColor:c.background},driverTabBadgeText:{color:'#fff',fontSize:8,fontWeight:'900'},hidden:{display:'none'},notificationSummaryStandalone:{minHeight:57},notificationCardStandalone:{padding:0,marginBottom:12,borderWidth:0,backgroundColor:'transparent'},notificationListStandalone:{borderTopWidth:0,marginTop:12,gap:12},notificationItemStandalone:{minHeight:92,alignItems:'center',gap:13,paddingHorizontal:14,paddingVertical:14,borderWidth:1,borderColor:c.border,borderRadius:20,backgroundColor:c.surface},notificationItemCopyStandalone:{flex:1,minWidth:0},notificationItemTitleStandalone:{fontSize:15,lineHeight:22,fontWeight:'900'},notificationItemBodyStandalone:{fontSize:13,lineHeight:21,marginTop:5},notificationItemMetaStandalone:{fontSize:10,marginTop:9},notificationItemUnread:{backgroundColor:'#1E3323',borderColor:'#3F6A2E',borderRightWidth:4,borderRightColor:c.primary},notificationMarkAllStandalone:{backgroundColor:c.primary,borderColor:c.primary},notificationMarkAllStandaloneText:{color:'#17210F'},notificationLoadMore:{minHeight:46,alignItems:'center',justifyContent:'center',marginTop:5,borderRadius:13,borderWidth:1,borderColor:c.border,backgroundColor:c.raised},notificationLoadMoreText:{color:c.primary,fontSize:12,fontWeight:'800'},
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
  oTab:{flex:1,minHeight:54,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10,borderRadius:17},oTabOn:{backgroundColor:c.primary},oTabText:{color:c.text,fontSize:16,fontWeight:'800'},oTabTextOn:{color:'#0B1411',fontWeight:'900'},oTabCount:{minWidth:28,height:28,paddingHorizontal:8,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:c.surface,borderWidth:1,borderColor:c.border},oTabCountOn:{backgroundColor:'#0B1411',borderColor:'#0B1411'},oTabCountHot:{backgroundColor:c.primary,borderColor:c.primary},oTabCountText:{color:c.text,fontSize:15,fontWeight:'900'},oTabCountTextOn:{color:c.primary},oTabCountTextHot:{color:'#0B1411'},
  radarStage:{height:300,alignItems:'center',justifyContent:'center',marginTop:2},radarButton:{width:150,height:150,borderRadius:75,alignItems:'center',justifyContent:'center',gap:6},radarButtonOn:{backgroundColor:c.primary,borderWidth:0},radarButtonOff:{backgroundColor:c.surface,borderWidth:2,borderStyle:'dashed',borderColor:c.border},radarButtonText:{color:c.muted,fontSize:15,fontWeight:'900'},radarButtonTextOn:{color:'#0B1411'},radarState:{alignItems:'center',marginTop:-6,marginBottom:4},radarStateTitle:{color:c.text,fontSize:22,fontWeight:'900',textAlign:'center'},radarStateHint:{color:c.muted,fontSize:13.5,marginTop:4,textAlign:'center'},
  homeGreeting:{width:'100%',marginTop:6,marginBottom:2,alignItems:'flex-end'},homeGreetingTitle:{alignSelf:'stretch',color:c.text,fontSize:22,fontWeight:'900',textAlign:'right',writingDirection:'rtl'},homeGreetingSub:{alignSelf:'stretch',color:c.muted,fontSize:12.5,marginTop:3,textAlign:'right',writingDirection:'rtl'},
  homePills:{flexDirection:'row',gap:9,marginTop:16,marginBottom:12},homePill:{flex:1,alignItems:'center',paddingVertical:12,paddingHorizontal:6,borderRadius:20,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},homePillHot:{borderColor:c.primary},homePillValue:{color:c.primary,fontSize:24,fontWeight:'900'},homePillLabel:{color:c.muted,fontSize:11.5,marginTop:2,textAlign:'center'},
  homeLive:{borderRadius:22,padding:14,marginBottom:12,backgroundColor:c.surface,borderWidth:1,borderColor:c.primary,borderRightWidth:4},homeLiveHead:{flexDirection:'row-reverse',marginBottom:8},homeLiveKicker:{color:c.primary,fontSize:12.5,fontWeight:'900'},homeLiveMain:{flexDirection:'row-reverse',alignItems:'flex-end',justifyContent:'space-between',gap:10},homeLiveTitle:{color:c.text,fontSize:15,fontWeight:'800',textAlign:'right'},homeLiveSub:{color:c.muted,fontSize:12.5,marginTop:3,textAlign:'right'},homeLiveFee:{color:c.primary,fontSize:22,fontWeight:'900'},homeLiveFeeUnit:{color:c.muted,fontSize:12,fontWeight:'500'},homeLiveCta:{marginTop:12,minHeight:46,borderRadius:15,backgroundColor:c.primary,alignItems:'center',justifyContent:'center'},homeLiveCtaText:{color:'#0B1411',fontSize:14.5,fontWeight:'900'},
  homeActive:{flexDirection:'row-reverse',alignItems:'center',gap:12,padding:14,marginBottom:12,borderRadius:22,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},homeActiveIcon:{width:46,height:46,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:c.raised,borderWidth:1,borderColor:c.border},homeActiveTitle:{color:c.text,fontSize:15,fontWeight:'900',textAlign:'right'},homeActiveSub:{color:c.muted,fontSize:12.5,marginTop:2,textAlign:'right'},
  balanceLabel:{color:c.muted,fontSize:14,textAlign:'center'},balanceValue:{color:c.primary,fontSize:40,fontWeight:'900',textAlign:'center',marginTop:6},balanceUnit:{fontSize:20,fontWeight:'800'},balanceBadge:{marginTop:12,paddingHorizontal:14,minHeight:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:c.raised,borderWidth:1,borderColor:c.border},balanceBadgeDue:{borderColor:'#C98A2B'},balanceBadgeText:{color:c.accent,fontSize:13,fontWeight:'800',textAlign:'center'},balanceBadgeTextDue:{color:'#F0CC83'},
  liveCard:{borderRadius:26,borderWidth:1.5,borderColor:'#57763D',backgroundColor:c.background,padding:18,gap:12,shadowColor:c.primary,shadowOpacity:0.25,shadowRadius:22,shadowOffset:{width:0,height:0},elevation:6},liveCardTop:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'},liveCardCode:{color:c.accent,fontSize:15,fontWeight:'900',writingDirection:'ltr'},liveBadge:{minHeight:38,paddingHorizontal:16,borderRadius:19,backgroundColor:c.primary,alignItems:'center',justifyContent:'center'},liveBadgeText:{color:'#0B1411',fontSize:14,fontWeight:'900'},liveRow:{flexDirection:'row-reverse',alignItems:'flex-start',gap:8},liveDot:{width:10,height:10,borderRadius:5,marginTop:8},liveRowLabel:{color:c.text,fontSize:16,fontWeight:'900'},liveRowValue:{flex:1,color:c.muted,fontSize:16,lineHeight:24,textAlign:'right'},liveDivider:{height:1,backgroundColor:c.border},liveStats:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:10},liveStat:{color:c.muted,fontSize:15},liveStatValue:{color:c.text,fontSize:16,fontWeight:'900'},liveAccept:{minHeight:62,borderRadius:22,backgroundColor:c.primary,alignItems:'center',justifyContent:'center',shadowColor:c.primary,shadowOpacity:0.35,shadowRadius:14,shadowOffset:{width:0,height:4},elevation:5},liveAcceptText:{color:'#0B1411',fontSize:19,fontWeight:'900'},liveSecondary:{flex:1.6,minHeight:56,borderRadius:20,borderWidth:1,borderColor:c.primary,backgroundColor:c.raised,alignItems:'center',justifyContent:'center'},liveSecondaryText:{color:c.primary,fontSize:15,fontWeight:'900'},liveClose:{flex:1,minHeight:56,borderRadius:20,borderWidth:1,borderColor:c.border,backgroundColor:c.background,alignItems:'center',justifyContent:'center'},liveCloseText:{color:c.text,fontSize:15,fontWeight:'900'},
  versionStamp:{color:c.muted,fontSize:11,textAlign:'center',marginTop:14,opacity:0.8},
};
