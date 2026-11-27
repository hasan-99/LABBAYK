import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { AppText as Text } from '@/components/AppText';
import { supabase } from '@/lib/supabase';
import { computeCountdown, estimateServerOffset, formatClock, formatEta, hasCountdown, toArabicDigits, type Countdown } from '@/lib/delivery-countdown';

// Database clock minus phone clock. Shared by every card so the request is made once, and kept
// when the connection drops so the countdown keeps running from the last known good value.
let serverOffsetMs = 0;
let offsetFetchedAt = 0;
let offsetRequest: Promise<void> | null = null;
const OFFSET_MAX_AGE_MS = 10 * 60 * 1000;

function refreshServerOffset() {
  if (!supabase || offsetRequest || (offsetFetchedAt && Date.now() - offsetFetchedAt < OFFSET_MAX_AGE_MS)) return offsetRequest ?? Promise.resolve();
  const sentAt = Date.now();
  offsetRequest = Promise.resolve(supabase.rpc('server_now')).then(({ data, error }) => {
    if (error || typeof data !== 'string') return;
    const offset = estimateServerOffset(data, sentAt, Date.now());
    if (offset !== null) { serverOffsetMs = offset; offsetFetchedAt = Date.now(); }
  }).catch(() => undefined).finally(() => { offsetRequest = null; });
  return offsetRequest;
}

export function useDeliveryCountdown(acceptedAt: string | null | undefined, online: boolean): Countdown | null {
  const [clock, setClock] = useState(() => ({ now: Date.now(), offset: serverOffsetMs }));
  const sync = useCallback(() => setClock({ now: Date.now(), offset: serverOffsetMs }), []);
  useEffect(() => {
    if (!acceptedAt) return;
    let active = true;
    const refresh = () => { sync(); if (online) void refreshServerOffset().then(() => { if (active) sync(); }); };
    refresh();
    // Timers pause while the app is in the background, so recompute from the clock when it comes back.
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { active = false; subscription.remove(); };
  }, [acceptedAt, online, sync]);
  const countdown = computeCountdown(acceptedAt, clock.now, clock.offset);
  const running = !!countdown && countdown.phase !== 'late';
  // One tick per second while time is left. At zero the interval stops and the card shows the late message,
  // so the screen never freezes on 00:00.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(sync, 1000);
    return () => clearInterval(id);
  }, [running, acceptedAt, sync]);
  return countdown;
}

const INK = '#17210F';
const PHASE_COLOR = { ok: '#B7FF30', warn: '#FFB547', late: '#FF8A7A' } as const;
const STAGE_LABEL: Record<string, string> = {
  accepted: 'السائق قبل طلبك', assigned: 'السائق قبل طلبك', shopping: 'عم نجهّز طلبك', awaiting_approval: 'عم نجهّز طلبك', purchased: 'تم الشراء', delivering: 'بالطريق إلك',
};
const TAG_LABEL: Record<string, string> = { accepted: 'جديد', assigned: 'جديد', shopping: 'عم نجهّز', awaiting_approval: 'عم نجهّز', purchased: 'عم نجهّز', delivering: 'بالطريق' };

type CardProps = { acceptedAt: string | null | undefined; status: string; online: boolean; onPress: () => void };

export function DeliveryCountdownCard({ acceptedAt, status, online, onPress }: CardProps) {
  const countdown = useDeliveryCountdown(acceptedAt, online);
  if (!countdown || !hasCountdown(status, acceptedAt)) return null;
  const { phase, remainingSeconds, progress, etaMs } = countdown;
  const clock = formatClock(remainingSeconds);
  const tag = phase === 'late' ? 'تأخّر شوي' : phase === 'warn' ? 'قرّب' : (TAG_LABEL[status] ?? 'جاري');
  const percent = `${Math.round(progress * 100)}%` as const;
  const label = phase === 'late'
    ? 'تأخّرنا شوي، السائق قرّب'
    : `الوقت المتبقي ${toArabicDigits(Math.ceil(remainingSeconds / 60))} دقيقة`;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${STAGE_LABEL[status] ?? 'طلبك جارٍ'}. ${label}. تتبّع الطلب`}
    style={{ backgroundColor: PHASE_COLOR[phase], borderRadius: 26, paddingHorizontal: 16, paddingTop: 13, paddingBottom: 11, gap: 6, marginBottom: 10, overflow: 'hidden' }}>
    <View style={{ position: 'absolute', right: -30, bottom: -60, width: 150, height: 150, borderRadius: 75, backgroundColor: INK, opacity: 0.08 }} />
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <Text style={{ color: INK, fontSize: 13, fontWeight: '800' }}>{STAGE_LABEL[status] ?? 'طلبك جارٍ'}</Text>
      <View style={{ backgroundColor: INK, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 }}><Text style={{ color: PHASE_COLOR[phase], fontSize: 11, fontWeight: '800' }}>{tag}</Text></View>
    </View>
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 62 }}>
      {phase === 'late'
        ? <Text style={{ color: INK, fontSize: 25, lineHeight: 34, fontWeight: '900', textAlign: 'right' }}>تأخّرنا شوي،{'\n'}السائق قرّب</Text>
        : <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline', gap: 6 }}>
            <Text style={{ color: INK, fontSize: 52, lineHeight: 62, fontWeight: '900', writingDirection: 'ltr', fontVariant: ['tabular-nums'] }}>{clock.minutes}:{clock.seconds}</Text>
            <Text style={{ color: INK, fontSize: 13, fontWeight: '700', opacity: 0.7 }}>دقيقة</Text>
          </View>}
    </View>
    <View style={{ height: 30, marginHorizontal: 6, marginTop: 2 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ position: 'absolute', left: 0, right: 0, top: 16, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: INK, opacity: 0.35 }} />
      <View style={{ position: 'absolute', right: 0, top: 15, width: percent, height: 4, borderRadius: 2, backgroundColor: INK }} />
      <View style={{ position: 'absolute', right: -6, top: 11, width: 12, height: 12, borderRadius: 6, backgroundColor: INK }} />
      <Text style={{ position: 'absolute', left: -8, top: 2, fontSize: 20 }}>🏠</Text>
      <View style={{ position: 'absolute', right: percent, top: 0, width: 0, alignItems: 'center' }}><Text style={{ fontSize: 24, lineHeight: 28 }}>🛵</Text></View>
    </View>
    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 8 }}>
      <Text style={{ color: INK, fontSize: 12, fontWeight: '800' }}>{online ? 'من المحل' : 'ما في اتصال بالإنترنت'}</Text>
      <Text style={{ color: INK, fontSize: 12, fontWeight: '800' }}>{phase === 'late' ? 'تتبّع الطلب ‹' : `الوصول المتوقع ${formatEta(etaMs)}`}</Text>
    </View>
  </Pressable>;
}

// One-line version for the driver and admin screens.
export function DeliveryCountdownChip({ acceptedAt, status, online = true, audience }: { acceptedAt: string | null | undefined; status: string; online?: boolean; audience: 'driver' | 'admin' }) {
  const countdown = useDeliveryCountdown(acceptedAt, online);
  if (!countdown || !hasCountdown(status, acceptedAt)) return null;
  const { phase, remainingSeconds } = countdown;
  const clock = formatClock(remainingSeconds);
  const color = PHASE_COLOR[phase];
  const text = phase === 'late'
    ? (audience === 'driver' ? 'تجاوزت مهلة التوصيل (٤٥ دقيقة)' : 'تجاوز مهلة التوصيل (٤٥ دقيقة)')
    : `${audience === 'driver' ? 'الوقت المتبقي للتسليم' : 'المتبقي من مهلة التوصيل'} ${clock.minutes}:${clock.seconds}`;
  return <View accessibilityRole="timer" accessibilityLabel={text} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 7, alignSelf: 'flex-end', backgroundColor: '#1B2B20', borderColor: color, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, minHeight: 30 }}>
    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    <Text style={{ color, fontSize: 12.5, fontWeight: '800' }}>{text}</Text>
  </View>;
}
