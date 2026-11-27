import type { Database } from '@labbayk/shared/database.types';
import { getOfflineItem, removeOfflineItem, setOfflineItem } from './offline-storage';

export type CustomerOrderImageDraft = { id: string; mimeType: string; extension: string; uploaded: boolean };
export type CustomerOrderDraft = {
  schemaVersion: 1;
  savedAt: string;
  request: string;
  addressId: string;
  idempotencyKey: string;
  loyaltyPointsToRedeem?: 0 | 3 | 4 | 5;
  pendingOrderId?: string;
  images?: CustomerOrderImageDraft[];
};

type OrderSummary = Pick<Database['public']['Tables']['orders']['Row'], 'id'|'status'|'delivery_fee_minor'|'delivery_quote_set_at'|'delivery_quote_approved_at'|'purchase_amount_minor'|'purchase_approved_at'|'created_at'|'accepted_at'|'delivery_proof_path'|'loyalty_points_redeemed'|'loyalty_discount_minor'>;
export type CustomerOrderSnapshot = { schemaVersion: 1; orders: OrderSummary[]; syncedAt: string };

const storageKey = (userId: string) => `labbayk:customer-order-draft:${userId}`;
const snapshotKey = (userId: string) => `labbayk:customer-orders-snapshot:${userId}`;
let storageQueue: Promise<void> = Promise.resolve();

const enqueue = <T,>(operation: () => Promise<T>): Promise<T> => {
  const result = storageQueue.then(operation, operation);
  storageQueue = result.then(() => undefined, () => undefined);
  return result;
};

export const loadCustomerOrderDraft = (userId: string) => enqueue(async (): Promise<CustomerOrderDraft | null> => {
  let raw: string | null;
  try {
    raw = await getOfflineItem(storageKey(userId));
  } catch {
    // A temporary storage failure must not destroy a draft the customer has not sent yet.
    return null;
  }
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') { await removeOfflineItem(storageKey(userId)); return null; }
    const draft = value as Partial<CustomerOrderDraft>;
    const legacyDraft = draft.schemaVersion === undefined;
    const savedAt = typeof draft.savedAt === 'string' ? Date.parse(draft.savedAt) : legacyDraft ? Date.now() : NaN;
    if ((!legacyDraft && draft.schemaVersion !== 1) || !Number.isFinite(savedAt) || Date.now() - savedAt > 7 * 24 * 60 * 60 * 1000 ||
        typeof draft.request !== 'string' || draft.request.length > 4000 || typeof draft.addressId !== 'string' ||
        typeof draft.idempotencyKey !== 'string' ||
        !/^[a-f0-9-]{36}$/i.test(draft.idempotencyKey)) { await removeOfflineItem(storageKey(userId)); return null; }
    const validImages = draft.images === undefined || (Array.isArray(draft.images) && draft.images.length <= 3 && draft.images.every((image) => !!image && typeof image === 'object'
      && typeof image.id === 'string' && /^[a-f0-9-]{36}$/i.test(image.id)
      && typeof image.mimeType === 'string' && ['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(image.mimeType)
      && typeof image.extension === 'string' && ['jpg','png','webp','heic','heif'].includes(image.extension)
      && typeof image.uploaded === 'boolean'));
    if (!validImages) { await removeOfflineItem(storageKey(userId)); return null; }
    const images = (draft.images ?? []) as CustomerOrderImageDraft[];
    const pendingOrderId = typeof draft.pendingOrderId === 'string' && /^[a-f0-9-]{36}$/i.test(draft.pendingOrderId) ? draft.pendingOrderId : undefined;
    const loyaltyPointsToRedeem = draft.loyaltyPointsToRedeem === 3 || draft.loyaltyPointsToRedeem === 4 || draft.loyaltyPointsToRedeem === 5 ? draft.loyaltyPointsToRedeem : 0;
    return { schemaVersion: 1, savedAt: new Date(savedAt).toISOString(), request: draft.request, addressId: draft.addressId, idempotencyKey: draft.idempotencyKey, loyaltyPointsToRedeem, pendingOrderId, images };
  } catch {
    // This catch only covers parsing/validation. Storage read failures are handled above.
    await removeOfflineItem(storageKey(userId)).catch(() => {});
    return null;
  }
});

export const saveCustomerOrderDraft = (userId: string, draft: CustomerOrderDraft) => enqueue(async () => {
  const serialized = JSON.stringify({ ...draft, schemaVersion: 1, savedAt: new Date().toISOString() });
  if (serialized.length > 16_000) throw new Error('Order draft exceeds the local storage limit.');
  await setOfflineItem(storageKey(userId), serialized);
});

export const clearCustomerOrderDraft = (userId: string) => enqueue(async () => {
  await removeOfflineItem(storageKey(userId));
});

const activeOrderStatuses = new Set(['requested','quoted','searching','accepted','assigned','shopping','awaiting_approval','purchased','delivering','delivered','disputed']);
const summaryFields: (keyof OrderSummary)[] = ['id','status','delivery_fee_minor','delivery_quote_set_at','delivery_quote_approved_at','purchase_amount_minor','purchase_approved_at','created_at','accepted_at','loyalty_points_redeemed','loyalty_discount_minor'];

export const saveCustomerOrdersSnapshot = (userId: string, orders: OrderSummary[]) => enqueue(async () => {
  const snapshot: CustomerOrderSnapshot = {
    schemaVersion: 1,
    syncedAt: new Date().toISOString(),
    orders: orders.filter((order) => activeOrderStatuses.has(order.status)).slice(0, 30).map((order) =>
      Object.fromEntries(summaryFields.map((field) => [field, order[field]])) as OrderSummary),
  };
  await setOfflineItem(snapshotKey(userId), JSON.stringify(snapshot));
  return snapshot;
});

export const loadCustomerOrdersSnapshot = (userId: string) => enqueue(async (): Promise<CustomerOrderSnapshot | null> => {
  try {
    const raw = await getOfflineItem(snapshotKey(userId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const snapshot = value as Partial<CustomerOrderSnapshot>;
    const syncedAt = typeof snapshot.syncedAt === 'string' ? Date.parse(snapshot.syncedAt) : NaN;
    const legacySnapshot = snapshot.schemaVersion === undefined;
    if ((!legacySnapshot && snapshot.schemaVersion !== 1) || !Number.isFinite(syncedAt) || Date.now() - syncedAt > 7 * 24 * 60 * 60 * 1000 || !Array.isArray(snapshot.orders)) { await removeOfflineItem(snapshotKey(userId)); return null; }
    const orders = snapshot.orders.filter((order): order is OrderSummary => !!order && typeof order === 'object'
      && typeof order.id === 'string' && /^[a-f0-9-]{36}$/i.test(order.id)
      && typeof order.status === 'string' && activeOrderStatuses.has(order.status)
      && typeof order.created_at === 'string'
      && Number.isSafeInteger(order.delivery_fee_minor)
      && (order.purchase_amount_minor === null || Number.isSafeInteger(order.purchase_amount_minor))
      && (order.delivery_quote_set_at === null || typeof order.delivery_quote_set_at === 'string')
      && (order.delivery_quote_approved_at === null || typeof order.delivery_quote_approved_at === 'string')
      && (order.purchase_approved_at === null || typeof order.purchase_approved_at === 'string'))
      .map((order) => ({ ...order, loyalty_points_redeemed: Number(order.loyalty_points_redeemed ?? 0), loyalty_discount_minor: Number(order.loyalty_discount_minor ?? 0) }));
    const result: CustomerOrderSnapshot = { schemaVersion: 1, orders: orders.slice(0, 30), syncedAt: new Date(syncedAt).toISOString() };
    if (legacySnapshot) await setOfflineItem(snapshotKey(userId), JSON.stringify(result));
    return result;
  } catch {
    return null;
  }
});

export const clearCustomerOrdersSnapshot = (userId: string) => enqueue(async () => {
  await removeOfflineItem(snapshotKey(userId));
});
