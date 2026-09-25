import type { PushSubscription } from 'web-push'

export function validateSubscription(value: unknown): PushSubscription {
  if (!value || typeof value !== 'object') throw new Error('Abonnement invalide')
  const input = value as Record<string, unknown>
  if (typeof input.endpoint !== 'string' || input.endpoint.length > 2048)
    throw new Error('Endpoint invalide')
  const url = new URL(input.endpoint)
  const allowed =
    url.hostname === 'fcm.googleapis.com' ||
    url.hostname === 'updates.push.services.mozilla.com' ||
    url.hostname.endsWith('.push.apple.com')
  if (!allowed || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash)
    throw new Error('Service push non autorisé')
  if (!input.keys || typeof input.keys !== 'object') throw new Error('Clés absentes')
  const keys = input.keys as Record<string, unknown>
  for (const [name, bytes] of [
    ['p256dh', 65],
    ['auth', 16],
  ] as const) {
    const key = keys[name]
    if (
      typeof key !== 'string' ||
      !/^[A-Za-z0-9_-]+={0,2}$/.test(key) ||
      Buffer.from(key, 'base64url').length !== bytes
    )
      throw new Error('Clé invalide')
  }
  if (Buffer.from(keys.p256dh as string, 'base64url')[0] !== 4)
    throw new Error('Clé publique invalide')
  return {
    endpoint: input.endpoint,
    keys: { p256dh: keys.p256dh as string, auth: keys.auth as string },
  }
}
