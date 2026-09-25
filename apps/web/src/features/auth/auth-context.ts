import { createContext, useContext } from 'react'
import { supabase } from '../../data/supabase'
import { accountApi } from './account-api'
import { AuthStore } from './auth-store'

export const authStore = new AuthStore(supabase, accountApi.loadProfile)
export const AuthContext = createContext(authStore.getSnapshot())
export function useAccount() {
  return useContext(AuthContext)
}
