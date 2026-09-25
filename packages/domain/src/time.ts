import { Temporal } from '@js-temporal/polyfill'

export interface LocalTime {
  date: string
  time: string
  timeZone: string
}

export function localDateTime(value: LocalTime) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !/^\d{2}:\d{2}$/.test(value.time))
    throw new RangeError('Date ou heure locale invalide')
  if (/^[+-]/.test(value.timeZone)) throw new RangeError('Un fuseau nommé est requis')
  const date = Temporal.PlainDate.from(value.date, { overflow: 'reject' })
  const time = Temporal.PlainTime.from(value.time, { overflow: 'reject' })
  // La preuve refuse les heures ambiguës/inexistantes plutôt que choisir silencieusement.
  return date.toPlainDateTime(time).toZonedDateTime(value.timeZone, { disambiguation: 'reject' })
}

/** Prototype temporel borné, pas encore un moteur de récurrence RRULE. */
export function custodyWeek(reference: LocalTime, occurrence: number, everyWeeks = 2) {
  if (
    !Number.isSafeInteger(occurrence) ||
    occurrence < 0 ||
    occurrence > 520 ||
    !Number.isSafeInteger(everyWeeks) ||
    everyWeeks < 1 ||
    everyWeeks > 52
  )
    throw new RangeError('Occurrence hors limites')
  const first = localDateTime(reference)
  const localStart = first.toPlainDateTime().add({ weeks: occurrence * everyWeeks })
  const start = localStart.toZonedDateTime(reference.timeZone, { disambiguation: 'reject' })
  const end = localStart
    .add({ weeks: 1 })
    .toZonedDateTime(reference.timeZone, { disambiguation: 'reject' })
  return { start, end, startUtc: start.toInstant().toString(), endUtc: end.toInstant().toString() }
}
