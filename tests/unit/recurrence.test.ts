import test from 'node:test'
import assert from 'node:assert/strict'
import {
  blankEvent,
  type FamilyRecord,
  type EventException,
} from '../../packages/domain/src/family.ts'
import { expandEvent, originalAt, reminderTimes } from '../../packages/domain/src/recurrence.ts'
const record: FamilyRecord<'event'> = {
  id: 'event',
  household_id: 'home',
  kind: 'event',
  created_by: 'alice',
  version: 1,
  deleted: false,
  created_at: '',
  updated_at: '',
  payload: {
    ...blankEvent('2026-03-20', 'Europe/Paris'),
    title: 'Garde',
    start: '2026-03-20T18:00',
    end: '2026-03-27T18:00',
    recurrence: { frequency: 'weekly', interval: 1, count: 8, until: null },
    reminders: [0, 1440],
  },
}
test('récurrence : heure locale constante, durée civile et rappels exacts', () => {
  const list = expandEvent(record, [], '2026-03-27T00:00:00Z', '2026-04-05T00:00:00Z')
  const dst = list.find((o) => o.originalStart === '2026-03-27T18:00')!
  assert.equal(dst.end, '2026-04-03T18:00')
  assert.equal((Date.parse(dst.endInstant) - Date.parse(dst.startInstant)) / 3600000, 167)
  assert.equal(reminderTimes(dst)[1].due, '2026-03-26T17:00:00Z')
})
test('une occurrence déplacée depuis hors fenêtre reste visible et garde son identité', () => {
  const exception: EventException = {
    id: 'exception',
    household_id: 'home',
    event_id: 'event',
    original_start: '2026-05-01T18:00',
    cancelled: false,
    payload: { ...record.payload, start: '2026-03-28T18:00', end: '2026-03-29T18:00' },
    version: 1,
  }
  const list = expandEvent(record, [exception], '2026-03-28T00:00:00Z', '2026-03-30T00:00:00Z')
  assert.equal(
    list.find((o) => o.originalStart === exception.original_start)?.start,
    '2026-03-28T18:00',
  )
  assert.equal(
    expandEvent(
      record,
      [{ ...exception, cancelled: true }],
      '2026-05-01T17:00:00Z',
      '2026-05-02T00:00:00Z',
    ).some((o) => o.originalStart === exception.original_start),
    false,
  )
})
test('mois courts sans dérive et limite de fenêtre', () => {
  const monthly = {
    ...record.payload,
    start: '2026-01-31T18:00',
    end: '2026-01-31T19:00',
    recurrence: { frequency: 'monthly' as const, interval: 1, count: null, until: null },
  }
  assert.equal(originalAt(monthly, 1), null)
  assert.equal(originalAt(monthly, 2), '2026-03-31T18:00')
  assert.throws(() => expandEvent(record, [], '2026-01-01T00:00:00Z', '2030-01-01T00:00:00Z'))
})
