import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PwaContext } from './pwa-context'

export function PwaProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [error, setError] = useState('')
  const registration = useRef<ServiceWorkerRegistration | null>(null)
  const reloadRequested = useRef(false)

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return
    let disposed = false
    let watched: ServiceWorker | null = null
    const stateChanged = () => {
      if (disposed) return
      if (registration.current?.waiting && navigator.serviceWorker.controller)
        setUpdateAvailable(true)
    }
    const watchInstall = () => {
      watched?.removeEventListener('statechange', stateChanged)
      watched = registration.current?.installing ?? null
      watched?.addEventListener('statechange', stateChanged)
    }
    const controllerChanged = () => {
      setUpdateAvailable(false)
      setReady(Boolean(navigator.serviceWorker.controller))
      if (reloadRequested.current) window.location.reload()
    }
    const checkForUpdate = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void registration.current?.update().catch(() => {})
      }
    }
    navigator.serviceWorker.addEventListener('controllerchange', controllerChanged)
    document.addEventListener('visibilitychange', checkForUpdate)
    void navigator.serviceWorker
      .register(import.meta.env.BASE_URL + 'sw.js', { updateViaCache: 'none' })
      .then(async (value) => {
        if (disposed) return
        registration.current = value
        value.addEventListener('updatefound', watchInstall)
        watchInstall()
        stateChanged()
        await navigator.serviceWorker.ready
        if (!disposed) setReady(true)
      })
      .catch(() => {
        if (!disposed)
          setError(
            'Le mode hors connexion n’a pas pu être préparé. Réessayez avec une connexion stable.',
          )
      })
    return () => {
      disposed = true
      registration.current?.removeEventListener('updatefound', watchInstall)
      watched?.removeEventListener('statechange', stateChanged)
      navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged)
      document.removeEventListener('visibilitychange', checkForUpdate)
    }
  }, [])

  const applyUpdate = () => {
    if (!registration.current?.waiting) return
    reloadRequested.current = true
    registration.current.waiting.postMessage({ type: 'SKIP_WAITING' })
  }

  return (
    <PwaContext.Provider value={{ ready, updateAvailable, error, applyUpdate }}>
      {children}
    </PwaContext.Provider>
  )
}
