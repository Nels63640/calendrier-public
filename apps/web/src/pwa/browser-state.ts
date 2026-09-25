import { useSyncExternalStore } from 'react'

function subscribeConnection(notify: () => void) {
  window.addEventListener('online', notify)
  window.addEventListener('offline', notify)
  return () => {
    window.removeEventListener('online', notify)
    window.removeEventListener('offline', notify)
  }
}
function subscribeInstalled(notify: () => void) {
  const query = matchMedia('(display-mode: standalone)')
  query.addEventListener('change', notify)
  window.addEventListener('appinstalled', notify)
  return () => {
    query.removeEventListener('change', notify)
    window.removeEventListener('appinstalled', notify)
  }
}
export function isStandalone() {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  )
}
export function useOnline() {
  return useSyncExternalStore(
    subscribeConnection,
    () => navigator.onLine,
    () => true,
  )
}
export function useInstalled() {
  return useSyncExternalStore(subscribeInstalled, isStandalone, () => false)
}
