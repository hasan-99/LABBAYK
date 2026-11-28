// Pure helpers for the "your order arrives in 45 minutes" countdown. No React, so they can be tested directly.
export const DELIVERY_WINDOW_SECONDS = 45 * 60;
export const WARNING_SECONDS = 10 * 60;
// Statuses in which a driver holds the order and it is still on its way to the customer.
export const COUNTDOWN_STATUSES = ['accepted', 'assigned', 'shopping', 'awaiting_approval', 'purchased', 'delivering'] as const;

export type CountdownPhase = 'ok' | 'warn' | 'late';
export type Countdown = { phase: CountdownPhase; remainingSeconds: number; progress: number; etaMs: number };

export const hasCountdown = (status: string, acceptedAt: string | null | undefined) =>
  (COUNTDOWN_STATUSES as readonly string[]).includes(status) && parseAcceptedAt(acceptedAt) !== null;

export function parseAcceptedAt(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

// serverOffsetMs = (server clock) - (phone clock). A wrong phone clock must not change the countdown.
export function computeCountdown(acceptedAt: string | null | undefined, nowMs: number, serverOffsetMs = 0): Countdown | null {
  const accepted = parseAcceptedAt(acceptedAt);
  if (accepted === null) return null;
  const elapsed = Math.max(0, Math.floor((nowMs + serverOffsetMs - accepted) / 1000));
  const remainingSeconds = Math.max(0, DELIVERY_WINDOW_SECONDS - elapsed);
  const phase: CountdownPhase = remainingSeconds === 0 ? 'late' : remainingSeconds <= WARNING_SECONDS ? 'warn' : 'ok';
  // Past the deadline the scooter parks just before the door instead of arriving without an order.
  const progress = phase === 'late' ? 0.94 : Math.min(1, elapsed / DELIVERY_WINDOW_SECONDS);
  return { phase, remainingSeconds, progress, etaMs: accepted + DELIVERY_WINDOW_SECONDS * 1000 - serverOffsetMs };
}

const DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const toArabicDigits = (value: string | number) => String(value).replace(/\d/g, (digit) => DIGITS[Number(digit)]);

export function formatClock(remainingSeconds: number) {
  const total = Math.max(0, Math.floor(remainingSeconds));
  const minutes = String(Math.floor(total / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return { minutes: toArabicDigits(minutes), seconds: toArabicDigits(seconds) };
}

export function formatEta(etaMs: number) {
  const date = new Date(etaMs);
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return toArabicDigits(`${hour12}:${minutes}`) + (hours < 12 ? ' ص' : ' م');
}

// Offset between the database clock and this phone, corrected for the round trip of the request.
export function estimateServerOffset(serverNowIso: string, sentAtMs: number, receivedAtMs: number): number | null {
  const server = Date.parse(serverNowIso);
  if (!Number.isFinite(server) || receivedAtMs < sentAtMs) return null;
  return server - (sentAtMs + (receivedAtMs - sentAtMs) / 2);
}

// After delivery the home screen shows "بالهنا والشفا" for three minutes, counted from the server's delivery time.
export const ARRIVAL_SECONDS = 3 * 60;
export function arrivalSecondsLeft(deliveredAt: string | null | undefined, nowMs: number, serverOffsetMs = 0): number {
  const delivered = parseAcceptedAt(deliveredAt);
  if (delivered === null) return 0;
  const elapsed = (nowMs + serverOffsetMs - delivered) / 1000;
  if (elapsed < -60) return 0; // a delivery time far in the future is bad data, not a celebration
  return Math.max(0, Math.ceil(ARRIVAL_SECONDS - Math.max(0, elapsed)));
}

// What the driver "says" on the card, by order status and countdown phase.
export function journeyLine(status: string, phase: CountdownPhase): string {
  if (phase === 'late') return 'آسف تأخّرت شوي، قرّبت والله';
  if (phase === 'warn') return 'صرت بآخر الشارع';
  if (status === 'shopping' || status === 'awaiting_approval') return 'عم تسوّقلك، ثواني وبكون عندك';
  if (status === 'purchased' || status === 'delivering') return 'جبتلك طلبك وعم إجي';
  return 'قبلت طلبك، عم جهّز حالي';
}
