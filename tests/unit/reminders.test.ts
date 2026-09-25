import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { familyDatabase, asUser, call, alice } from '../helpers/family-database.ts'
import { blankEvent, type FamilyRecord } from '../../packages/domain/src/family.ts'
import { planReminders } from '../../packages/domain/src/reminders.ts'

test('rappels : échéances et identifiants stables, aucun rappel pour une tâche terminée', () => {
  const record: FamilyRecord<'event'> = {
    id: 'event',
    household_id: 'home',
    kind: 'event',
    created_by: 'alice',
    version: 2,
    deleted: false,
    created_at: '',
    updated_at: '',
    payload: {
      ...blankEvent('2026-09-25', 'Europe/Paris'),
      title: 'École',
      start: '2026-09-25T14:00',
      end: '2026-09-25T15:00',
      reminders: [15, 60],
    },
  }
  const source = { record, exceptions: [], subscriptions: [{ id: 'device' }] }
  const jobs = planReminders([source], '2026-09-25T11:45:00Z')
  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].due, '2026-09-25T11:45:00Z')
  assert.deepEqual(planReminders([source], '2026-09-25T11:46:00Z'), jobs)
  assert.equal(
    planReminders(
      [
        {
          ...source,
          record: {
            ...record,
            kind: 'task',
            payload: {
              title: 'Fini',
              description: '',
              assignee: null,
              due: '2026-09-25T14:00',
              timeZone: 'Europe/Paris',
              priority: 'normal',
              status: 'done',
              reminders: [15],
            },
          },
        },
      ],
      '2026-09-25T11:45:00Z',
    ).length,
    0,
  )
})

test('rappels PostgreSQL : serveur seul, déduplication, invalidation et abonnements expirés', async () => {
  const db = await familyDatabase()
  try {
    await asUser(db, alice)
    const h = await call<string>(db, 'create_household', ['Rappels'])
    await assert.rejects(
      call(db, 'register_push', ['https://127.0.0.1/push', 'a'.repeat(87), 'a'.repeat(22)]),
      /INVALID_SUBSCRIPTION/,
    )
    const subscription = await call<string>(db, 'register_push', [
      'https://web.push.apple.com/test',
      'a'.repeat(87),
      'a'.repeat(22),
    ])
    const id = randomUUID(),
      payload = { ...blankEvent('2026-09-25', 'UTC'), title: 'Rappel', reminders: [0] }
    await call(db, 'save_record', [h, id, 'event', payload, 0, randomUUID(), false])
    await assert.rejects(call(db, 'claim_reminders', []), /permission denied/)
    await db.exec('reset role;set role service_role')
    const due = new Date(Date.now() - 1000).toISOString()
    await call(db, 'enqueue_reminder', ['one', id, 1, subscription, due])
    await call(db, 'enqueue_reminder', ['one', id, 1, subscription, due])
    const jobs = await call<{ id: string; lease: string }[]>(db, 'claim_reminders', [])
    assert.equal(jobs.length, 1)
    assert.equal((await call<unknown[]>(db, 'claim_reminders', [])).length, 0)
    await call(db, 'finish_reminder', ['one', jobs[0].lease, 'sent'])
    await call(db, 'enqueue_reminder', ['stale', id, 1, subscription, due])
    await asUser(db, alice)
    await call(db, 'save_record', [
      h,
      id,
      'event',
      { ...payload, title: 'Modifié' },
      1,
      randomUUID(),
      false,
    ])
    await db.exec('reset role;set role service_role')
    assert.equal((await call<unknown[]>(db, 'claim_reminders', [])).length, 0)
    await call(db, 'enqueue_reminder', ['expired', id, 2, subscription, due])
    const pending = await call<{ id: string; lease: string }[]>(db, 'claim_reminders', [])
    await call(db, 'finish_reminder', ['expired', pending[0].lease, 'expired'])
    await db.exec('reset role')
    assert.equal((await db.query('select * from private.push_subscriptions')).rows.length, 0)
  } finally {
    await db.close()
  }
})
