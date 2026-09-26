import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { familyDatabase, asUser, call, alice, bob } from '../helpers/family-database.ts'
import {
  blankEvent,
  type FamilyRecord,
  type EventException,
} from '../../packages/domain/src/family.ts'
import { planReminders } from '../../packages/domain/src/reminders.ts'
import { detailedPushBody } from '../../packages/domain/src/push-content.ts'
import { notificationContent } from '../../apps/web/src/pwa/push-payload.ts'

test('notifications détaillées : heure civile, journée entière, groupes et anciens messages', () => {
  const details = [
    { title: 'Dentiste', start: '2026-09-27T14:30', timeZone: 'Europe/Paris', allDay: false },
  ]
  for (const [action, prefix] of [
    ['created', 'Ajout'],
    ['updated', 'Modification'],
    ['deleted', 'Suppression'],
  ]) {
    const body = detailedPushBody('activity', action, details)
    assert.equal(body, prefix + ' : 27/09/2026 à 14:30 · Dentiste')
    assert.equal(notificationContent({ kind: 'activity', entity: 'event', body }).body, body)
  }
  assert.equal(
    detailedPushBody('reminder', null, details),
    'Rappel : 27/09/2026 à 14:30 · Dentiste',
  )
  assert.equal(
    detailedPushBody('reminder', null, [
      { title: 'Vacances', start: '2026-09-27T00:00', allDay: true },
    ]),
    'Rappel : 27/09/2026 · Journée entière · Vacances',
  )
  assert.equal(
    detailedPushBody('activity', 'created', Array(3).fill({ title: 'Courses' }), 4),
    'Ajout : Courses ; Courses ; Courses ; +1 autre(s)',
  )
  assert.equal(
    notificationContent({ kind: 'reminder' }).body,
    'Un rappel vous attend dans votre espace.',
  )
  assert.equal(
    notificationContent({ kind: 'reminder', entity: 'task', body: 'Rappel : Acheter du pain' }).url,
    '/taches',
  )
  assert.equal(
    notificationContent({ kind: 'test', body: 'Texte arbitraire' }).body,
    'Votre notification de test est arrivée.',
  )
  assert.ok(
    detailedPushBody('activity', 'updated', Array(4).fill({ title: 'x'.repeat(2000) })).length <=
      650,
  )
})

test('un rappel décrit la vraie occurrence déplacée, avec son nouveau titre', () => {
  const payload = {
    ...blankEvent('2026-09-26', 'Europe/Paris'),
    title: 'Dentiste',
    start: '2026-09-26T14:00',
    end: '2026-09-26T15:00',
    reminders: [15],
    recurrence: { frequency: 'weekly' as const, interval: 1, count: 4, until: null },
  }
  const record = {
    id: randomUUID(),
    household_id: randomUUID(),
    kind: 'event',
    version: 2,
    payload,
  } as FamilyRecord<'event'>
  const exceptions = [
    {
      event_id: record.id,
      original_start: '2026-10-03T14:00',
      cancelled: false,
      payload: {
        ...payload,
        title: 'Dentiste déplacé',
        start: '2026-10-03T16:00',
        end: '2026-10-03T17:00',
        recurrence: null,
      },
    },
  ] as EventException[]
  const jobs = planReminders(
    [{ record, exceptions, subscriptions: [{ id: 'appareil' }] }],
    '2026-10-03T13:45:00Z',
  )
  assert.equal(jobs.length, 1)
  assert.deepEqual(jobs[0].detail, {
    title: 'Dentiste déplacé',
    start: '2026-10-03T16:00',
    allDay: false,
    timeZone: 'Europe/Paris',
  })
  assert.match(jobs[0].id, /2026-10-03T14:00/)
})

test('SQL : détails autorisés, occurrence modifiée, groupes et retrait de visibilité', async () => {
  const db = await familyDatabase()
  try {
    await asUser(db, alice)
    const home = await call<string>(db, 'create_household', ['Famille'])
    const invite = await call<string>(db, 'create_invitation', [home, null, 'member'])
    await asUser(db, bob)
    await call(db, 'accept_invitation', [invite])
    const subscription = await call<string>(db, 'register_push', [
      'https://fcm.googleapis.com/device',
      'a'.repeat(87),
      'b'.repeat(22),
    ])
    await asUser(db, alice)
    const id = randomUUID()
    const payload = {
      ...blankEvent('2026-09-26', 'Europe/Paris'),
      title: 'Dentiste',
      description: 'Ne pas envoyer cette description',
      start: '2026-09-26T14:00',
      end: '2026-09-26T15:00',
      reminders: [],
      recurrence: { frequency: 'weekly', interval: 1, count: 4, until: null },
    }
    await call(db, 'save_record', [home, id, 'event', payload, 0, randomUUID(), false])
    await assert.rejects(call(db, 'claim_activity', []), /permission denied/)
    await db.exec('reset role; set role service_role')
    let jobs = await call<{ details: unknown[]; total: number }[]>(db, 'claim_activity', [])
    assert.equal(jobs.length, 1)
    assert.deepEqual(jobs[0].details, [
      { title: 'Dentiste', start: '2026-09-26T14:00', allDay: false, timeZone: 'Europe/Paris' },
    ])
    assert.ok(!JSON.stringify(jobs).includes('Ne pas envoyer'))
    await asUser(db, alice)
    await call(db, 'change_occurrence', [
      home,
      id,
      1,
      1,
      '2026-10-03T14:00',
      'one',
      {
        ...payload,
        title: 'Dentiste déplacé',
        reminders: [15],
        start: '2026-10-03T16:00',
        end: '2026-10-03T17:00',
      },
      false,
      randomUUID(),
    ])
    await db.exec('reset role; set role service_role')
    jobs = await call(db, 'claim_activity', [])
    const detail = {
      title: 'Dentiste déplacé',
      start: '2026-10-03T16:00',
      allDay: false,
      timeZone: 'Europe/Paris',
    }
    assert.deepEqual(jobs[0].details, [detail])
    assert.equal((await call<unknown[]>(db, 'reminder_sources', [])).length, 1)
    await call(db, 'enqueue_reminder', [
      'precise',
      id,
      2,
      subscription,
      new Date(Date.now() - 1000).toISOString(),
      { ...detail, description: 'Ne pas envoyer' },
    ])
    const reminders = await call<{ details: unknown[]; kind: string }[]>(db, 'claim_reminders', [])
    assert.deepEqual(reminders[0].details, [detail])
    assert.equal(reminders[0].kind, 'event')
    await asUser(db, alice)
    await db.exec('begin')
    for (let i = 0; i < 4; i++)
      await call(db, 'save_record', [
        home,
        randomUUID(),
        'shopping',
        { title: 'Article ' + i, quantity: '1', category: '', done: false },
        0,
        randomUUID(),
        false,
      ])
    await db.exec('commit; reset role; set role service_role')
    jobs = await call(db, 'claim_activity', [])
    assert.equal(jobs.length, 1)
    assert.equal(jobs[0].details.length, 3)
    assert.equal(jobs[0].total, 4)
    await asUser(db, alice)
    await call(db, 'save_record', [
      home,
      id,
      'event',
      { ...payload, title: 'Visible' },
      2,
      randomUUID(),
      false,
    ])
    await call(db, 'save_record', [
      home,
      id,
      'event',
      { ...payload, title: 'Privé', visibility: 'private' },
      3,
      randomUUID(),
      false,
    ])
    await db.exec('reset role; set role service_role')
    assert.deepEqual(await call(db, 'claim_activity', []), [])
  } finally {
    await db.close()
  }
})
