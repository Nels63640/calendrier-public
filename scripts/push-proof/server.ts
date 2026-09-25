import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import type { PushSubscription } from 'web-push'
import { validateSubscription } from './subscription.ts'

export interface ProofConfig {
  publicKey: string
  accessToken: string
  origin: string
}
export type SendPush = (subscription: PushSubscription, payload: string) => Promise<unknown>

function reply(response: ServerResponse, status: number, body: object) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(body))
}

async function readBody(request: IncomingMessage) {
  let bytes = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk as Uint8Array)
    bytes += buffer.length
    if (bytes <= 8192) chunks.push(buffer)
  }
  if (bytes > 8192) throw new Error('Requête trop volumineuse')
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Objet attendu')
  return value as Record<string, unknown>
}

export function createProofServer(config: ProofConfig, send: SendPush, now = Date.now) {
  const origin = new URL(config.origin)
  if (
    origin.origin !== config.origin ||
    (origin.protocol !== 'https:' && config.origin !== 'http://127.0.0.1:4173')
  )
    throw new Error('Origine HTTPS ou aperçu local requis')
  if (config.accessToken.length < 32) throw new Error('Code d’essai trop court')
  const records = new Map<
    string,
    { subscription: PushSubscription; expires: number; lastSent: number }
  >()
  let rateWindow = now()
  let requests = 0
  const expire = () => {
    for (const [id, record] of records) if (record.expires <= now()) records.delete(id)
  }
  const timer = setInterval(expire, 60_000)
  timer.unref()

  const server = createServer(async (request, response) => {
    expire()
    if (request.headers.host !== origin.host || request.headers.origin !== config.origin) {
      reply(response, 403, { error: 'Origine refusée' })
      return
    }
    if (request.method !== 'POST') {
      reply(response, 405, { error: 'Méthode refusée' })
      return
    }
    if (now() - rateWindow >= 60_000) {
      rateWindow = now()
      requests = 0
    }
    if (++requests > 60) {
      reply(response, 429, { error: 'Trop de requêtes' })
      return
    }
    const received = Buffer.from(request.headers.authorization ?? '')
    const expected = Buffer.from(`Bearer ${config.accessToken}`)
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      reply(response, 401, { error: 'Code refusé' })
      return
    }
    if (!request.headers['content-type']?.startsWith('application/json')) {
      reply(response, 415, { error: 'JSON requis' })
      return
    }
    let body: Record<string, unknown>
    try {
      body = await readBody(request)
    } catch {
      reply(response, 400, { error: 'Requête invalide' })
      return
    }
    const route = request.url
    if (route === '/api/push-proof/session') {
      reply(response, 200, { publicKey: config.publicKey })
      return
    }
    if (route === '/api/push-proof/subscribe') {
      let subscription: PushSubscription
      try {
        subscription = validateSubscription(body)
      } catch {
        reply(response, 400, { error: 'Abonnement invalide' })
        return
      }
      const existing = [...records].find(
        ([, record]) => record.subscription.endpoint === subscription.endpoint,
      )
      if (!existing && records.size >= 10) {
        reply(response, 429, { error: 'Limite des appareils d’essai atteinte' })
        return
      }
      const id = existing?.[0] ?? randomUUID()
      records.set(id, {
        subscription,
        expires: now() + 3_600_000,
        lastSent: existing?.[1].lastSent ?? -Infinity,
      })
      reply(response, 200, { id })
      return
    }
    if (route !== '/api/push-proof/unsubscribe' && route !== '/api/push-proof/send') {
      reply(response, 404, { error: 'Route inconnue' })
      return
    }
    const id = typeof body.id === 'string' ? body.id : ''
    if (route === '/api/push-proof/unsubscribe') {
      records.delete(id)
      reply(response, 200, { removed: true })
      return
    }
    const record = records.get(id)
    if (!record) {
      reply(response, 404, { error: 'Abonnement absent' })
      return
    }
    if (now() - record.lastSent < 10_000) {
      reply(response, 429, { error: 'Patientez avant un nouvel envoi' })
      return
    }
    record.lastSent = now()
    try {
      await send(record.subscription, JSON.stringify({ id: randomUUID() }))
      reply(response, 200, { accepted: true })
    } catch (failure) {
      const status =
        failure && typeof failure === 'object' && 'statusCode' in failure
          ? failure.statusCode
          : null
      if (status === 404 || status === 410) {
        records.delete(id)
        reply(response, 410, { error: 'Abonnement expiré' })
        return
      }
      reply(response, 503, { error: 'Envoi non accepté' })
    }
  })
  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  server.on('close', () => {
    clearInterval(timer)
    records.clear()
  })
  return server
}
