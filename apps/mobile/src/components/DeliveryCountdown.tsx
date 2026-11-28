import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Pressable, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { AppText as Text } from '@/components/AppText';
import { supabase } from '@/lib/supabase';
import { arrivalSecondsLeft, computeCountdown, estimateServerOffset, formatClock, formatEta, hasCountdown, journeyLine, parseAcceptedAt, toArabicDigits, type Countdown } from '@/lib/delivery-countdown';
import { BAG_XML, JASMINE_XML, PALETTES, RAIN_XML, SCOOTER_VIEWBOX, SCOOTER_WHEELS, SKY_HEIGHT, SPOKES_XML, TILE, cloudsXml, farXml, houseXml, midXml, nearXml, scooterXml, skyXml, streetXml, timeOfDay, type TimeOfDay } from '@/lib/delivery-scene';

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

const PHASE_COLOR = { ok: '#B7FF30', warn: '#FFB547', late: '#FF8A7A' } as const;
const CARD_HEIGHT = 132;

// Loops run on the native thread. When the person asked for reduced motion they stay still.
function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReduce(value); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { active = false; sub.remove(); };
  }, []);
  return reduce;
}

function useLoop(duration: number, enabled: boolean, yoyo = false) {
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    value.setValue(0);
    if (!enabled) return;
    const step = Animated.timing(value, { toValue: 1, duration, easing: yoyo ? Easing.inOut(Easing.quad) : Easing.linear, useNativeDriver: true });
    const animation = Animated.loop(yoyo ? Animated.sequence([step, Animated.timing(value, { toValue: 0, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true })]) : step);
    animation.start();
    return () => animation.stop();
  }, [value, duration, enabled, yoyo]);
  return value;
}

function useTimeOfDay() {
  const [tod, setTod] = useState<TimeOfDay>(() => timeOfDay(new Date().getHours()));
  useEffect(() => {
    const id = setInterval(() => setTod(timeOfDay(new Date().getHours())), 60 * 1000);
    return () => clearInterval(id);
  }, []);
  return tod;
}

function ScrollingLayer({ xml, height, bottom, duration, moving, z = 1 }: { xml: string; height: number; bottom: number; duration: number; moving: boolean; z?: number }) {
  const loop = useLoop(duration, moving);
  const translateX = loop.interpolate({ inputRange: [0, 1], outputRange: [-TILE, 0] });
  return <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, bottom, width: TILE * 2, height, zIndex: z, transform: [{ translateX }] }}>
    <SvgXml xml={xml} width={TILE * 2} height={height} />
  </Animated.View>;
}

// The sky, sun or moon, stars, clouds, the four street layers and the road. Shared by the journey and arrival cards.
function StreetScene({ tod, moving, dim = false }: { tod: TimeOfDay; moving: boolean; dim?: boolean }) {
  const palette = PALETTES[tod];
  const layers = useMemo(() => ({ sky: skyXml(palette), far: farXml(palette), mid: midXml(palette), near: nearXml(palette), street: streetXml(palette), clouds: cloudsXml() }), [palette]);
  const lane = useLoop(500, moving);
  const laneX = lane.interpolate({ inputRange: [0, 1], outputRange: [0, -40] });
  const orb = tod === 'night'
    ? { top: 16, left: 34, size: 22, color: '#F4F1DE' }
    : tod === 'day' ? { top: 14, left: 30, size: 30, color: '#FFE98A' } : { top: 54, left: 40, size: 42, color: '#FFD27A' };
  return <>
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}><SvgXml xml={layers.sky} width="100%" height="100%" /></View>
    {tod !== 'day' ? [[14, 22], [38, 12], [58, 30], [72, 10], [86, 26], [26, 40]].map(([x, y], index) => <View key={index} pointerEvents="none" style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: 2, height: 2, borderRadius: 1, backgroundColor: '#FFFFFF', opacity: tod === 'night' ? 0.9 : 0.35 }} />) : null}
    <View pointerEvents="none" style={{ position: 'absolute', top: orb.top, left: orb.left, width: orb.size, height: orb.size, borderRadius: orb.size / 2, backgroundColor: orb.color, shadowColor: orb.color, shadowOpacity: 0.8, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } }} />
    {tod !== 'night' ? <View pointerEvents="none" style={{ position: 'absolute', top: 8, left: 0, opacity: tod === 'day' ? 0.9 : 0.35 }}><ScrollingLayer xml={layers.clouds} height={SKY_HEIGHT.clouds} bottom={0} duration={120000} moving={moving} /></View> : null}
    <ScrollingLayer xml={layers.far} height={SKY_HEIGHT.far} bottom={30} duration={110000} moving={moving} />
    <ScrollingLayer xml={layers.mid} height={SKY_HEIGHT.mid} bottom={30} duration={54000} moving={moving} />
    <ScrollingLayer xml={layers.near} height={SKY_HEIGHT.near} bottom={24} duration={26000} moving={moving} />
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 26, zIndex: 2, backgroundColor: palette.street, borderTopWidth: 3, borderTopColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
      <Animated.View style={{ flexDirection: 'row', gap: 22, marginTop: 9, width: 1200, transform: [{ translateX: laneX }] }}>{Array.from({ length: 30 }, (_, i) => <View key={i} style={{ width: 18, height: 2.5, backgroundColor: 'rgba(255,255,255,0.75)' }} />)}</Animated.View>
    </View>
    <ScrollingLayer xml={layers.street} height={SKY_HEIGHT.street} bottom={14} duration={10000} moving={moving} z={3} />
    {dim ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 4, backgroundColor: '#000000', opacity: 0.34 }} /> : null}
  </>;
}

const RIDER_SCALE = 92 / 140; // the scooter keeps the size it had in the approved design
const riderWidth = SCOOTER_VIEWBOX.w * RIDER_SCALE;
const riderHeight = SCOOTER_VIEWBOX.h * RIDER_SCALE;
const wheelSize = 15 * RIDER_SCALE;

function Rider({ progress, headlight, moving }: { progress: number; headlight: boolean; moving: boolean }) {
  const xml = useMemo(() => scooterXml(headlight), [headlight]);
  const bob = useLoop(380, moving, true);
  const spin = useLoop(400, moving);
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -1.6] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });
  return <Animated.View pointerEvents="none" style={{ position: 'absolute', bottom: 4, right: `${6 + progress * 58}%`, width: riderWidth, height: riderHeight, zIndex: 5, transform: [{ translateY }] }}>
    <SvgXml xml={xml} width={riderWidth} height={riderHeight} />
    {SCOOTER_WHEELS.map((wheel) => <Animated.View key={wheel.cx} style={{ position: 'absolute', left: (wheel.cx - SCOOTER_VIEWBOX.x) * RIDER_SCALE - wheelSize / 2, top: (wheel.cy - SCOOTER_VIEWBOX.y) * RIDER_SCALE - wheelSize / 2, width: wheelSize, height: wheelSize, transform: [{ rotate }] }}><SvgXml xml={SPOKES_XML} width={wheelSize} height={wheelSize} /></Animated.View>)}
  </Animated.View>;
}

function Rain() {
  const loop = useLoop(400, true);
  const translateY = loop.interpolate({ inputRange: [0, 1], outputRange: [-70, 0] });
  return <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 6, overflow: 'hidden' }}>
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#1A0A10', opacity: 0.35 }} />
    <Animated.View style={{ position: 'absolute', top: 0, left: 0, opacity: 0.6, transform: [{ translateY }] }}><SvgXml xml={RAIN_XML} width={420} height={140} /></Animated.View>
  </View>;
}

type CardProps = { acceptedAt: string | null | undefined; status: string; online: boolean; onPress: () => void };

export function DeliveryCountdownCard({ acceptedAt, status, online, onPress }: CardProps) {
  const countdown = useDeliveryCountdown(acceptedAt, online);
  const tod = useTimeOfDay();
  const reduce = useReduceMotion();
  const houseXmlMemo = useMemo(() => houseXml('#B7FF30', PALETTES[tod].win), [tod]);
  if (!countdown || !hasCountdown(status, acceptedAt)) return null;
  const { phase, remainingSeconds, progress, etaMs } = countdown;
  const accent = PHASE_COLOR[phase];
  const minutes = Math.ceil(remainingSeconds / 60);
  const line = journeyLine(status, phase);
  const sub = !online ? 'ما في اتصال بالإنترنت' : phase === 'late' ? 'السائق على بعد دقائق' : `الوصول المتوقع ${formatEta(etaMs)}`;
  const moving = !reduce;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${line}. ${phase === 'late' ? 'تأخر بسيط' : `باقي ${toArabicDigits(minutes)} دقيقة`}. تتبّع الطلب`}
    style={{ height: CARD_HEIGHT, borderRadius: 16, overflow: 'hidden', marginBottom: 10, backgroundColor: PALETTES[tod].sky[0] }}>
    <StreetScene tod={tod} moving={moving} />
    <View pointerEvents="none" style={{ position: 'absolute', left: 6, bottom: 22, width: 78, height: 66, zIndex: 4 }}><SvgXml xml={houseXmlMemo} width={78} height={66} /></View>
    <Rider progress={progress} headlight={tod !== 'day'} moving={moving} />
    {phase === 'late' ? <Rain /> : null}
    <View pointerEvents="none" style={{ position: 'absolute', top: 11, left: 12, right: 12, zIndex: 8, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
      <View style={{ maxWidth: '66%', backgroundColor: 'rgba(8,14,18,0.55)', borderColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 }}>
        <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 14.5, fontWeight: '800', textAlign: 'right' }}>{line}</Text>
        <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11.5, fontWeight: '500', textAlign: 'right', marginTop: 1 }}>{sub}</Text>
      </View>
      <View style={{ backgroundColor: accent, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6, alignItems: 'center', shadowColor: accent, shadowOpacity: 0.7, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } }}>
        {phase === 'late'
          ? <Text style={{ color: '#0E160F', fontSize: 17, fontWeight: '900' }}>قرّب</Text>
          : <><Text style={{ color: '#0E160F', fontSize: 17, lineHeight: 19, fontWeight: '900' }}>{toArabicDigits(minutes)}</Text><Text style={{ color: '#0E160F', fontSize: 10, fontWeight: '700', opacity: 0.75 }}>دقيقة</Text></>}
      </View>
    </View>
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, zIndex: 7, backgroundColor: 'rgba(255,255,255,0.12)' }}>
      <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${progress * 100}%`, backgroundColor: accent }} />
    </View>
  </Pressable>;
}

function Petal({ index, enabled }: { index: number; enabled: boolean }) {
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!enabled) return;
    const animation = Animated.loop(Animated.timing(value, { toValue: 1, duration: 3200 + (index % 5) * 700, easing: Easing.linear, useNativeDriver: true }));
    const start = setTimeout(() => animation.start(), index * 450);
    return () => { clearTimeout(start); animation.stop(); };
  }, [value, index, enabled]);
  const drift = (index % 2 ? 1 : -1) * (10 + (index % 5) * 6);
  const translateY = value.interpolate({ inputRange: [0, 1], outputRange: [-14, CARD_HEIGHT + 20] });
  const translateX = value.interpolate({ inputRange: [0, 1], outputRange: [0, drift] });
  const rotate = value.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(index % 3 + 1) * 140}deg`] });
  const size = 10 * (0.7 + (index % 3) * 0.2);
  return <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: `${(index * 9.7 + 3) % 96}%`, width: size, height: size, opacity: enabled ? 0.85 : 0, zIndex: 7, transform: [{ translateY }, { translateX }, { rotate }] }}><SvgXml xml={JASMINE_XML} width={size} height={size} /></Animated.View>;
}

// "بالهنا والشفا": shown for three minutes after the order is delivered. The scooter and house are gone; the street stays.
export function DeliveryArrivalCard({ deliveredAt, online, onPress }: { deliveredAt: string | null | undefined; online: boolean; onPress: () => void }) {
  const secondsLeft = useArrivalWindow(deliveredAt, online);
  const tod = useTimeOfDay();
  const reduce = useReduceMotion();
  const [drop] = useState(() => new Animated.Value(reduce ? 1 : 0));
  const visible = secondsLeft > 0;
  useEffect(() => {
    if (!visible) return;
    const animation = Animated.spring(drop, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [visible, drop]);
  if (!visible) return null;
  const deliveredMs = parseAcceptedAt(deliveredAt);
  const bagY = drop.interpolate({ inputRange: [0, 1], outputRange: [-70, 0] });
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="وصل طلبك. بالهنا والشفا. عرض الطلب"
    style={{ height: CARD_HEIGHT, borderRadius: 16, overflow: 'hidden', marginBottom: 10, backgroundColor: PALETTES[tod].sky[0] }}>
    <StreetScene tod={tod} moving={false} dim />
    {Array.from({ length: 10 }, (_, index) => <Petal key={index} index={index} enabled={!reduce} />)}
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 8, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 18 }}>
      <Animated.View style={{ width: 62, height: 66, opacity: drop, transform: [{ translateY: bagY }] }}><SvgXml xml={BAG_XML} width={62} height={66} /></Animated.View>
      <Animated.View style={{ opacity: drop }}>
        <Text style={{ color: '#FFFFFF', fontSize: 30, lineHeight: 36, fontWeight: '900', textAlign: 'right', textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 12 }}>بالهنا <Text style={{ color: '#B7FF30', fontSize: 30, fontWeight: '900' }}>والشفا</Text></Text>
        {deliveredMs !== null ? <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: 12, fontWeight: '700', textAlign: 'right', marginTop: 5, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 10 }}>وصل طلبك الساعة {formatEta(deliveredMs - serverOffsetMs)}</Text> : null}
      </Animated.View>
    </View>
  </Pressable>;
}

function useArrivalWindow(deliveredAt: string | null | undefined, online: boolean) {
  const [clock, setClock] = useState(() => ({ now: Date.now(), offset: serverOffsetMs }));
  const sync = useCallback(() => setClock({ now: Date.now(), offset: serverOffsetMs }), []);
  useEffect(() => {
    if (!deliveredAt) return;
    let active = true;
    const refresh = () => { sync(); if (online) void refreshServerOffset().then(() => { if (active) sync(); }); };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { active = false; subscription.remove(); };
  }, [deliveredAt, online, sync]);
  const secondsLeft = arrivalSecondsLeft(deliveredAt, clock.now, clock.offset);
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(sync, Math.min(secondsLeft, 30) * 1000);
    return () => clearTimeout(id);
  }, [secondsLeft, sync]);
  return secondsLeft;
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
