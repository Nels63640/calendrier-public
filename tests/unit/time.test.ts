import test from 'node:test'
import assert from 'node:assert/strict'
import { custodyWeek, localDateTime } from '../../packages/domain/src/time.ts'

test('une semaine de garde conserve 18 h au passage à l’heure d’été', () => {
  const { start, end, startUtc, endUtc } = custodyWeek(
    { date: '2026-03-27', time: '18:00', timeZone: 'Europe/Paris' },
    0,
  )
  assert.equal(start.hour, 18)
  assert.equal(end.hour, 18)
  assert.equal(startUtc, '2026-03-27T17:00:00Z')
  assert.equal(endUtc, '2026-04-03T16:00:00Z')
  assert.equal(start.until(end).total('hours'), 167)
})
test('une semaine de garde conserve 18 h au passage à l’heure d’hiver', () => {
  const { start, end } = custodyWeek(
    { date: '2026-10-23', time: '18:00', timeZone: 'Europe/Paris' },
    0,
  )
  assert.equal(end.hour, 18)
  assert.equal(start.until(end).total('hours'), 169)
})
test('l’alternance est ancrée sur la référence et traverse une année', () => {
  const { start } = custodyWeek({ date: '2026-12-25', time: '18:00', timeZone: 'Europe/Paris' }, 1)
  assert.equal(start.toPlainDate().toString(), '2027-01-08')
  assert.equal(start.dayOfWeek, 5)
})
test('les fuseaux distincts représentent le même instant sans confondre les heures locales', () => {
  const paris = localDateTime({ date: '2026-03-20', time: '18:00', timeZone: 'Europe/Paris' })
  assert.equal(paris.withTimeZone('America/New_York').hour, 13)
  assert.equal(
    paris.toInstant().toString(),
    paris.withTimeZone('America/New_York').toInstant().toString(),
  )
})
test('les heures inexistantes et ambiguës sont refusées explicitement', () => {
  for (const date of ['2026-03-29', '2026-10-25'])
    assert.throws(
      () => localDateTime({ date, time: '02:30', timeZone: 'Europe/Paris' }),
      RangeError,
    )
})
test('dates invalides, fuseaux invalides et expansion illimitée sont refusés', () => {
  assert.throws(
    () => localDateTime({ date: '2026-02-30', time: '18:00', timeZone: 'Europe/Paris' }),
    RangeError,
  )
  assert.throws(
    () => localDateTime({ date: '2026-01-01', time: '18:00', timeZone: 'Invalide/Fuseau' }),
    RangeError,
  )
  assert.throws(
    () => custodyWeek({ date: '2026-01-01', time: '18:00', timeZone: 'Europe/Paris' }, 521),
    RangeError,
  )
})
