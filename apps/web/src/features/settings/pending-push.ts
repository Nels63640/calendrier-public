interface PendingPush {
  userId: string
  endpoint: string
  at: number
}
const key = 'family-calendar:pending-push'
let memory: PendingPush | null = null
let persistent = true
let inFlight: Promise<void> | null = null
export function pendingPush(): PendingPush | null {
  try {
    if (persistent) memory = JSON.parse(localStorage.getItem(key) ?? 'null') as PendingPush | null
  } catch {
    persistent = false
  }
  return memory && Date.now() - memory.at >= 0 && Date.now() - memory.at < 86400000 ? memory : null
}
function signal() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('family-push-status'))
}
export function queuePush(userId: string, endpoint: string) {
  memory = { userId, endpoint, at: Date.now() }
  try {
    if (persistent) localStorage.setItem(key, JSON.stringify(memory))
  } catch {
    persistent = false
  }
  signal()
}
export function cancelPendingPush() {
  memory = null
  try {
    localStorage.removeItem(key)
  } catch {
    /* Stockage indisponible. */
  }
  signal()
}
export async function settlePendingPush() {
  await inFlight?.catch(() => {})
}
export function completePendingPush(
  userId: string,
  transport: {
    current: () => boolean
    subscription: () => Promise<{
      endpoint: string
      toJSON(): { keys?: Record<string, string> }
    } | null>
    register: (endpoint: string, keys: Record<string, string>) => Promise<unknown>
  },
): Promise<void> {
  if (inFlight) return inFlight
  const pending = pendingPush()
  if (!pending || pending.userId !== userId || !transport.current()) return Promise.resolve()
  const same = () => {
    const value = pendingPush()
    return (
      transport.current() &&
      value?.userId === userId &&
      value.endpoint === pending.endpoint &&
      value.at === pending.at
    )
  }
  inFlight = (async () => {
    const subscription = await transport.subscription()
    if (!same() || !subscription || subscription.endpoint !== pending.endpoint) return
    const keys = subscription.toJSON().keys
    if (!keys?.p256dh || !keys.auth) return
    await transport.register(subscription.endpoint, keys)
    if (same()) cancelPendingPush()
  })().finally(() => {
    inFlight = null
  })
  return inFlight
}
