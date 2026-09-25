import { CalendarStream } from './CalendarStream'
import { useMemo, type ReactNode, type RefObject } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import type {
  EventException,
  FamilyRecord,
  Occurrence,
} from '../../../../../packages/domain/src/family'
import { calendarWindow, expandEvent } from '../../../../../packages/domain/src/recurrence'

interface Props {
  selecting?: boolean
  selected?: string[]
  anchor: Temporal.PlainDate
  today: Temporal.PlainDate
  zone: string
  records: FamilyRecord<'event'>[]
  exceptions: EventException[]
  scroll: RefObject<HTMLDivElement | null>
  onVisible: (month: Temporal.PlainDate) => void
  onSelect: (day: Temporal.PlainDate) => void
  renderEvent: (occurrence: Occurrence) => ReactNode
}

function MonthBlock({
  month,
  selecting,
  selected = [],
  anchor,
  today,
  records,
  exceptions,
  zone,
  onSelect,
  renderEvent,
}: Omit<Props, 'scroll' | 'onVisible'> & { month: Temporal.PlainDate }) {
  const range = calendarWindow(month.toString(), 'month', zone)
  const events = useMemo(
    () => records.flatMap((record) => expandEvent(record, exceptions, range.from, range.to)),
    [records, exceptions, range.from, range.to],
  )
  return (
    <section
      className="stream-month"
      data-month={month.toString()}
      data-current-anchor={month.equals(anchor.with({ day: 1 })) ? '' : undefined}
      aria-label={month.toLocaleString('fr', { month: 'long', year: 'numeric' })}
    >
      <h2 className="stream-month-title">
        {month.toLocaleString('fr', { month: 'long' })}
        {month.month === 1 && <small> {month.year}</small>}
      </h2>
      <div className={`native-month-grid ${selecting ? 'is-selecting' : ''}`}>
        {Array.from({ length: month.dayOfWeek - 1 }, (_, i) => (
          <div className="native-day blank" key={'empty' + i} />
        ))}
        {Array.from({ length: month.daysInMonth }, (_, index) => {
          const day = month.add({ days: index }),
            dayRange = calendarWindow(day.toString(), 'day', zone)
          const list = events.filter((o) =>
            o.event.allDay
              ? o.start.slice(0, 10) <= day.toString() && o.end.slice(0, 10) > day.toString()
              : o.startInstant < dayRange.to && o.endInstant > dayRange.from,
          )
          return (
            <div className={`native-day ${day.dayOfWeek > 5 ? 'weekend' : ''}`} key={day.day}>
              <button
                aria-pressed={selecting ? selected.includes(day.toString()) : undefined}
                className={`native-date ${day.equals(today) ? 'today' : ''}`}
                aria-label={(selecting ? 'Sélectionner le ' : 'Voir le ') + day.toString()}
                onClick={() => onSelect(day)}
              >
                {day.day}
              </button>
              <div className="month-events" inert={selecting}>
                {list.slice(0, 2).map(renderEvent)}
                {list.length > 2 && (
                  <button className="more-events" onClick={() => onSelect(day)}>
                    +{list.length - 2}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function MonthStream(props: Props) {
  return (
    <CalendarStream
      anchor={props.anchor.with({ day: 1 })}
      scroll={props.scroll}
      onVisible={props.onVisible}
      unit="months"
    >
      {(month) => <MonthBlock {...props} month={month} />}
    </CalendarStream>
  )
}
