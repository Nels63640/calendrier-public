export interface PublicConfig {
  url: string
  key: string
}

export function publicConfig(urlValue?: string, keyValue?: string): PublicConfig | null {
  const url = urlValue?.trim() ?? ''
  const key = keyValue?.trim() ?? ''
  if (!url && !key) return null
  if (!url || !key) throw new Error('Configuration publique Supabase incomplète.')
  const parsed = new URL(url)
  const local = ['localhost', '127.0.0.1'].includes(parsed.hostname)
  if (
    (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== '/'
  )
    throw new Error('Adresse Supabase invalide.')
  if (!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key))
    throw new Error(
      'Utiliser uniquement une clé Supabase publishable, jamais une clé secrète ou service_role.',
    )
  return { url: parsed.origin, key }
}
