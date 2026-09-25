import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import { Link } from 'react-router'
import { useAccount } from '../auth/auth-context'
import { useFamily } from '../family/family-context'
import { FamilyBar, FamilyGate } from '../family/FamilyShell'
import { expandEvent, calendarWindow } from '../../../../../packages/domain/src/recurrence'
import type { FamilyRecord, Occurrence } from '../../../../../packages/domain/src/family'
import { EventEditor } from './EventEditor'
import { CustodyCalendarPage } from './CustodyCalendarPage'
import { CalendarSheet } from './CalendarSheet'
import { Icon } from '../../components/Icon'

type View = 'year' | 'month' | 'day'
const week = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const paths = {
  back: 'm15 4-8 8 8 8',
  next: 'm9 4 8 8-8 8',
  search: 'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Zm5.5 13 5 5',
  plus: 'M12 3v18M3 12h18',
  view: 'M4 3h17v7H4ZM4 14h17v7H4ZM7 6.5h8M7 17.5h5',
  calendar: 'M3 4h18v17H3ZM3 8h18M7 11h1m3 0h1m3 0h1M7 15h1m3 0h1m3 0h1',
  inbox: 'm3 11 5-7h8l5 7v9H3ZM3 12h5l2 4h4l2-4h5',
}
function Glyph({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}
function monthLabel(date: Temporal.PlainDate) {
  return date.toLocaleString('fr', { month: 'long' })
}
function datesInMonth(date: Temporal.PlainDate) {
  const start = date.with({ day: 1 })
  return Array.from({ length: start.daysInMonth }, (_, index) => start.add({ days: index }))
}

export function CalendarPage({ custody = false }: { custody?: boolean }) {
  return custody ? <CustodyCalendarPage custody /> : <NativeCalendar />
}
function NativeCalendar() {
  const family = useFamily(),
    account = useAccount()
  const zone = account.profile?.time_zone ?? 'Europe/Paris'
  const [now, setNow] = useState(() => Temporal.Now.zonedDateTimeISO(zone))
  const today = now.toPlainDate()
  const [date, setDate] = useState(() => today)
  const [view, setView] = useState<View>('year')
  const [sheet, setSheet] = useState<'search' | 'views' | 'calendars' | 'family' | null>(null)
  const [query, setQuery] = useState('')
  const [editor, setEditor] = useState<{
    record?: FamilyRecord<'event'>
    occurrence?: Occurrence
    date: string
  } | null>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const touch = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const id = setInterval(() => setNow(Temporal.Now.zonedDateTimeISO(zone)), 30000)
    return () => clearInterval(id)
  }, [zone])
  useEffect(() => {
    const color = document.querySelector('meta[name="theme-color"]')
    const previous = color?.getAttribute('content') ?? ''
    color?.setAttribute('content', '#000000')
    return () => {
      color?.setAttribute('content', previous)
    }
  }, [])
  useEffect(() => {
    if (scroll.current)
      scroll.current.scrollTop =
        view === 'day' ? Math.max(0, (date.equals(today) ? now.hour - 1 : 8) * 50) : 0
    // Le défilement dépend de la navigation, pas de chaque minute de l’horloge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, date.toString()])
  const records = useMemo(
    () => family.snapshot.records.filter((r) => r.kind === 'event') as FamilyRecord<'event'>[],
    [family.snapshot.records],
  )
  const first = date.with(sheet === 'search' || view === 'year' ? { month: 1, day: 1 } : { day: 1 })
  const end = first.add(sheet === 'search' || view === 'year' ? { years: 1 } : { months: 2 })
  const from = first.toZonedDateTime(zone).toInstant().toString(),
    to = end.toZonedDateTime(zone).toInstant().toString()
  const occurrences = useMemo(
    () =>
      records
        .flatMap((r) => expandEvent(r, family.snapshot.exceptions, from, to))
        .sort((a, b) => a.startInstant.localeCompare(b.startInstant)),
    [records, family.snapshot.exceptions, from, to],
  )
  function onDay(day: Temporal.PlainDate) {
    const range = calendarWindow(day.toString(), 'day', zone)
    return occurrences.filter((o) =>
      o.event.allDay
        ? o.start.slice(0, 10) <= day.toString() && o.end.slice(0, 10) > day.toString()
        : o.startInstant < range.to && o.endInstant > range.from,
    )
  }
  function open(o: Occurrence) {
    setSheet(null)
    setEditor({
      record: records.find((r) => r.id === o.eventId),
      occurrence: o,
      date: o.start.slice(0, 10),
    })
  }
  function move(direction: number) {
    setDate(
      date.add(
        view === 'year'
          ? { years: direction }
          : view === 'month'
            ? { months: direction }
            : { days: direction },
      ),
    )
  }
  function eventButton(o: Occurrence, style?: CSSProperties) {
    return (
      <button
        className={`native-event ${o.event.custody ? 'is-custody' : ''}`}
        key={o.eventId + o.originalStart}
        style={{ ...style, '--event-color': o.event.color } as CSSProperties}
        onClick={() => open(o)}
      >
        <strong>{o.event.title}</strong>
        <span>
          {o.event.allDay
            ? 'Toute la journée'
            : Temporal.Instant.from(o.startInstant)
                .toZonedDateTimeISO(zone)
                .toPlainTime()
                .toString({ smallestUnit: 'minute' })}
          {o.event.custody ? ' · Garde' : ''}
        </span>
      </button>
    )
  }
  function miniMonth(month: Temporal.PlainDate) {
    return (
      <button
        className="mini-month"
        key={month.month}
        aria-label={monthLabel(month) + ' ' + month.year}
        onClick={() => {
          setDate(month)
          setView('month')
        }}
      >
        <h2 className={month.year === today.year && month.month === today.month ? 'red' : ''}>
          {monthLabel(month)}
        </h2>
        <span className="mini-grid" aria-hidden="true">
          {Array.from({ length: month.dayOfWeek - 1 }, (_, i) => (
            <span key={'empty' + i} />
          ))}
          {datesInMonth(month).map((day) => (
            <span key={day.day} className={day.equals(today) ? 'today' : ''}>
              {day.day}
            </span>
          ))}
        </span>
      </button>
    )
  }
  function largeMonth(month: Temporal.PlainDate, next = false) {
    return (
      <section key={month.toString()} aria-label={monthLabel(month) + ' ' + month.year}>
        {next && (
          <button className="next-month-title" onClick={() => setDate(month)}>
            {monthLabel(month)}
          </button>
        )}
        <div className="native-month-grid">
          {Array.from({ length: month.dayOfWeek - 1 }, (_, i) => (
            <div className="native-day blank" key={'empty' + i} />
          ))}
          {datesInMonth(month).map((day) => {
            const events = onDay(day)
            return (
              <div key={day.day} className={`native-day ${day.dayOfWeek > 5 ? 'weekend' : ''}`}>
                <button
                  className={`native-date ${day.equals(today) ? 'today' : ''}`}
                  aria-label={'Voir le ' + day.toString()}
                  onClick={() => {
                    setDate(day)
                    setView('day')
                  }}
                >
                  {day.day}
                </button>
                <div className="month-events">
                  {events.slice(0, 2).map((o) => eventButton(o))}
                  {events.length > 2 && (
                    <button
                      className="more-events"
                      onClick={() => {
                        setDate(day)
                        setView('day')
                      }}
                    >
                      +{events.length - 2}
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
  const weekStart = date.subtract({ days: date.dayOfWeek - 1 })
  const dayEvents = onDay(date)
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
    <div className="native-calendar">
      <header className="native-topbar">
        {view !== 'year' ? (
          <button
            className="glass back-control"
            aria-label={view === 'month' ? 'Afficher l’année' : 'Afficher le mois'}
            onClick={() => setView(view === 'day' ? 'month' : 'year')}
          >
            <Glyph name="back" />
            <span>{view === 'month' ? date.year : monthLabel(date)}</span>
          </button>
        ) : (
          <span />
        )}
        <div className="glass top-actions">
          {view !== 'year' && (
            <button aria-label="Choisir une vue" onClick={() => setSheet('views')}>
              <Glyph name="view" />
            </button>
          )}
          <button aria-label="Rechercher un événement" onClick={() => setSheet('search')}>
            <Glyph name="search" />
          </button>
          <button
            aria-label="Ajouter un événement"
            onClick={() => setEditor({ date: date.toString() })}
          >
            <Glyph name="plus" />
          </button>
        </div>
      </header>
      {view === 'day' ? (
        <div className="native-week-strip">
          {week.map((label, i) => {
            const d = weekStart.add({ days: i })
            return (
              <button
                key={i}
                className={i > 4 ? 'weekend' : ''}
                aria-label={'Voir le ' + d.toString()}
                aria-pressed={d.equals(date)}
                onClick={() => setDate(d)}
              >
                <small>{label}</small>
                <span className={d.equals(today) ? 'today' : d.equals(date) ? 'selected-day' : ''}>
                  {d.day}
                </span>
              </button>
            )
          })}
          <h1 tabIndex={-1}>
            {date.toLocaleString('fr', { weekday: 'long' })} -{' '}
            {date.toLocaleString('fr', { day: 'numeric', month: 'short', year: 'numeric' })}
          </h1>
        </div>
      ) : (
        <div className={`native-heading ${view === 'year' ? 'year-heading' : ''}`}>
          <h1 tabIndex={-1}>{view === 'year' ? date.year : monthLabel(date)}</h1>
          <div className="period-controls">
            <button aria-label="Période précédente" onClick={() => move(-1)}>
              <Glyph name="back" />
            </button>
            <button aria-label="Période suivante" onClick={() => move(1)}>
              <Glyph name="next" />
            </button>
          </div>
        </div>
      )}
      {view === 'month' && (
        <div className="native-weekdays">
          {week.map((d, i) => (
            <span className={i > 4 ? 'weekend' : ''} key={i}>
              {d}
            </span>
          ))}
        </div>
      )}
      {(family.error || family.offline || family.pending > 0) && (
        <div className="native-sync" role="status">
          {family.error || (family.offline ? 'Hors connexion' : 'Modifications en attente')}{' '}
          <button onClick={() => setSheet('calendars')}>Détails</button>
        </div>
      )}
      <div
        key={view + date.toString()}
        className={`native-scroll ${view}-scroll`}
        ref={scroll}
        onTouchStart={(e) => {
          touch.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY }
        }}
        onTouchEnd={(e) => {
          if (!touch.current) return
          const dx = e.changedTouches[0]!.clientX - touch.current.x,
            dy = e.changedTouches[0]!.clientY - touch.current.y
          if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2) move(dx < 0 ? 1 : -1)
          touch.current = null
        }}
      >
        {view === 'year' && (
          <>
            <div className="native-year-grid">
              {Array.from({ length: 12 }, (_, i) => miniMonth(date.with({ month: i + 1, day: 1 })))}
            </div>
            <button className="next-year" onClick={() => move(1)}>
              {date.year + 1}
            </button>
          </>
        )}
        {view === 'month' && (
          <>
            {largeMonth(date.with({ day: 1 }))}
            {largeMonth(date.with({ day: 1 }).add({ months: 1 }), true)}
          </>
        )}
        {view === 'day' && (
          <>
            {dayEvents.some((o) => o.event.allDay) && (
              <div className="native-all-day">
                <span>Journée</span>
                <div>{dayEvents.filter((o) => o.event.allDay).map((o) => eventButton(o))}</div>
              </div>
            )}
            <div className="native-timeline">
              {Array.from({ length: 25 }, (_, hour) => (
                <div className="hour-line" key={hour} style={{ top: hour * 50 }}>
                  <span>{String(hour % 24).padStart(2, '0')}:00</span>
                  <i />
                </div>
              ))}
              <div className="timed-events">
                {timed.map(({ o, start, finish, lane, columns }) =>
                  eventButton(o, {
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
          </>
        )}
      </div>
      <footer className="native-bottom">
        <button
          className="glass today-control"
          onClick={() => {
            setDate(Temporal.Now.plainDateISO(zone))
            if (scroll.current)
              scroll.current.scrollTop = view === 'day' ? Math.max(0, (now.hour - 1) * 50) : 0
          }}
        >
          Aujourd’hui
        </button>
        <div className="glass bottom-actions">
          <button aria-label="Choisir une vue" onClick={() => setSheet('views')}>
            <Glyph name="calendar" />
          </button>
          <button aria-label="Ouvrir le menu" onClick={() => setSheet('calendars')}>
            <Glyph name="inbox" />
            {family.snapshot.invitations.filter((i) => !i.used).length > 0 && (
              <i className="invitation-dot" />
            )}
          </button>
        </div>
      </footer>
      {sheet && (
        <CalendarSheet
          title={
            sheet === 'search'
              ? 'Rechercher'
              : sheet === 'views'
                ? 'Présentation'
                : sheet === 'family'
                  ? 'Foyer et invitations'
                  : 'Votre famille'
          }
          onClose={() => setSheet(null)}
        >
          {sheet === 'views' && (
            <div className="sheet-options">
              {(
                [
                  ['year', 'Année'],
                  ['month', 'Mois'],
                  ['day', 'Journée'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={view === value}
                  onClick={() => {
                    setView(value)
                    setSheet(null)
                  }}
                >
                  {label}
                  {view === value ? ' ✓' : ''}
                </button>
              ))}
              <label>
                Aller à une date
                <input
                  type="date"
                  value={date.toString()}
                  onChange={(e) => {
                    if (e.target.value) setDate(Temporal.PlainDate.from(e.target.value))
                  }}
                />
              </label>
            </div>
          )}
          {sheet === 'search' && (
            <div className="native-search">
              <label>
                Rechercher dans les événements de {date.year}
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Titre, lieu…"
                />
              </label>
              <div className="search-results">
                {query.trim() &&
                  occurrences
                    .filter((o) =>
                      (o.event.title + ' ' + o.event.location)
                        .toLocaleLowerCase('fr')
                        .includes(query.trim().toLocaleLowerCase('fr')),
                    )
                    .slice(0, 100)
                    .map((o) => (
                      <div key={o.eventId + o.originalStart}>
                        <small>
                          {Temporal.Instant.from(o.startInstant)
                            .toZonedDateTimeISO(zone)
                            .toPlainDate()
                            .toLocaleString('fr', { day: 'numeric', month: 'long' })}
                        </small>
                        {eventButton(o)}
                      </div>
                    ))}
                {query.trim() &&
                  !occurrences.some((o) =>
                    (o.event.title + ' ' + o.event.location)
                      .toLocaleLowerCase('fr')
                      .includes(query.trim().toLocaleLowerCase('fr')),
                  ) && <p>Aucun événement trouvé cette année.</p>}
              </div>
            </div>
          )}
          {sheet === 'calendars' && (
            <>
              <FamilyBar />
              <nav className="calendar-tools" aria-label="Navigation du calendrier">
                <Link to="/taches">
                  <Icon name="tasks" size={30} />
                  <strong>Tâches</strong>
                  <small>À faire ensemble</small>
                </Link>
                <Link to="/courses">
                  <Icon name="basket" size={30} />
                  <strong>Courses</strong>
                  <small>Notre liste</small>
                </Link>
                <Link to="/garde">
                  <Icon name="people" size={30} />
                  <strong>Garde</strong>
                  <small>Le rythme des enfants</small>
                </Link>
                <Link to="/foyer">
                  <Icon name="home" size={30} />
                  <strong>Famille</strong>
                  <small>Membres et invitations</small>
                </Link>
                <Link to="/profil">
                  <Icon name="profile" size={30} />
                  <strong>Mon profil</strong>
                  <small>Compte et réglages</small>
                </Link>
              </nav>
            </>
          )}
          {sheet === 'family' && (
            <div className="sheet-options">
              <p>
                Les invitations se partagent avec un code. Aucun e-mail d’invitation n’est envoyé
                automatiquement.
              </p>
              <Link to="/foyer">Inviter un proche ou rejoindre un foyer</Link>
              <p>{family.snapshot.members.length} membre(s) dans le foyer actif.</p>
            </div>
          )}
        </CalendarSheet>
      )}
      {editor && (
        <CalendarSheet
          title={editor.record ? 'Événement' : 'Nouvel événement'}
          onClose={() => setEditor(null)}
        >
          <FamilyGate>
            <EventEditor
              compact
              key={
                (editor.record?.id ?? 'new') +
                (editor.occurrence?.originalStart ?? '') +
                editor.date
              }
              {...editor}
              custody={Boolean(editor.record?.payload.custody)}
              onClose={() => setEditor(null)}
            />
          </FamilyGate>
        </CalendarSheet>
      )}
    </div>
  )
}
