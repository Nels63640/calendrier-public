import { supabase } from '../../data/supabase'
import { accountError, AccountError } from './auth-errors'
import {
  emailSchema,
  nameSchema,
  passwordSchema,
  codeSchema,
  profileSchema,
  type Profile,
} from './auth-validation'

function client() {
  if (!supabase) throw new AccountError('Les comptes ne sont pas encore activés dans cet espace.')
  return supabase
}

export const accountApi = {
  async signUp(email: string, password: string, firstName: string) {
    const { data, error } = await client().auth.signUp({
      email: emailSchema.parse(email),
      password: passwordSchema.parse(password),
      options: {
        data: {
          first_name: nameSchema.parse(firstName),
          time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      },
    })
    if (error) throw accountError(error)
    return Boolean(data.session)
  },
  async signIn(email: string, password: string) {
    const { error } = await client().auth.signInWithPassword({
      email: emailSchema.parse(email),
      password,
    })
    if (error) throw accountError(error)
  },
  async sendCode(email: string, purpose: 'email' | 'recovery') {
    const address = emailSchema.parse(email)
    const { error } =
      purpose === 'recovery'
        ? await client().auth.resetPasswordForEmail(address)
        : await client().auth.resend({ type: 'signup', email: address })
    if (error && error.code !== 'user_not_found') throw accountError(error)
  },
  async verify(email: string, code: string, purpose: 'email' | 'recovery') {
    const { data, error } = await client().auth.verifyOtp({
      email: emailSchema.parse(email),
      token: codeSchema.parse(code),
      type: purpose,
    })
    if (error) throw accountError(error)
    if (!data.session)
      throw new AccountError('Le code n’a pas permis d’ouvrir une session. Demandez-en un nouveau.')
  },
  async changePassword(password: string) {
    const { error } = await client().auth.updateUser({ password: passwordSchema.parse(password) })
    if (error) throw accountError(error)
  },
  async loadProfile(id: string): Promise<Profile> {
    const { data, error } = await client()
      .from('profiles')
      .select('id, first_name, avatar, time_zone, created_at, updated_at')
      .eq('id', id)
      .single()
    if (error)
      throw new AccountError('Votre profil n’a pas pu être chargé. Réessayez dans un instant.')
    return { ...data, ...profileSchema.parse(data) } as Profile
  },
  async saveProfile(id: string, values: unknown): Promise<Profile> {
    const input = profileSchema.parse(values)
    const { data, error } = await client()
      .from('profiles')
      .update(input)
      .eq('id', id)
      .select('id, first_name, avatar, time_zone, created_at, updated_at')
      .single()
    if (error) throw accountError(error)
    return { ...data, ...profileSchema.parse(data) } as Profile
  },
}
