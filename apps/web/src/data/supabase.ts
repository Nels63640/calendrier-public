import { createClient } from '@supabase/supabase-js'
import { publicConfig } from './public-config'
import { createSessionStorage } from './session-storage'

const config = publicConfig(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)
export const sessionStorage = createSessionStorage()

const timedFetch: typeof fetch = async (input, options) => {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const signal = options?.signal
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, 12_000)
  try {
    return await fetch(input, { ...options, cache: 'no-store', signal: controller.signal })
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

export const supabase = config
  ? createClient(config.url, config.key, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
        storage: sessionStorage,
        storageKey: `family-calendar:auth:${new URL(config.url).host}`,
      },
      global: { fetch: timedFetch },
    })
  : null
