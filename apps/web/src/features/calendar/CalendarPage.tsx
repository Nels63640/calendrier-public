import { useDaySwipe } from './useDaySwipe'
import { BirthdayEditor } from './BirthdayEditor'
import { CalendarLayersPanel } from './CalendarLayersPanel'
import { publicCalendarRecords, readLayers, type CalendarLayers } from './public-calendars'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { Temporal } from '@js-temporal/polyfill'
import { Link } from 'react-router'
import { useAccount } from '../auth/auth-context'
import { useFamily } from '../family/family-context'
import { FamilyBar, FamilyGate } from '../family/FamilyShell'
import { expandEvent } from '../../../../../packages/domain/src/recurrence'
import type { FamilyRecord, Occurrence } from '../../../../../packages/domain/src/family'
import { EventEditor } from './EventEditor'
import { CustodyCalendarPage } from './CustodyCalendarPage'
import { CalendarSheet } from './CalendarSheet'
import { Icon } from '../../components/Icon'
import { useMonthZoom } from './useMonthZoom'
import { MonthStream } from './MonthStream'
import { CalendarStream } from './CalendarStream'
import { DayBlock } from './DayBlock'

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
  const [layers, setLayers] = useState(readLayers)
  const [publicEvent, setPublicEvent] = useState<Occurrence | null>(null)
  const [birthday, setBirthday] = useState(false)
  const publicRecords = useMemo(
    () => publicCalendarRecords(layers, account.profile?.time_zone ?? 'Europe/Paris'),
    [layers, account.profile?.time_zone],
  )
  function changeLayers(value: CalendarLayers) {
    setLayers(value)
    try {
      localStorage.setItem('family-calendar-layers', JSON.stringify(value))
    } catch {
      /* Affichage en mémoire si le stockage est refusé. */
    }
  }
  const zone = account.profile?.time_zone ?? 'Europe/Paris'
  const [now, setNow] = useState(() => Temporal.Now.zonedDateTimeISO(zone))
  const today = now.toPlainDate()
  const [date, setDate] = useState(() => today)
  const [view, setView] = useState<View>('year')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const selectedDates = [...selected].sort((a, b) => Temporal.PlainDate.compare(a, b))
  function endSelection() {
    setSelecting(false)
    setSelected([])
  }
  const [monthVisit, setMonthVisit] = useState(0)
  const [caption, setCaption] = useState<{ anchor: string; month: Temporal.PlainDate } | null>(null)
  const dateKey = date.toString()
  const visibleMonth = caption?.anchor === dateKey ? caption.month : date
  const onVisibleMonth = useCallback(
    (month: Temporal.PlainDate) => {
      setCaption((previous) =>
        previous?.anchor === dateKey && previous.month.equals(month)
          ? previous
          : { anchor: dateKey, month },
      )
    },
    [dateKey],
  )
  const [sheet, setSheet] = useState<'search' | 'views' | 'calendars' | 'family' | null>(null)
  const [query, setQuery] = useState('')
  const [editor, setEditor] = useState<{
    record?: FamilyRecord<'event'>
    occurrence?: Occurrence
    date: string
    periodEnd?: string
    initialStart?: string
  } | null>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const { prepareMonthZoom, prepareYearZoom } = useMonthZoom(view, date.toString(), scroll)
  const dayTransition = useRef<{ target: string; offset: number; direction: number } | null>(null)
  const daySwipe = useDaySwipe(
    view === 'day' && !sheet && !editor && !publicEvent && !birthday,
    (direction) => {
      const next = visibleMonth.add({ days: direction })
      if (next.year < 0 || next.year > 275759) return
      const viewport = scroll.current
      const timeline = viewport?.querySelector<HTMLElement>(
        '[data-day="' + visibleMonth.toString() + '"] .native-timeline',
      )
      if (viewport && timeline) {
        dayTransition.current = {
          target: next.toString(),
          offset: viewport.getBoundingClientRect().top - timeline.getBoundingClientRect().top,
          direction,
        }
      }
      setCaption(null)
      setDate(next)
      setMonthVisit((value) => value + 1)
    },
  )
  useLayoutEffect(() => {
    const transition = dayTransition.current
    dayTransition.current = null
    const viewport = scroll.current
    if (!transition || view !== 'day' || transition.target !== dateKey || !viewport) return
    const timeline = viewport.querySelector<HTMLElement>(
      '[data-day="' + dateKey + '"] .native-timeline',
    )
    if (!timeline) return
    // Conserver l'heure visible, même si les événements de journée changent de hauteur.
    viewport.scrollBy({
      top:
        timeline.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top +
        transition.offset,
      behavior: 'instant',
    })
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      viewport.querySelector('.calendar-stream')?.animate(
        [
          { transform: 'translateX(' + transition.direction * 40 + 'px)', opacity: 0.65 },
          { transform: 'translateX(0)', opacity: 1 },
        ],
        { duration: 180, easing: 'ease-out' },
      )
    }
  }, [view, dateKey, monthVisit])
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
  const records = useMemo(
    () => [
      ...(family.snapshot.records.filter(
        (r) =>
          r.kind === 'event' &&
          (layers.birthdays ||
            (r.payload as FamilyRecord<'event'>['payload']).eventType !== 'birthday'),
      ) as FamilyRecord<'event'>[]),
      ...publicRecords,
    ],
    [family.snapshot.records, publicRecords, layers.birthdays],
  )
  const first = visibleMonth.with(
    sheet === 'search' || view === 'year' ? { month: 1, day: 1 } : { day: 1 },
  )
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
  function open(o: Occurrence) {
    setSheet(null)
    if (o.eventId.startsWith('public:')) {
      setPublicEvent(o)
      return
    }
    setEditor({
      record: records.find((r) => r.id === o.eventId),
      occurrence: o,
      date: o.start.slice(0, 10),
    })
  }
  function move(direction: number) {
    if (
      view === 'year' &&
      (visibleMonth.year + direction < 0 || visibleMonth.year + direction > 275759)
    )
      return
    const next = visibleMonth.add(
      view === 'year'
        ? { years: direction }
        : view === 'month'
          ? { months: direction }
          : { days: direction },
    )
    if (next.year < 0 || next.year > 275759) return
    setDate(next)
    setMonthVisit((v) => v + 1)
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
        data-month={month.toString()}
        key={month.month}
        aria-label={monthLabel(month) + ' ' + month.year}
        onClick={(event) => {
          prepareMonthZoom(event.currentTarget)
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
  const weekStart = visibleMonth.subtract({ days: visibleMonth.dayOfWeek - 1 })
  return (
    <div className="native-calendar" {...daySwipe}>
      <header className="native-topbar">
        {view !== 'year' ? (
          <button
            className="glass back-control"
            aria-label={view === 'month' ? 'Afficher l’année' : 'Afficher le mois'}
            onClick={() => {
              if (view === 'month') prepareYearZoom(visibleMonth.with({ day: 1 }).toString())
              endSelection()
              setDate(visibleMonth)
              setView(view === 'day' ? 'month' : 'year')
            }}
          >
            <Glyph name="back" />
            <span>{view === 'month' ? visibleMonth.year : monthLabel(visibleMonth)}</span>
          </button>
        ) : (
          <span />
        )}
        <div className="glass top-actions">
          {view !== 'year' && !selecting && (
            <button aria-label="Choisir une vue" onClick={() => setSheet('views')}>
              <Glyph name="view" />
            </button>
          )}
          {view === 'month' && (
            <button
              className="select-toggle"
              aria-pressed={selecting}
              onClick={() => {
                if (selecting) endSelection()
                else setSelecting(true)
              }}
            >
              {selecting ? 'Annuler' : 'Sélect.'}
            </button>
          )}
          {!selecting && (
            <>
              <button aria-label="Rechercher un événement" onClick={() => setSheet('search')}>
                <Glyph name="search" />
              </button>
              <button
                aria-label="Ajouter un événement"
                onClick={() => setEditor({ date: visibleMonth.toString() })}
              >
                <Glyph name="plus" />
              </button>
            </>
          )}
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
                aria-pressed={d.equals(visibleMonth)}
                disabled={d.year < 0 || d.year > 275759}
                onClick={() => {
                  setDate(d)
                  setMonthVisit((v) => v + 1)
                }}
              >
                <small>{label}</small>
                <span
                  className={
                    d.equals(today) ? 'today' : d.equals(visibleMonth) ? 'selected-day' : ''
                  }
                >
                  {d.day}
                </span>
              </button>
            )
          })}
          <h1 tabIndex={-1}>
            {visibleMonth.toLocaleString('fr', { weekday: 'long' })} -{' '}
            {visibleMonth.toLocaleString('fr', { day: 'numeric', month: 'short' })}{' '}
            {visibleMonth.year}
          </h1>
        </div>
      ) : (
        <div className={`native-heading ${view === 'year' ? 'year-heading' : ''}`}>
          <h1 tabIndex={-1}>{view === 'year' ? visibleMonth.year : monthLabel(visibleMonth)}</h1>
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
          <button
            onClick={(event) => {
              event.currentTarget.focus({ preventScroll: true })
              setSheet('calendars')
            }}
          >
            Détails
          </button>
        </div>
      )}
      <div
        key={view + date.toString() + monthVisit}
        className={`native-scroll ${view}-scroll`}
        ref={scroll}
        onTouchStart={(e) => {
          if (view === 'day' || e.touches?.length !== 1) return
          touch.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY }
        }}
        onTouchEnd={(e) => {
          if (view === 'day' || !touch.current || !e.changedTouches?.length) return
          const dx = e.changedTouches[0]!.clientX - touch.current.x,
            dy = e.changedTouches[0]!.clientY - touch.current.y
          if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2) move(dx < 0 ? 1 : -1)
          touch.current = null
        }}
      >
        {view === 'year' && (
          <CalendarStream
            anchor={date.with({ month: 1, day: 1 })}
            scroll={scroll}
            onVisible={onVisibleMonth}
            unit="years"
          >
            {(year) => (
              <section
                className="stream-year"
                data-year={year.year}
                data-current-year={year.year === date.year ? '' : undefined}
              >
                <h2 className="stream-year-title">{year.year}</h2>
                <div className="native-year-grid">
                  {Array.from({ length: 12 }, (_, i) =>
                    miniMonth(year.with({ month: i + 1, day: 1 })),
                  )}
                </div>
              </section>
            )}
          </CalendarStream>
        )}
        {view === 'month' && (
          <MonthStream
            anchor={date}
            today={today}
            zone={zone}
            records={records}
            exceptions={family.snapshot.exceptions}
            scroll={scroll}
            onVisible={onVisibleMonth}
            selecting={selecting}
            selected={selected}
            onSelect={(day) => {
              if (selecting) {
                const key = day.toString()
                setSelected((previous) =>
                  previous.includes(key)
                    ? previous.filter((value) => value !== key)
                    : [...previous, key],
                )
                return
              }
              setDate(day)
              setView('day')
            }}
            renderEvent={(o) => eventButton(o)}
          />
        )}
        {view === 'day' && (
          <CalendarStream
            anchor={date}
            unit="days"
            scroll={scroll}
            onVisible={onVisibleMonth}
            initialOffset={35 + Math.max(0, date.equals(today) ? now.hour - 1 : 8) * 50}
          >
            {(day) => (
              <DayBlock
                date={day}
                today={today}
                now={now}
                zone={zone}
                records={records}
                exceptions={family.snapshot.exceptions}
                renderEvent={eventButton}
                onCreate={(day, minute) =>
                  setEditor({
                    date: day.toString(),
                    initialStart: day
                      .toPlainDateTime({ hour: Math.floor(minute / 60), minute: minute % 60 })
                      .toString({ smallestUnit: 'minute' }),
                  })
                }
              />
            )}
          </CalendarStream>
        )}
      </div>
      <footer className={`native-bottom ${selecting ? 'selection-footer' : ''}`}>
        {selecting ? (
          <div className="glass selection-actions">
            <div role="status">
              <strong>
                {selected.length} jour{selected.length > 1 ? 's' : ''} sélectionné
                {selected.length > 1 ? 's' : ''}
              </strong>
              <small>
                {selectedDates.length > 1
                  ? 'Du premier au dernier jour inclus'
                  : 'Choisis au moins deux jours'}
              </small>
            </div>
            <button
              className="button primary"
              disabled={selected.length < 2}
              onClick={() =>
                setEditor({ date: selectedDates[0]!, periodEnd: selectedDates.at(-1)! })
              }
            >
              Créer une période
            </button>
          </div>
        ) : (
          <>
            <button
              className="glass today-control"
              onClick={() => {
                const current = Temporal.Now.zonedDateTimeISO(zone)
                setNow(current)
                setCaption(null)
                setDate(current.toPlainDate())
                setMonthVisit((value) => value + 1)
              }}
            >
              Aujourd’hui
            </button>
            <div className="glass bottom-actions">
              <button aria-label="Choisir une vue" onClick={() => setSheet('views')}>
                <Glyph name="calendar" />
              </button>
              <button
                aria-label="Ouvrir le menu"
                onClick={(event) => {
                  event.currentTarget.focus({ preventScroll: true })
                  setSheet('calendars')
                }}
              >
                <Glyph name="inbox" />
                {family.snapshot.invitations.filter((i) => !i.used).length > 0 && (
                  <i className="invitation-dot" />
                )}
              </button>
            </div>
          </>
        )}
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
                    setDate(visibleMonth)
                    setView(value)
                    setMonthVisit((v) => v + 1)
                    setSheet(null)
                  }}
                >
                  {label}
                  {view === value ? ' ✓' : ''}
                </button>
              ))}
              <form
                className="year-jump"
                onSubmit={(event) => {
                  event.preventDefault()
                  const year = Number(new FormData(event.currentTarget).get('year'))
                  if (!Number.isInteger(year) || year < 0 || year > 275759) return
                  setDate(Temporal.PlainDate.from({ year, month: 1, day: 1 }))
                  setView('year')
                  setMonthVisit((v) => v + 1)
                  setSheet(null)
                }}
              >
                <label>
                  Aller à l’année
                  <input
                    name="year"
                    type="number"
                    min="0"
                    max="275759"
                    step="1"
                    required
                    defaultValue={visibleMonth.year}
                  />
                </label>
                <button className="button primary">Afficher l’année</button>
              </form>
              <label>
                Aller à une date
                <input
                  type="date"
                  value={
                    visibleMonth.year === 0
                      ? ''
                      : `${String(visibleMonth.year).padStart(4, '0')}-${String(visibleMonth.month).padStart(2, '0')}-${String(visibleMonth.day).padStart(2, '0')}`
                  }
                  min="0001-01-01"
                  max="275759-12-31"
                  onChange={(e) => {
                    if (e.target.value) {
                      const [year, month, day] = e.target.value.split('-').map(Number)
                      if (year! >= 1 && year! <= 275759) {
                        const selected = Temporal.PlainDate.from({
                          year: year!,
                          month: month!,
                          day: day!,
                        })
                        setDate(selected)
                        setMonthVisit((v) => v + 1)
                      }
                    }
                  }}
                />
              </label>
            </div>
          )}
          {sheet === 'search' && (
            <div className="native-search">
              <label>
                Rechercher dans les événements de {visibleMonth.year}
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
              <CalendarLayersPanel
                value={layers}
                onChange={changeLayers}
                onBirthday={() => {
                  setSheet(null)
                  setBirthday(true)
                }}
              />
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
      {birthday && (
        <CalendarSheet title="Nouvel anniversaire" onClose={() => setBirthday(false)}>
          <FamilyGate>
            <BirthdayEditor
              onClose={() => {
                setBirthday(false)
                changeLayers({ ...layers, birthdays: true })
              }}
            />
          </FamilyGate>
        </CalendarSheet>
      )}
      {publicEvent && (
        <CalendarSheet title={publicEvent.event.title} onClose={() => setPublicEvent(null)}>
          <div className="calendar-public-detail">
            <p>
              {Temporal.PlainDate.from(publicEvent.start.slice(0, 10)).toLocaleString('fr', {
                dateStyle: 'long',
              })}
              {publicEvent.end.slice(0, 10) !==
              Temporal.PlainDate.from(publicEvent.start.slice(0, 10)).add({ days: 1 }).toString()
                ? ' au ' +
                  Temporal.PlainDate.from(publicEvent.end.slice(0, 10))
                    .subtract({ days: 1 })
                    .toLocaleString('fr', { dateStyle: 'long' })
                : ''}
            </p>
            <p>{publicEvent.event.description}</p>
            <p className="muted">Calendrier officiel en lecture seule.</p>
            <a href={publicEvent.event.location} target="_blank" rel="noreferrer">
              Consulter la source officielle
            </a>
          </div>
        </CalendarSheet>
      )}
      {editor && (
        <CalendarSheet
          title={
            editor.periodEnd
              ? 'Créer une période'
              : editor.record
                ? 'Événement'
                : 'Nouvel événement'
          }
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
              onSaved={endSelection}
              custody={Boolean(editor.record?.payload.custody)}
              onClose={() => setEditor(null)}
            />
          </FamilyGate>
        </CalendarSheet>
      )}
    </div>
  )
}
