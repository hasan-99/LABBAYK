import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const databaseName = 'labbayk-offline-cache';
const storeName = 'records';
let databasePromise: Promise<IDBDatabase> | null = null;

const openDatabase = () => {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable.'));
  if (databasePromise) return databasePromise;

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB.'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked.'));
  }).catch((error: unknown) => {
    databasePromise = null;
    throw error;
  });

  return databasePromise;
};

const readIndexedItem = async (key: string): Promise<unknown> => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error('Could not read IndexedDB.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB read was aborted.'));
  });
};

const writeIndexedItem = async (key: string, value: string): Promise<void> => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not write IndexedDB.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write was aborted.'));
  });
};

const deleteIndexedItem = async (key: string): Promise<void> => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not delete from IndexedDB.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB delete was aborted.'));
  });
};

const readLegacyItem = (key: string) => {
  try { return window.localStorage.getItem(key); } catch { return null; }
};

const clearLegacyItem = (key: string) => {
  try { window.localStorage.removeItem(key); } catch { /* IndexedDB remains the source of truth. */ }
};

export const getOfflineItem = async (key: string): Promise<string | null> => {
  if (Platform.OS !== 'web') return AsyncStorage.getItem(key);
  if (typeof window === 'undefined') return null;

  const stored = await readIndexedItem(key);
  if (typeof stored === 'string') return stored;

  const legacy = readLegacyItem(key);
  if (legacy !== null) {
    await writeIndexedItem(key, legacy);
    clearLegacyItem(key);
    return legacy;
  }
  return null;
};

export const setOfflineItem = async (key: string, value: string): Promise<void> => {
  if (Platform.OS !== 'web') return AsyncStorage.setItem(key, value);
  if (typeof window === 'undefined') return;

  await writeIndexedItem(key, value);
  clearLegacyItem(key);
};

export const removeOfflineItem = async (key: string): Promise<void> => {
  if (Platform.OS !== 'web') return AsyncStorage.removeItem(key);
  if (typeof window === 'undefined') return;

  await deleteIndexedItem(key);
  clearLegacyItem(key);
};
