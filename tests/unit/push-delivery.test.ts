import test from 'node:test'
import assert from 'node:assert/strict'
import { deliverPushJobs, type PushJob } from '../../packages/domain/src/push-delivery.ts'
import { notificationContent, safeNotificationUrl } from '../../apps/web/src/pwa/push-payload.ts'

test('envoi push : message neutre, reprise et endpoint expiré', async () => {
  const sent: { endpoint: string; payload: string }[] = [],
    finished: string[] = []
  const jobs: PushJob[] = ['ok', 'expired', 'retry', 'invalid'].map((id) => ({
    id,
    lease: 'lease-' + id,
    endpoint:
      id === 'invalid' ? 'https://internal.example/push' : 'https://fcm.googleapis.com/' + id,
    keys: { p256dh: 'public-test', auth: 'test' },
    kind: 'shopping',
    action: 'updated',
  }))
  await deliverPushJobs(jobs, 'activity', {
    async send(subscription, payload) {
      sent.push({ endpoint: subscription.endpoint, payload })
      if (subscription.endpoint.endsWith('expired')) throw { statusCode: 410 }
      if (subscription.endpoint.endsWith('retry')) throw Error('Réseau')
    },
    async finish(id, lease, status) {
      assert.equal(lease, 'lease-' + id)
      finished.push(id + ':' + status)
    },
  })
  assert.equal(sent.length, 3)
  assert.deepEqual(finished.sort(), ['expired:expired', 'invalid:retry', 'ok:sent', 'retry:retry'])
  const payload = JSON.parse(sent[0].payload)
  assert.equal(payload.kind, 'activity')
  assert.equal(payload.entity, 'shopping')
  assert.equal(
    notificationContent({ ...payload, title: 'Secret', body: 'Information privée' }).body,
    'Modification · La liste de courses.',
  )
  assert.equal(notificationContent(payload).url, '/courses')
  assert.equal(
    safeNotificationUrl('/courses', 'https://example.test'),
    'https://example.test/courses',
  )
  assert.equal(
    safeNotificationUrl('https://evil.test/courses', 'https://example.test'),
    'https://example.test/profil/notifications',
  )
})
