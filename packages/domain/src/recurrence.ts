import { reminderDue, reminderKey } from './reminder-options.ts'
import { Temporal } from '@js-temporal/polyfill'
import type { FamilyEvent, FamilyRecord, EventException, Occurrence } from './family.ts'

function localString(value: Temporal.PlainDateTime) {
  return value.toString({ smallestUnit: 'minute' })
}
function approximateIndex(event: FamilyEvent, target: Temporal.PlainDateTime) {
  if (!event.recurrence) return 0
  const anchor = Temporal.PlainDateTime.from(event.start),
    rule = event.recurrence
  const delta =
    rule.frequency === 'yearly'
      ? target.year - anchor.year
      : rule.frequency === 'monthly'
        ? (target.year - anchor.year) * 12 + target.month - anchor.month
        : anchor.toPlainDate().until(target.toPlainDate(), { largestUnit: 'days' }).days /
          (rule.frequency === 'weekly' ? 7 : 1)
  return Math.max(0, Math.floor(delta / rule.interval))
}

/** Index basé sur l’ancre, sans dérive des fins de mois (31 janvier -> mars 31). */
export function originalAt(event: FamilyEvent, index: number): string | null {
  if (!Number.isSafeInteger(index) || index < 0 || index >= 10000)
    throw new RangeError('Index de récurrence hors limites.')
  if (!event.recurrence) return index === 0 ? event.start : null
  const rule = event.recurrence
  if (rule.count !== null && index >= rule.count) return null
  const anchor = Temporal.PlainDateTime.from(event.start)
  const n = index * rule.interval
  const result = anchor.add(
    rule.frequency === 'daily'
      ? { days: n }
      : rule.frequency === 'weekly'
        ? { weeks: n }
        : rule.frequency === 'monthly'
          ? { months: n }
          : { years: n },
  )
  // RFC 5545 : sauter une date absente, sans la rabattre au dernier jour.
  if (
    (rule.frequency === 'monthly' || rule.frequency === 'yearly') &&
    result.day !== anchor.day &&
    event.eventType !== 'birthday'
  )
    return null
  const value = localString(result)
  return rule.until && value > rule.until ? null : value
}

export function expandEvent(
  record: FamilyRecord<'event'>,
  exceptions: EventException[],
  from: string,
  to: string,
): Occurrence[] {
  const first = Temporal.Instant.from(from),
    last = Temporal.Instant.from(to)
  if (Temporal.Instant.compare(first, last) >= 0 || first.until(last).total('hours') > 24 * 370)
    throw new RangeError('Fenêtre limitée à une année.')
  const event = record.payload
  const duration = Temporal.PlainDateTime.from(event.start).until(
    Temporal.PlainDateTime.from(event.end),
    { largestUnit: 'days' },
  )
  const changes = new Map(
    exceptions.filter((e) => e.event_id === record.id).map((e) => [e.original_start, e]),
  )
  const output: Occurrence[] = []
  function add(original: string, index: number) {
    const exception = changes.get(original) ?? null
    if (exception?.cancelled) return
    const data = exception?.payload
      ? {
          ...exception.payload,
          visibility: event.visibility,
          viewers: event.viewers,
          people: event.people,
        }
      : event
    const start = exception?.payload?.start ?? original
    const end =
      exception?.payload?.end ?? localString(Temporal.PlainDateTime.from(start).add(duration))
    try {
      // Une heure inexistante/ambiguë n’est pas déplacée silencieusement.
      const s = Temporal.PlainDateTime.from(start)
        .toZonedDateTime(data.timeZone, { disambiguation: 'reject' })
        .toInstant()
      const e = Temporal.PlainDateTime.from(end)
        .toZonedDateTime(data.timeZone, { disambiguation: 'reject' })
        .toInstant()
      if (Temporal.Instant.compare(s, last) < 0 && Temporal.Instant.compare(e, first) > 0)
        output.push({
          eventId: record.id,
          originalStart: original,
          start,
          end,
          startInstant: s.toString(),
          endInstant: e.toString(),
          event: data,
          exception,
          index,
        })
    } catch {
      /* Occurrence invalide au changement d’heure : omise, règle conservée. */
    }
  }
  // Bornage fixe, indépendant du nombre de lignes en base ; exceptions déplacées incluses.
  const lower = first.toZonedDateTimeISO(event.timeZone).toPlainDateTime().subtract(duration)
  const startIndex = Math.max(0, approximateIndex(event, lower) - 2)
  for (
    let index = startIndex;
    index < (event.recurrence?.count ?? (event.recurrence ? 10000 : 1));
    index++
  ) {
    const original = originalAt(event, index)
    if (!original) continue
    if (
      original.slice(0, 10) >
        last.toZonedDateTimeISO(event.timeZone).toPlainDate().add({ days: 2 }).toString() &&
      !changes.has(original)
    )
      break
    add(original, index)
    changes.delete(original)
  }
  for (const [original] of changes) {
    // L’exception peut provenir de bien avant/après la fenêtre consultée.
    const index = approximateIndex(event, Temporal.PlainDateTime.from(original))
    if (index < 10000 && originalAt(event, index) === original) add(original, index)
  }
  return output.sort((a, b) => a.startInstant.localeCompare(b.startInstant))
}

export function calendarWindow(
  date: string,
  view: 'month' | 'week' | 'day' | 'agenda',
  zone: string,
) {
  const anchor = Temporal.PlainDate.from(date)
  const first =
    view === 'month'
      ? anchor.with({ day: 1 })
      : view === 'week'
        ? anchor.subtract({ days: anchor.dayOfWeek - 1 })
        : anchor
  const end =
    view === 'month'
      ? first.add({ months: 1 })
      : view === 'week'
        ? first.add({ days: 7 })
        : view === 'agenda'
          ? first.add({ days: 30 })
          : first.add({ days: 1 })
  return {
    first: first.toString(),
    end: end.toString(),
    from: first.toZonedDateTime(zone).toInstant().toString(),
    to: end.toZonedDateTime(zone).toInstant().toString(),
  }
}

export function reminderTimes(occurrence: Occurrence) {
  const dueTimes = new Set<string>()
  return occurrence.event.reminders.flatMap((reminder) => {
    const due = reminderDue(reminder, occurrence.start, occurrence.event.timeZone)
    if (dueTimes.has(due)) return []
    dueTimes.add(due)
    return [{ key: reminderKey(reminder), due }]
  })
}
