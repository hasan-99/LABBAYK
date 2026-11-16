import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';
type ToastItem = { id: number; message: string; tone: ToastTone };
type ToastContextValue = { showToast: (message: string, tone?: ToastTone) => void };
const ToastContext = createContext<ToastContextValue | null>(null);
function toneFor(message: string): ToastTone {
  if (/ما قدرنا|ما انحفظ|ما تمت|ما انضاف|ما انرسل|تعذر|خطأ|غير صحيح|غير صحيحة|انتهى العرض|ما فينا|غير متاح|ناقص/.test(message)) return 'error';
  if (/اختار|اكتب|أدخل|تحقق|لازم|انتظر|بانتظار|غير مؤكدة|تحتاج اتصال|يحتاج اتصال|منطقة.*فعالة/.test(message)) return 'warning';
  if (/تم |تمت |تأكد|انحفظ|انحذ|انرسل|وصلنا|وصل البلاغ|انضاف|انضافت|وافقت|رفضت|اعتذرت|بدأ التوصيل|الرابط جاهز/.test(message)) return 'success';
  return 'info';
}

export function ToastProvider({ children, theme = 'dark' }: { children: React.ReactNode; theme?: 'dark' | 'light' }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const nextId = useRef(0);
  const lastShown = useRef<{ message: string; at: number } | null>(null);
  const showToast = useCallback((message: string, tone?: ToastTone) => {
    const clean = message.trim();
    if (!clean) return;
    const now = Date.now();
    if (lastShown.current?.message === clean && now - lastShown.current.at < 900) return;
    lastShown.current = { message: clean, at: now };
    setToast({ id: ++nextId.current, message: clean, tone: tone ?? toneFor(clean) });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);
  const context = useMemo(() => ({ showToast }), [showToast]);
  return <ToastContext.Provider value={context}>
    <View style={styles.root}>{children}<ToastViewport toast={toast} onDismiss={dismissToast} theme={theme} /></View>
  </ToastContext.Provider>;
}

function ToastViewport({ toast, onDismiss, theme }: { toast: ToastItem | null; onDismiss: () => void; theme: 'dark' | 'light' }) {
  const [offset] = useState(() => new Animated.Value(-18));
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!toast) return;
    offset.setValue(-18); opacity.setValue(0);
    Animated.parallel([
      Animated.spring(offset, { toValue: 0, damping: 18, stiffness: 210, mass: 0.7, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(onDismiss, toast.tone === 'error' ? 5200 : 3900);
    return () => clearTimeout(timer);
  }, [toast, offset, opacity, onDismiss]);
  if (!toast) return null;
  const palette = {
    success: { accent: theme === 'dark' ? '#B7FF30' : '#287A55', icon: '✓', label: 'تم بنجاح' },
    error: { accent: theme === 'dark' ? '#FF8A8A' : '#B42318', icon: '×', label: 'صار خطأ' },
    warning: { accent: theme === 'dark' ? '#FFD166' : '#875A00', icon: '!', label: 'تنبيه' },
    info: { accent: theme === 'dark' ? '#80CAFF' : '#176B9A', icon: 'i', label: 'معلومة' },
  }[toast.tone];
  return <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.viewport}>
    <Animated.View accessibilityRole={toast.tone === 'error' ? 'alert' : 'summary'} accessibilityLiveRegion={toast.tone === 'error' ? 'assertive' : 'polite'} style={[styles.toast, theme === 'light' && styles.toastLight, { borderRightColor: palette.accent, opacity, transform: [{ translateY: offset }] }]}>
      <View style={[styles.icon, { backgroundColor: `${palette.accent}20`, borderColor: `${palette.accent}55` }]}><AppText style={[styles.iconText, { color: palette.accent }]}>{palette.icon}</AppText></View>
      <View style={styles.copy}><AppText style={[styles.label, { color: palette.accent }]}>{palette.label}</AppText><AppText style={[styles.message, theme === 'light' && styles.messageLight]}>{toast.message}</AppText></View>
      <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="إغلاق التنبيه" style={styles.close}><AppText style={[styles.closeText, theme === 'light' && styles.closeTextLight]}>×</AppText></Pressable>
      <View style={[styles.progress, { backgroundColor: palette.accent }]} />
    </Animated.View>
  </SafeAreaView>;
}

export function useAppToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useAppToast must be used inside ToastProvider');
  return context.showToast;
}

export function useToastMessage(): [string, (message: string) => void] {
  const [message, setMessageState] = useState('');
  const showToast = useAppToast();
  const setMessage = useCallback((next: string) => {
    setMessageState(next);
    if (next) showToast(next);
  }, [showToast]);
  return [message, setMessage];
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  viewport: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', paddingHorizontal: 14, zIndex: 10000, elevation: 30 },
  toast: { position: 'relative', width: '100%', maxWidth: 460, minHeight: 72, flexDirection: 'row-reverse', alignItems: 'center', gap: 11, overflow: 'hidden', paddingHorizontal: 13, paddingVertical: 12, borderRadius: 17, borderWidth: 1, borderColor: '#34483B', borderRightWidth: 4, backgroundColor: '#142019', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 7 }, elevation: 10 },
  toastLight: { borderColor: '#D5DFD6', backgroundColor: '#FFFFFF', shadowColor: '#24352A', shadowOpacity: 0.12 },
  icon: { width: 34, height: 34, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 18, fontWeight: '900' },
  copy: { flex: 1, gap: 2, alignItems: 'flex-start' },
  label: { fontSize: 10, fontWeight: '900' },
  message: { color: '#EFF5F0', fontSize: 12, lineHeight: 18, textAlign: 'right' },
  messageLight: { color: '#18251C' },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  closeText: { color: '#9AAC9F', fontSize: 23, fontWeight: '500' },
  closeTextLight: { color: '#58675D' },
  progress: { position: 'absolute', right: 0, bottom: 0, height: 2, width: '100%', opacity: 0.8 },
});
