export type BackendHealth = 'unknown' | 'reachable' | 'degraded' | 'unreachable';

type HealthListener = (health: BackendHealth) => void;

let backendHealth: BackendHealth = 'unknown';
const listeners = new Set<HealthListener>();

export const getBackendHealth = () => backendHealth;

export const subscribeBackendHealth = (listener: HealthListener) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const setBackendHealth = (next: BackendHealth) => {
  if (backendHealth === next) return;
  backendHealth = next;
  listeners.forEach((listener) => listener(next));
};

const isStorageUpload = (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  return url.includes('/storage/v1/object/');
};

/**
 * Bounds time spent waiting for Supabase response headers and reports only
 * aggregate backend health. It never records request URLs, headers, or bodies.
 */
export const createMonitoredFetch = (baseFetch: typeof fetch, timeoutMs = 30_000): typeof fetch => {
  return async (input, init) => {
    const controller = new AbortController();
    const sourceSignal = init?.signal ?? (typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined);
    const abortFromSource = () => controller.abort(sourceSignal?.reason);
    if (sourceSignal?.aborted) abortFromSource();
    else sourceSignal?.addEventListener('abort', abortFromSource, { once: true });

    const timeout = setTimeout(() => controller.abort(new Error('Supabase request timed out')), isStorageUpload(input) ? 120_000 : timeoutMs);
    try {
      const response = await baseFetch(input, { ...init, signal: controller.signal });
      setBackendHealth(response.status >= 500 ? 'degraded' : 'reachable');
      return response;
    } catch (error) {
      if (!sourceSignal?.aborted) setBackendHealth('unreachable');
      throw error;
    } finally {
      clearTimeout(timeout);
      sourceSignal?.removeEventListener('abort', abortFromSource);
    }
  };
};
