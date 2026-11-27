import type { Database } from '@labbayk/shared/database.types';
import { getOfflineItem, removeOfflineItem, setOfflineItem } from './offline-storage';

type DriverOrder = Pick<Database['public']['Tables']['orders']['Row'], 'id'|'status'|'accepted_at'|'request_text'|'delivery_fee_minor'|'purchase_amount_minor'|'purchase_approved_at'|'created_at'|'address_id'> & {
  budget_ceiling_minor?: Database['public']['Tables']['orders']['Row']['budget_ceiling_minor'];
  address: Pick<Database['public']['Tables']['addresses']['Row'], 'id'|'label'|'street'|'city'|'neighborhood'|'contact_phone'|'building'|'landmark'> | null;
};
export type DriverOrdersSnapshot = { schemaVersion: 1; orders: DriverOrder[]; syncedAt: string };

const key = (userId: string) => `labbayk:driver-orders-snapshot:${userId}`;
const activeStatuses = new Set(['accepted','assigned','shopping','awaiting_approval','purchased','delivering','disputed']);
let queue: Promise<void> = Promise.resolve();
const enqueue = <T,>(operation: () => Promise<T>) => {
  const result = queue.then(operation, operation);
  queue = result.then(() => undefined, () => undefined);
  return result;
};
export const saveDriverOrdersSnapshot = (userId: string, orders: DriverOrder[]) => enqueue(async () => {
  const snapshot: DriverOrdersSnapshot = {
    schemaVersion: 1,
    syncedAt: new Date().toISOString(),
    orders: orders.filter((order) => activeStatuses.has(order.status)).slice(0, 20).map((order) => ({ ...order, request_text: '', address_id: null, address: null, budget_ceiling_minor: 0, delivery_fee_minor: 0, purchase_amount_minor: null, purchase_approved_at: null })),
  };
  await setOfflineItem(key(userId), JSON.stringify(snapshot));
  return snapshot;
});

export const clearDriverOrdersSnapshot = (userId: string) => enqueue(async () => {
  await removeOfflineItem(key(userId));
});

export const loadDriverOrdersSnapshot = (userId: string) => enqueue(async (): Promise<DriverOrdersSnapshot | null> => {
  let raw: string | null;
  try {
    raw = await getOfflineItem(key(userId));
  } catch {
    // Keep the snapshot intact if the device's storage is temporarily unavailable.
    return null;
  }
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const snapshot = value as Partial<DriverOrdersSnapshot>;
    const syncedAt = typeof snapshot.syncedAt === 'string' ? Date.parse(snapshot.syncedAt) : NaN;
    if (!Number.isFinite(syncedAt) || Date.now() - syncedAt > 7 * 24 * 60 * 60 * 1000 || !Array.isArray(snapshot.orders)) { await removeOfflineItem(key(userId)); return null; }
    const orders = snapshot.orders.filter((order): order is DriverOrder => !!order && typeof order === 'object'
      && typeof order.id === 'string' && /^[a-f0-9-]{36}$/i.test(order.id)
      && typeof order.status === 'string' && activeStatuses.has(order.status)
      && typeof order.request_text === 'string' && typeof order.created_at === 'string'
      && Number.isSafeInteger(order.delivery_fee_minor)
      && (order.purchase_amount_minor === null || Number.isSafeInteger(order.purchase_amount_minor))
      && (order.purchase_approved_at === null || typeof order.purchase_approved_at === 'string'));
    const sanitized = orders.slice(0, 20).map((order) => ({ ...order, request_text: '', address_id: null, address: null, budget_ceiling_minor: 0, delivery_fee_minor: 0, purchase_amount_minor: null, purchase_approved_at: null }));
    const result: DriverOrdersSnapshot = { schemaVersion: 1, orders: sanitized, syncedAt: new Date(syncedAt).toISOString() };
    const hadSensitiveFields = snapshot.schemaVersion !== 1 || orders.some((order) => order.request_text !== '' || order.address_id !== null || order.address !== null || order.budget_ceiling_minor !== 0 || order.delivery_fee_minor !== 0 || order.purchase_amount_minor !== null || order.purchase_approved_at !== null);
    if (hadSensitiveFields) await setOfflineItem(key(userId), JSON.stringify(result)).catch(() => {});
    return result;
  } catch {
    // Only malformed data is discarded; transient reads/writes must preserve the saved copy.
    await removeOfflineItem(key(userId)).catch(() => {});
    return null;
  }
});
