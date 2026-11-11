import type { Database } from '@labbayk/shared/database.types';
import { getOfflineItem, removeOfflineItem, setOfflineItem } from './offline-storage';

type DriverOrder = Pick<Database['public']['Tables']['orders']['Row'], 'id'|'status'|'category'|'request_text'|'delivery_fee_minor'|'budget_ceiling_minor'|'purchase_amount_minor'|'purchase_approved_at'|'created_at'|'address_id'> & {
  address: Pick<Database['public']['Tables']['addresses']['Row'], 'id'|'label'|'street'|'city'|'neighborhood'|'contact_phone'|'building'|'landmark'> | null;
};
export type DriverOrdersSnapshot = { orders: DriverOrder[]; syncedAt: string };

const key = (userId: string) => `labbayk:driver-orders-snapshot:${userId}`;
const activeStatuses = new Set(['accepted','assigned','shopping','awaiting_approval','purchased','delivering','disputed']);
let queue: Promise<void> = Promise.resolve();
const enqueue = <T,>(operation: () => Promise<T>) => {
  const result = queue.then(operation, operation);
  queue = result.then(() => undefined, () => undefined);
  return result;
};
export const saveDriverOrdersSnapshot = (userId: string, orders: DriverOrder[]) => enqueue(async () => {
  const snapshot = { syncedAt: new Date().toISOString(), orders: orders.filter((order) => activeStatuses.has(order.status)).slice(0, 20) };
  await setOfflineItem(key(userId), JSON.stringify(snapshot));
  return snapshot;
});

export const clearDriverOrdersSnapshot = (userId: string) => enqueue(async () => {
  await removeOfflineItem(key(userId));
});

export const loadDriverOrdersSnapshot = (userId: string) => enqueue(async (): Promise<DriverOrdersSnapshot | null> => {
  try {
    const raw = await getOfflineItem(key(userId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const snapshot = value as Partial<DriverOrdersSnapshot>;
    const syncedAt = typeof snapshot.syncedAt === 'string' ? Date.parse(snapshot.syncedAt) : NaN;
    if (!Number.isFinite(syncedAt) || Date.now() - syncedAt > 30 * 24 * 60 * 60 * 1000 || !Array.isArray(snapshot.orders)) return null;
    const orders = snapshot.orders.filter((order): order is DriverOrder => !!order && typeof order === 'object'
      && typeof order.id === 'string' && /^[a-f0-9-]{36}$/i.test(order.id)
      && typeof order.address_id === 'string' && /^[a-f0-9-]{36}$/i.test(order.address_id)
      && typeof order.status === 'string' && activeStatuses.has(order.status)
      && typeof order.category === 'string' && typeof order.request_text === 'string' && typeof order.created_at === 'string'
      && Number.isSafeInteger(order.delivery_fee_minor) && Number.isSafeInteger(order.budget_ceiling_minor)
      && (order.purchase_amount_minor === null || Number.isSafeInteger(order.purchase_amount_minor))
      && (order.purchase_approved_at === null || typeof order.purchase_approved_at === 'string')
      && (order.address === null || (!!order.address && typeof order.address === 'object'
        && typeof order.address.id === 'string' && typeof order.address.label === 'string'
        && typeof order.address.street === 'string' && typeof order.address.city === 'string'
        && typeof order.address.neighborhood === 'string' && typeof order.address.contact_phone === 'string'
        && (order.address.building === null || typeof order.address.building === 'string')
        && (order.address.landmark === null || typeof order.address.landmark === 'string'))));
    return { orders: orders.slice(0, 20), syncedAt: new Date(syncedAt).toISOString() };
  } catch {
    return null;
  }
});
