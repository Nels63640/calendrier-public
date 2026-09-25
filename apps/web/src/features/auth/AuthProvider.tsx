import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { AuthContext, authStore } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot)
  useEffect(() => authStore.start(), [])
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}
