import {
  offlineAccount,
  rememberedAccount,
  rememberAccount,
  forgetAccount,
} from './offline-account.ts'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Profile } from './auth-validation.ts'

export interface AccountState {
  status: 'unavailable' | 'loading' | 'signed-out' | 'authenticated' | 'error'
  user: { id: string; email: string } | null
  profile: Profile | null
  profileError: boolean
  recovering?: boolean
}

/** Invalidation des réponses retardées lors d'un changement de compte ou d'une déconnexion. */
export class AuthStore {
  private state: AccountState
  private listeners = new Set<() => void>()
  private generation = 0
  private recoveryTimer: ReturnType<typeof setTimeout> | undefined
  private retrying: Promise<void> | null = null
  private running = false
  private retryDelay = 5000

  constructor(
    privateClient: SupabaseClient | null,
    privateLoader: (id: string) => Promise<Profile>,
  ) {
    this.client = privateClient
    this.loadProfile = privateLoader
    this.state = {
      status: privateClient ? 'loading' : 'unavailable',
      user: null,
      profile: null,
      profileError: false,
    }
  }
  private client: SupabaseClient | null
  private loadProfile: (id: string) => Promise<Profile>
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private put(value: AccountState) {
    this.state = value
    this.listeners.forEach((listener) => listener())
  }
  private stopRecovery() {
    clearTimeout(this.recoveryTimer)
    this.recoveryTimer = undefined
  }
  private signedOut() {
    this.stopRecovery()
    forgetAccount()
    this.put({ status: 'signed-out', user: null, profile: null, profileError: false })
  }
  private recover(id?: string) {
    const cached = rememberedAccount(id)
    this.put(
      cached
        ? {
            status: 'authenticated',
            user: cached.user,
            profile: cached.profile,
            profileError: false,
            recovering: true,
          }
        : { status: 'error', user: null, profile: null, profileError: false, recovering: true },
    )
    this.stopRecovery()
    if (!this.running || (typeof navigator !== 'undefined' && navigator.onLine === false)) return
    this.recoveryTimer = setTimeout(() => {
      void this.retry()
    }, this.retryDelay)
    this.retryDelay = Math.min(this.retryDelay * 2, 60000)
  }
  start() {
    if (!this.client) return () => {}
    this.running = true
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      const generation = ++this.generation
      this.stopRecovery()
      if (!session) {
        if (event === 'SIGNED_OUT') this.signedOut()
        // INITIAL_SESSION peut être vide si le renouvellement échoue provisoirement.
        else
          setTimeout(() => {
            if (this.running && generation === this.generation) void this.retry()
          }, 0)
        return
      }
      if (this.state.user?.id !== session.user.id)
        this.put({ status: 'loading', user: null, profile: null, profileError: false })
      // Ne pas attendre un autre appel Auth dans le callback du SDK.
      setTimeout(() => {
        void this.resolveSession(session, generation)
      }, 0)
    })
    const reconnect = () => {
      void this.retry()
    }
    const visible = () => {
      if (document.visibilityState === 'visible') reconnect()
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', reconnect)
      window.addEventListener('pageshow', reconnect)
      document.addEventListener('visibilitychange', visible)
    }
    return () => {
      this.running = false
      this.stopRecovery()
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', reconnect)
        window.removeEventListener('pageshow', reconnect)
        document.removeEventListener('visibilitychange', visible)
      }
      this.generation++
      data.subscription.unsubscribe()
    }
  }

  private async resolveSession(session: Session, generation: number) {
    if (!this.client || generation !== this.generation) return
    const cached = offlineAccount(session.user.id)
    if (cached) {
      this.put({
        status: 'authenticated',
        user: cached.user,
        profile: cached.profile,
        profileError: false,
        recovering: true,
      })
      return
    }
    try {
      // Sans jeton capturé : le SDK peut renouveler le jeton avant sa vérification.
      const { data, error } = await this.client.auth.getUser()
      if (generation !== this.generation) return
      if (error) {
        if (temporaryAuthFailure(error)) this.recover(session.user.id)
        else this.signedOut()
        return
      }
      if (!data.user || !data.user.email_confirmed_at || data.user.id !== session.user.id) {
        this.signedOut()
        return
      }
      this.stopRecovery()
      this.retryDelay = 5000
      const user = { id: data.user.id, email: data.user.email ?? '' }
      const previous = this.state.user?.id === user.id ? this.state.profile : null
      rememberAccount({ user, profile: previous, at: Date.now() })
      this.put({ status: 'authenticated', user, profile: previous, profileError: false })
      try {
        const profile = await this.loadProfile(user.id)
        if (generation === this.generation) {
          rememberAccount({ user, profile, at: Date.now() })
          this.put({ status: 'authenticated', user, profile, profileError: false })
        }
      } catch {
        if (generation === this.generation)
          this.put({ status: 'authenticated', user, profile: previous, profileError: true })
      }
    } catch (error) {
      if (generation === this.generation) {
        if (temporaryAuthFailure(error)) this.recover(session.user.id)
        else this.signedOut()
      }
    }
  }

  retry(): Promise<void> {
    if (!this.client) return Promise.resolve()
    if (this.retrying) return this.retrying
    this.retrying = this.restore().finally(() => {
      this.retrying = null
    })
    return this.retrying
  }
  private async restore() {
    if (!this.client) return
    const generation = ++this.generation
    this.stopRecovery()
    try {
      const { data, error } = await this.client.auth.getSession()
      if (generation !== this.generation) return
      if (error) {
        if (temporaryAuthFailure(error)) this.recover(this.state.user?.id)
        else this.signedOut()
      } else if (data.session) await this.resolveSession(data.session, generation)
      else this.signedOut()
    } catch (error) {
      if (generation === this.generation) {
        if (temporaryAuthFailure(error)) this.recover(this.state.user?.id)
        else this.signedOut()
      }
    }
  }

  updateProfile(profile: Profile) {
    if (this.state.user?.id === profile.id) {
      this.generation++
      rememberAccount({ user: this.state.user, profile, at: Date.now() })
      this.put({ ...this.state, profile, profileError: false })
    }
  }
}
function temporaryAuthFailure(error: unknown) {
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0
  return !status || status === 408 || status === 429 || status >= 500
}
