import { useEffect } from 'react'
import { useAccount, authStore } from '../auth/auth-context'
import { rpc } from '../family/family-api'
import { completePendingPush } from './pending-push'

export function recoverPush(userId: string) {
  return completePendingPush(userId, {
    current: () =>
      authStore.getSnapshot().user?.id === userId && !authStore.getSnapshot().recovering,
    subscription: async () => {
      if (
        !('serviceWorker' in navigator) ||
        !('Notification' in window) ||
        Notification.permission !== 'granted'
      )
        return null
      return (
        (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription() ?? null
      )
    },
    register: (endpoint, keys) =>
      rpc('register_push', { p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth }),
  })
}
/** Reprend seulement une activation explicitement demandée et interrompue par le réseau. */
export function usePushRecovery() {
  const account = useAccount()
  const userId = account.user?.id
  useEffect(() => {
    if (!userId || account.recovering) return
    const retry = () => {
      void recoverPush(userId).catch(() => {})
    }
    const visible = () => {
      if (document.visibilityState === 'visible') retry()
    }
    retry()
    const timer = setInterval(visible, 15000)
    window.addEventListener('online', retry)
    window.addEventListener('pageshow', retry)
    document.addEventListener('visibilitychange', visible)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', retry)
      window.removeEventListener('pageshow', retry)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [userId, account.recovering])
}
