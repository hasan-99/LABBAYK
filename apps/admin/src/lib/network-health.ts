export type AdminBackendHealth = 'unknown' | 'reachable' | 'degraded' | 'unreachable'

type Listener = (health: AdminBackendHealth) => void
let health: AdminBackendHealth = 'unknown'
const listeners = new Set<Listener>()

export const getAdminBackendHealth = () => health
export const subscribeAdminBackendHealth = (listener: Listener) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

const updateHealth = (next: AdminBackendHealth) => {
  if (health === next) return
  health = next
  listeners.forEach((listener) => listener(next))
}

export const createAdminMonitoredFetch = (baseFetch: typeof fetch, timeoutMs = 30_000): typeof fetch => async (input, init) => {
  const controller = new AbortController()
  const sourceSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
  const abortFromSource = () => controller.abort(sourceSignal?.reason)
  if (sourceSignal?.aborted) abortFromSource()
  else sourceSignal?.addEventListener('abort', abortFromSource, { once: true })
  const timeout = window.setTimeout(() => controller.abort(new Error('Admin API request timed out')), timeoutMs)
  try {
    const response = await baseFetch(input, { ...init, signal: controller.signal })
    updateHealth(response.status >= 500 ? 'degraded' : 'reachable')
    return response
  } catch (error) {
    if (!sourceSignal?.aborted) updateHealth('unreachable')
    throw error
  } finally {
    window.clearTimeout(timeout)
    sourceSignal?.removeEventListener('abort', abortFromSource)
  }
}
