import test from 'node:test'
import assert from 'node:assert/strict'
import {
  queuePush,
  pendingPush,
  cancelPendingPush,
  completePendingPush,
  settlePendingPush,
} from '../../apps/web/src/features/settings/pending-push.ts'

test('une activation push interrompue reprend sans réinscription du navigateur et respecte la désactivation', async (t) => {
  const memory = new Map<string, string>()
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    },
  })
  t.after(() => {
    cancelPendingPush()
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  })
  const subscription = {
    endpoint: 'https://web.push.apple.com/test',
    toJSON: () => ({ keys: { p256dh: 'public-test', auth: 'test' } }),
  }
  let offline = true
  let sends = 0
  const transport = {
    current: () => true,
    subscription: async () => subscription,
    register: async () => {
      sends++
      if (offline) throw Error('network')
    },
  }
  queuePush('alice', subscription.endpoint)
  await assert.rejects(completePendingPush('alice', transport))
  assert.equal(pendingPush()?.userId, 'alice')
  await completePendingPush('bob', transport)
  assert.equal(sends, 1)
  offline = false
  await completePendingPush('alice', transport)
  assert.equal(sends, 2)
  assert.equal(pendingPush(), null)
  await completePendingPush('alice', transport)
  assert.equal(sends, 2)
  // Une désactivation attend la requête en cours avant de désinscrire côté serveur.
  let finish!: () => void
  const waiting = new Promise<void>((resolve) => {
    finish = resolve
  })
  queuePush('alice', subscription.endpoint)
  const pending = completePendingPush('alice', { ...transport, register: () => waiting })
  await new Promise((resolve) => setTimeout(resolve, 0))
  cancelPendingPush()
  let settled = false
  const settledPromise = settlePendingPush().then(() => {
    settled = true
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(settled, false)
  finish()
  await pending
  await settledPromise
  assert.equal(pendingPush(), null)
  await completePendingPush('alice', transport)
  assert.equal(sends, 2)
  queuePush('alice', subscription.endpoint)
  await completePendingPush('alice', { ...transport, current: () => false })
  await completePendingPush('alice', {
    ...transport,
    subscription: async () => ({ ...subscription, endpoint: 'https://web.push.apple.com/changed' }),
  })
  assert.equal(sends, 2)
})
