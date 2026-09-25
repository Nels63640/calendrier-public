import type { Profile } from './auth-validation.ts'
interface VerifiedAccount {
  user: { id: string; email: string }
  profile: Profile | null
  at: number
}
const key = 'family-calendar:verified-account'
export function rememberAccount(value: VerifiedAccount) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* stockage facultatif */
  }
}
export function forgetAccount() {
  try {
    localStorage.removeItem(key)
  } catch {
    /* stockage indisponible */
  }
}
export function offlineAccount(id: string): VerifiedAccount | null {
  if (typeof navigator === 'undefined' || navigator.onLine) return null
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as VerifiedAccount | null
    return value?.user.id === id && Date.now() - value.at < 7 * 86400000 ? value : null
  } catch {
    return null
  }
}
