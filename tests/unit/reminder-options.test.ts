import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  reminderDue,
  reminderKey,
  remindersSchema,
} from '../../packages/domain/src/reminder-options.ts'
import { planReminders } from '../../packages/domain/src/reminders.ts'
import { originalAt } from '../../packages/domain/src/recurrence.ts'
import { blankEvent, type FamilyRecord } from '../../packages/domain/src/family.ts'
import { familyDatabase, asUser, call, alice } from '../helpers/family-database.ts'

test('rappels civils : mois courts, année bissextile, changement d’heure et anciennes minutes', () => {
  assert.equal(
    reminderDue({ amount: 1, unit: 'months' }, '2026-03-31T10:00', 'Europe/Paris'),
    '2026-02-28T09:00:00Z',
  )
  assert.equal(
    reminderDue({ amount: 1, unit: 'months' }, '2028-03-31T10:00', 'Europe/Paris'),
    '2028-02-29T09:00:00Z',
  )
  assert.equal(
    reminderDue({ amount: 1, unit: 'days' }, '2026-03-29T10:00', 'Europe/Paris'),
    '2026-03-28T09:00:00Z',
  )
  assert.equal(reminderDue(1440, '2026-03-29T10:00', 'Europe/Paris'), '2026-03-28T08:00:00Z')
  assert.equal(reminderKey({ amount: 1, unit: 'hours' }), reminderKey(60))
  assert.ok(remindersSchema.safeParse([{ amount: 12, unit: 'months' }, 15]).success)
  for (const value of [
    { amount: 13, unit: 'months' },
    { amount: -1, unit: 'days' },
    { amount: 0, unit: 'months' },
    { amount: 1.5, unit: 'hours' },
    { amount: 1, unit: 'years' },
  ])
    assert.equal(remindersSchema.safeParse([value]).success, false)
  const payload = {
    ...blankEvent('2027-09-26', 'Europe/Paris'),
    title: 'Anniversaire',
    start: '2027-09-26T10:00',
    end: '2027-09-26T11:00',
    reminders: [{ amount: 12, unit: 'months' as const }],
  }
  const record = { id: 'annual', version: 1, payload, kind: 'event' } as FamilyRecord<'event'>
  assert.equal(
    planReminders(
      [{ record, exceptions: [], subscriptions: [{ id: 'phone' }] }],
      '2026-09-26T08:00:00Z',
    ).length,
    1,
  )
})

test('anniversaire du 29 février : 28 février hors année bissextile, SQL et moteur identiques', async () => {
  const db = await familyDatabase()
  try {
    await asUser(db, alice)
    const home = await call<string>(db, 'create_household', ['Famille'])
    const payload = {
      ...blankEvent('2000-02-29', 'Europe/Paris'),
      title: 'Anniversaire',
      eventType: 'birthday' as const,
      allDay: true,
      start: '2000-02-29T00:00',
      end: '2000-03-01T00:00',
      recurrence: { frequency: 'yearly' as const, interval: 1, count: null, until: null },
      reminders: [{ amount: 1, unit: 'months' }],
    }
    await call(db, 'save_record', [home, randomUUID(), 'event', payload, 0, randomUUID(), false])
    assert.equal(originalAt({ ...payload, reminders: [] }, 27), '2027-02-28T00:00')
    assert.equal(originalAt({ ...payload, reminders: [] }, 28), '2028-02-29T00:00')
    await db.exec('reset role')
    const result = await db.query<{ value: string }>('select private.original_at($1,27) as value', [
      payload,
    ])
    assert.equal(result.rows[0].value, '2027-02-28T00:00')
    await asUser(db, alice)
    for (const reminders of [
      [{ amount: 13, unit: 'months' }],
      [{ amount: 1, unit: 'unknown' }],
      [{ unit: 'days' }],
      [{ amount: 1, unit: 'months', extra: true }],
      Array(6).fill(15),
    ]) {
      await assert.rejects(
        call(db, 'save_record', [
          home,
          randomUUID(),
          'event',
          { ...payload, reminders },
          0,
          randomUUID(),
          false,
        ]),
        /INVALID_DATA/,
      )
    }
  } finally {
    await db.close()
  }
})
