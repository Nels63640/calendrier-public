import { useTimelineHold } from './useTimelineHold'
import { useMemo, type ReactNode, type CSSProperties } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import { calendarWindow, expandEvent } from '../../../../../packages/domain/src/recurrence'
import type {
  FamilyRecord,
  EventException,
  Occurrence,
} from '../../../../../packages/domain/src/family'
export function DayBlock({
  date,
  today,
  now,
  zone,
  records,
  exceptions,
  renderEvent,
  onCreate,
}: {
  date: Temporal.PlainDate
  today: Temporal.PlainDate
  now: Temporal.ZonedDateTime
  zone: string
  records: FamilyRecord<'event'>[]
  exceptions: EventException[]
  renderEvent: (o: Occurrence, style?: CSSProperties) => ReactNode
  onCreate: (date: Temporal.PlainDate, minute: number) => void
}) {
  const hold = useTimelineHold((minute) => onCreate(date, minute))
  const range = calendarWindow(date.toString(), 'day', zone)
  const dayEvents = useMemo(
    () =>
      records
        .flatMap((r) => expandEvent(r, exceptions, range.from, range.to))
        .filter(
          (o) =>
            !o.event.allDay ||
            (o.start.slice(0, 10) <= date.toString() && o.end.slice(0, 10) > date.toString()),
        ),
    [records, exceptions, range.from, range.to, date],
  )
  const timed = dayEvents
    .filter((o) => !o.event.allDay)
    .map((o) => {
      const a = Temporal.Instant.from(o.startInstant).toZonedDateTimeISO(zone),
        b = Temporal.Instant.from(o.endInstant).toZonedDateTimeISO(zone)
      const start = a.toPlainDate().equals(date) ? a.hour * 60 + a.minute : 0
      const finish = b.toPlainDate().equals(date) ? b.hour * 60 + b.minute : 1440
      return { o, start, finish, lane: 0, columns: 1 }
    })
    .sort((a, b) => a.start - b.start || b.finish - a.finish)
  // Une colonne par événement simultané, sans masquer les rendez-vous qui se chevauchent.
  for (let index = 0; index < timed.length;) {
    let endIndex = index + 1,
      groupEnd = timed[index]!.finish
    while (endIndex < timed.length && timed[endIndex]!.start < groupEnd) {
      groupEnd = Math.max(groupEnd, timed[endIndex]!.finish)
      endIndex++
    }
    const lanes: number[] = []
    for (let j = index; j < endIndex; j++) {
      let lane = lanes.findIndex((end) => end <= timed[j]!.start)
      if (lane < 0) lane = lanes.length
      lanes[lane] = timed[j]!.finish
      timed[j]!.lane = lane
    }
    for (let j = index; j < endIndex; j++) timed[j]!.columns = lanes.length
    index = endIndex
  }

  return (
    <section data-day={date.toString()} className="stream-day">
      <h2>
        {date.toLocaleString('fr', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}{' '}
        {date.year}
      </h2>
      {dayEvents.some((o) => o.event.allDay) && (
        <div className="native-all-day">
          <span>Journée</span>
          <div>{dayEvents.filter((o) => o.event.allDay).map((o) => renderEvent(o))}</div>
        </div>
      )}
      <div className="native-timeline" {...hold}>
        {Array.from({ length: 25 }, (_, hour) => (
          <div className="hour-line" key={hour} style={{ top: hour * 50 }}>
            <span>{String(hour % 24).padStart(2, '0')}:00</span>
            <i />
          </div>
        ))}
        <div className="timed-events">
          {timed.map(({ o, start, finish, lane, columns }) =>
            renderEvent(o, {
              position: 'absolute',
              top: (start * 50) / 60,
              height: Math.max(22, ((finish - start) * 50) / 60),
              left: `${(lane * 100) / columns}%`,
              width: `calc(${100 / columns}% - 3px)`,
            }),
          )}
        </div>
        {date.equals(today) && (
          <div className="now-line" style={{ top: ((now.hour * 60 + now.minute) * 50) / 60 }}>
            <span>{now.toPlainTime().toString({ smallestUnit: 'minute' })}</span>
          </div>
        )}
      </div>
    </section>
  )
}
