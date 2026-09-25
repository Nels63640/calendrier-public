import { request } from 'node:http'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, createECDH } from 'node:crypto'
import { createProofServer, type SendPush } from '../../scripts/push-proof/server.ts'
import { notificationContent, safeNotificationUrl } from '../../apps/web/src/pwa/push-payload.ts'

const origin = 'http://127.0.0.1:4173'
const key = createECDH('prime256v1')
key.generateKeys()
const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/test-only',
  keys: {
    p256dh: key.getPublicKey().toString('base64url'),
    auth: randomBytes(16).toString('base64url'),
  },
}

async function fixture(
  run: (
    post: (path: string, body?: unknown, headers?: Record<string, string>) => Promise<Response>,
    advance: (ms: number) => void,
  ) => Promise<void>,
  send: SendPush = async () => {},
) {
  let now = Date.now()
  const token = randomBytes(32).toString('base64url')
  const server = createProofServer(
    { publicKey: 'cle-publique-de-test', accessToken: token, origin },
    send,
    () => now,
  )
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Serveur indisponible')
  const post = (path: string, body: unknown = {}, headers: Record<string, string> = {}) =>
    new Promise<Response>((resolve, reject) => {
      const req = request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path: '/api/push-proof/' + path,
          method: 'POST',
          headers: {
            Host: '127.0.0.1:4173',
            Origin: origin,
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
            ...headers,
          },
        },
        (response) => {
          const chunks: Buffer[] = []
          response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
          response.on('end', () =>
            resolve(
              new Response(Buffer.concat(chunks), {
                status: response.statusCode,
                headers: {
                  'content-type': String(response.headers['content-type']),
                  'cache-control': String(response.headers['cache-control']),
                },
              }),
            ),
          )
        },
      )
      req.on('error', reject)
      req.end(JSON.stringify(body))
    })
  try {
    await run(post, (ms) => {
      now += ms
    })
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

test('le serveur exige le code privé et la bonne origine', () =>
  fixture(async (post) => {
    assert.equal((await post('session', {}, { Authorization: 'Bearer incorrect' })).status, 401)
    assert.equal((await post('session', {}, { Origin: 'https://autre.example' })).status, 403)
    assert.equal((await post('session', {}, { Host: 'autre.example' })).status, 403)
    const response = await post('session')
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), { publicKey: 'cle-publique-de-test' })
  }))

test('les destinations internes, faux services push et clés invalides sont refusés', () =>
  fixture(async (post) => {
    for (const endpoint of [
      'http://127.0.0.1/admin',
      'https://fcm.googleapis.com.evil.example/push',
      'https://evil.example/?push.apple.com',
      'https://fcm.googleapis.com:8443/x',
    ]) {
      assert.equal((await post('subscribe', { ...subscription, endpoint })).status, 400)
    }
    assert.equal(
      (await post('subscribe', { ...subscription, keys: { p256dh: 'abc', auth: 'abc' } })).status,
      400,
    )
    assert.equal((await post('subscribe', { extra: 'x'.repeat(9000) })).status, 400)
  }))

test('l’envoi utilise l’abonnement enregistré, limite les répétitions et permet le retrait', async () => {
  let sends = 0
  await fixture(
    async (post, advance) => {
      const response = await post('subscribe', subscription)
      const { id } = (await response.json()) as { id: string }
      assert.equal(response.status, 200)
      assert.equal((await post('send', { id })).status, 200)
      assert.equal((await post('send', { id })).status, 429)
      advance(10_001)
      assert.equal((await post('send', { id })).status, 200)
      assert.equal(sends, 2)
      assert.equal((await post('unsubscribe', { id })).status, 200)
      assert.equal((await post('send', { id })).status, 404)
    },
    async (stored, payload) => {
      assert.equal(stored.endpoint, subscription.endpoint)
      assert.deepEqual(Object.keys(JSON.parse(payload)), ['id'])
      sends++
    },
  )
})

test('les abonnements sont oubliés après une heure', () =>
  fixture(async (post, advance) => {
    const { id } = (await (await post('subscribe', subscription)).json()) as { id: string }
    advance(3_600_001)
    assert.equal((await post('send', { id })).status, 404)
  }))

test('une réponse 410 du service push retire définitivement l’abonnement', () =>
  fixture(
    async (post) => {
      const { id } = (await (await post('subscribe', subscription)).json()) as { id: string }
      assert.equal((await post('send', { id })).status, 410)
      assert.equal((await post('send', { id })).status, 404)
    },
    async () => {
      throw { statusCode: 410 }
    },
  ))

test('une erreur du fournisseur ne révèle jamais son contenu', () =>
  fixture(
    async (post) => {
      const { id } = (await (await post('subscribe', subscription)).json()) as { id: string }
      const response = await post('send', { id })
      assert.equal(response.status, 503)
      assert.deepEqual(await response.json(), { error: 'Envoi non accepté' })
    },
    async () => {
      throw new Error('Détail confidentiel du fournisseur')
    },
  ))

test('les notifications restent neutres et leurs liens restent dans l’application', () => {
  assert.equal(
    notificationContent({ title: 'Privé', body: 'Privé' }).body,
    'Votre notification de test est arrivée.',
  )
  assert.equal(
    safeNotificationUrl('https://evil.example', origin),
    `${origin}/profil/notifications`,
  )
  assert.equal(
    safeNotificationUrl('/profil/notifications?secret=non', origin),
    `${origin}/profil/notifications`,
  )
})
