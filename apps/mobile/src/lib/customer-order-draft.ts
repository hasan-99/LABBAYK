import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { Database } from '@labbayk/shared/database.types';

export type CustomerOrderDraft = {
  request: string;
  category: string;
  budgetCeiling: string;
  addressId: string;
  idempotencyKey: string;
};

type OrderSummary = Pick<Database['public']['Tables']['orders']['Row'], 'id'|'status'|'category'|'delivery_fee_minor'|'delivery_quote_set_at'|'delivery_quote_approved_at'|'budget_ceiling_minor'|'purchase_amount_minor'|'purchase_approved_at'|'created_at'>;
export type CustomerOrderSnapshot = { orders: OrderSummary[]; syncedAt: string };

const storageKey = (userId: string) => `labbayk:customer-order-draft:${userId}`;
const snapshotKey = (userId: string) => `labbayk:customer-orders-snapshot:${userId}`;
let storageQueue: Promise<void> = Promise.resolve();

const enqueue = <T,>(operation: () => Promise<T>): Promise<T> => {
  const result = storageQueue.then(operation, operation);
  storageQueue = result.then(() => undefined, () => undefined);
  return result;
};

const getItem = (key: string) => Platform.OS === 'web'
  ? Promise.resolve(typeof window === 'undefined' ? null : window.localStorage.getItem(key))
  : AsyncStorage.getItem(key);
const setItem = (key: string, value: string) => Platform.OS === 'web'
  ? Promise.resolve().then(() => { if (typeof window !== 'undefined') window.localStorage.setItem(key, value); })
  : AsyncStorage.setItem(key, value);
const removeItem = (key: string) => Platform.OS === 'web'
  ? Promise.resolve().then(() => { if (typeof window !== 'undefined') window.localStorage.removeItem(key); })
  : AsyncStorage.removeItem(key);

export const loadCustomerOrderDraft = (userId: string) => enqueue(async (): Promise<CustomerOrderDraft | null> => {
  try {
    const raw = await getItem(storageKey(userId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const draft = value as Partial<CustomerOrderDraft>;
    if (typeof draft.request !== 'string' || typeof draft.category !== 'string' || typeof draft.addressId !== 'string' ||
        typeof draft.budgetCeiling !== 'string' || typeof draft.idempotencyKey !== 'string' ||
        !/^[a-f0-9-]{36}$/i.test(draft.idempotencyKey)) return null;
    return { request: draft.request, category: draft.category, budgetCeiling: draft.budgetCeiling, addressId: draft.addressId, idempotencyKey: draft.idempotencyKey };
  } catch {
    return null;
  }
});

export const saveCustomerOrderDraft = (userId: string, draft: CustomerOrderDraft) => enqueue(async () => {
  await setItem(storageKey(userId), JSON.stringify(draft));
});

export const clearCustomerOrderDraft = (userId: string) => enqueue(async () => {
  await removeItem(storageKey(userId));
});

const activeOrderStatuses = new Set(['requested','quoted','searching','accepted','assigned','shopping','awaiting_approval','purchased','delivering','delivered','disputed']);
const summaryFields: (keyof OrderSummary)[] = ['id','status','category','delivery_fee_minor','delivery_quote_set_at','delivery_quote_approved_at','budget_ceiling_minor','purchase_amount_minor','purchase_approved_at','created_at'];

export const saveCustomerOrdersSnapshot = (userId: string, orders: OrderSummary[]) => enqueue(async () => {
  const snapshot: CustomerOrderSnapshot = {
    syncedAt: new Date().toISOString(),
    orders: orders.filter((order) => activeOrderStatuses.has(order.status)).slice(0, 30).map((order) =>
      Object.fromEntries(summaryFields.map((field) => [field, order[field]])) as OrderSummary),
  };
  await setItem(snapshotKey(userId), JSON.stringify(snapshot));
  return snapshot;
});

export const loadCustomerOrdersSnapshot = (userId: string) => enqueue(async (): Promise<CustomerOrderSnapshot | null> => {
  try {
    const raw = await getItem(snapshotKey(userId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const snapshot = value as Partial<CustomerOrderSnapshot>;
    const syncedAt = typeof snapshot.syncedAt === 'string' ? Date.parse(snapshot.syncedAt) : NaN;
    if (!Number.isFinite(syncedAt) || Date.now() - syncedAt > 30 * 24 * 60 * 60 * 1000 || !Array.isArray(snapshot.orders)) return null;
    const orders = snapshot.orders.filter((order): order is OrderSummary => !!order && typeof order === 'object'
      && typeof order.id === 'string' && /^[a-f0-9-]{36}$/i.test(order.id)
      && typeof order.status === 'string' && activeOrderStatuses.has(order.status)
      && typeof order.category === 'string' && typeof order.created_at === 'string'
      && Number.isSafeInteger(order.delivery_fee_minor) && Number.isSafeInteger(order.budget_ceiling_minor)
      && (order.purchase_amount_minor === null || Number.isSafeInteger(order.purchase_amount_minor))
      && (order.delivery_quote_set_at === null || typeof order.delivery_quote_set_at === 'string')
      && (order.delivery_quote_approved_at === null || typeof order.delivery_quote_approved_at === 'string')
      && (order.purchase_approved_at === null || typeof order.purchase_approved_at === 'string'));
    return { orders: orders.slice(0, 30), syncedAt: new Date(syncedAt).toISOString() };
  } catch {
    return null;
  }
});
