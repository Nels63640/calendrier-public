import test from 'node:test'
import assert from 'node:assert/strict'
import type { Session, SupabaseClient, AuthChangeEvent } from '@supabase/supabase-js'
import { AuthStore } from '../../apps/web/src/features/auth/auth-store.ts'
import { publicConfig } from '../../apps/web/src/data/public-config.ts'
import { profileSchema, passwordSchema } from '../../apps/web/src/features/auth/auth-validation.ts'
import type { Profile } from '../../apps/web/src/features/auth/auth-validation.ts'

test('configuration : aucune clé privilégiée et aucun HTTP distant', () => {
  assert.equal(publicConfig(), null)
  assert.throws(() => publicConfig('https://example.supabase.co', 'sb_secret_sensitive'))
  assert.throws(() => publicConfig('http://example.supabase.co', 'sb_publishable_1234567890123456'))
  assert.throws(() => publicConfig('https://example.supabase.co'))
  assert.equal(
    publicConfig('https://example.supabase.co', 'sb_publishable_1234567890123456')?.url,
    'https://example.supabase.co',
  )
})

test('validation : prénom, avatar, fuseau et longueur du mot de passe', () => {
  const profile = { first_name: ' Alice ', avatar: 'leaf', time_zone: 'Europe/Paris' }
  assert.equal(profileSchema.parse(profile).first_name, 'Alice')
  for (const patch of [
    { first_name: '\u0000' },
    { time_zone: '+02:00' },
    { time_zone: 'Mars/Base' },
    { avatar: 'admin' },
  ])
    assert.equal(profileSchema.safeParse({ ...profile, ...patch }).success, false)
  assert.equal(passwordSchema.safeParse('tropcourt').success, false)
})

test('une réponse de profil retardée ne réaffiche pas le compte déconnecté', async () => {
  let callback: (event: AuthChangeEvent, session: Session | null) => void = () => {}
  let finish!: (profile: Profile) => void
  const pending = new Promise<Profile>((resolve) => {
    finish = resolve
  })
  const client = {
    auth: {
      onAuthStateChange(fn: typeof callback) {
        callback = fn
        return { data: { subscription: { unsubscribe() {} } } }
      },
      async getUser() {
        return {
          data: {
            user: { id: 'alice', email: 'alice@example.test', email_confirmed_at: '2026-09-25' },
          },
          error: null,
        }
      },
    },
  } as unknown as SupabaseClient
  const store = new AuthStore(client, () => pending)
  const stop = store.start()
  callback('SIGNED_IN', { access_token: 'synthetic', user: { id: 'alice' } } as Session)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(store.getSnapshot().status, 'authenticated')
  callback('SIGNED_OUT', null)
  finish({
    id: 'alice',
    first_name: 'Alice',
    avatar: 'profile',
    time_zone: 'UTC',
    created_at: '',
    updated_at: '',
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(store.getSnapshot().status, 'signed-out')
  assert.equal(store.getSnapshot().profile, null)
  stop()
})
