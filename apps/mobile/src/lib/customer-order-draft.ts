import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export type CustomerOrderDraft = {
  request: string;
  category: string;
  budgetCeiling: string;
  addressId: string;
  idempotencyKey: string;
};

const storageKey = (userId: string) => `labbayk:customer-order-draft:${userId}`;
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
