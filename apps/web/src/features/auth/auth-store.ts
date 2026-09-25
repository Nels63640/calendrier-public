import { offlineAccount, rememberAccount, forgetAccount } from './offline-account.ts'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Profile } from './auth-validation.ts'

export interface AccountState {
  status: 'unavailable' | 'loading' | 'signed-out' | 'authenticated' | 'error'
  user: { id: string; email: string } | null
  profile: Profile | null
  profileError: boolean
}

/** Invalidation des réponses retardées lors d’un changement de compte ou d’une déconnexion. */
export class AuthStore {
  private state: AccountState
  private listeners = new Set<() => void>()
  private generation = 0

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

  start() {
    if (!this.client) return () => {}
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      const generation = ++this.generation
      if (!session) {
        forgetAccount()
        this.put({ status: 'signed-out', user: null, profile: null, profileError: false })
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
    if (typeof window !== 'undefined') window.addEventListener('online', reconnect)
    return () => {
      if (typeof window !== 'undefined') window.removeEventListener('online', reconnect)
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
      })
      return
    }
    try {
      const { data, error } = await this.client.auth.getUser(session.access_token)
      if (generation !== this.generation) return
      if (error || !data.user || !data.user.email_confirmed_at) {
        forgetAccount()
        this.put({ status: 'error', user: null, profile: null, profileError: false })
        return
      }
      const user = { id: data.user.id, email: data.user.email ?? '' }
      this.put({
        status: 'authenticated',
        user,
        profile: this.state.user?.id === user.id ? this.state.profile : null,
        profileError: false,
      })
      try {
        const profile = await this.loadProfile(user.id)
        if (generation === this.generation) {
          rememberAccount({ user, profile, at: Date.now() })
          this.put({ status: 'authenticated', user, profile, profileError: false })
        }
      } catch {
        if (generation === this.generation)
          this.put({ status: 'authenticated', user, profile: null, profileError: true })
      }
    } catch {
      if (generation === this.generation)
        this.put({ status: 'error', user: null, profile: null, profileError: false })
    }
  }

  async retry() {
    if (!this.client) return
    const generation = ++this.generation
    const { data } = await this.client.auth.getSession()
    if (generation !== this.generation) return
    if (data.session) await this.resolveSession(data.session, generation)
    else this.put({ status: 'signed-out', user: null, profile: null, profileError: false })
  }

  updateProfile(profile: Profile) {
    if (this.state.user?.id === profile.id) {
      this.generation++
      this.put({ ...this.state, profile, profileError: false })
    }
  }
}
