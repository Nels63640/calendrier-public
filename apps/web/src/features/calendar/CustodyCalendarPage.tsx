import { useMemo, useState } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import { PageHeading } from '../../components/PageHeading'
import { useAccount } from '../auth/auth-context'
import { useFamily } from '../family/family-context'
import { FamilyGate } from '../family/FamilyShell'
import { calendarWindow, expandEvent } from '../../../../../packages/domain/src/recurrence'
import type { FamilyRecord, Occurrence } from '../../../../../packages/domain/src/family'
import { EventEditor } from './EventEditor'

export function CustodyCalendarPage({ custody = false }: { custody?: boolean }) {
  const family = useFamily(),
    account = useAccount()
  const zone = account.profile?.time_zone ?? 'Europe/Paris'
  const [date, setDate] = useState(() => Temporal.Now.plainDateISO(zone).toString())
  const [view, setView] = useState<'month' | 'week' | 'day' | 'agenda'>('month')
  const [editor, setEditor] = useState<{
    record?: FamilyRecord<'event'>
    occurrence?: Occurrence
    date: string
  } | null>(null)
  const window = calendarWindow(date, view, zone)
  const records = family.snapshot.records.filter(
    (r) => r.kind === 'event' && (!custody || (r as FamilyRecord<'event'>).payload.custody),
  ) as FamilyRecord<'event'>[]
  const occurrences = useMemo(
    () =>
      records
        .flatMap((r) => expandEvent(r, family.snapshot.exceptions, window.from, window.to))
        .sort((a, b) => a.startInstant.localeCompare(b.startInstant)),
    [records, family.snapshot.exceptions, window.from, window.to],
  )
  const days: string[] = []
  for (
    let d = Temporal.PlainDate.from(window.first);
    d.toString() < window.end;
    d = d.add({ days: 1 })
  )
    days.push(d.toString())
  function open(o: Occurrence) {
    setEditor({
      record: records.find((r) => r.id === o.eventId),
      occurrence: o,
      date: o.start.slice(0, 10),
    })
  }
  function change(n: number) {
    setDate(
      Temporal.PlainDate.from(date)
        .add(view === 'month' ? { months: n } : view === 'week' ? { days: n * 7 } : { days: n })
        .toString(),
    )
    setEditor(null)
  }
  function label(o: Occurrence) {
    return o.event.allDay
      ? 'Toute la journée'
      : new Intl.DateTimeFormat('fr', {
          timeZone: zone,
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(o.startInstant))
  }
  function card(o: Occurrence) {
    return (
      <button
        className={`calendar-event ${o.event.custody ? 'custody-event' : ''}`}
        key={o.eventId + o.originalStart}
        style={{ borderLeftColor: o.event.color }}
        onClick={() => open(o)}
      >
        <strong>{o.event.title}</strong>
        <small>
          {label(o)}
          {o.event.custody ? ' · Garde' : ''}
          {o.event.visibility === 'private' ? ' · Privé' : ''}
        </small>
      </button>
    )
  }
  return (
    <>
      <PageHeading
        eyebrow={custody ? 'DES REPÈRES POUR CHAQUE ENFANT' : 'LES RENDEZ-VOUS ET LES BONS MOMENTS'}
        title={custody ? 'La garde alternée' : 'Le calendrier'}
      >
        {custody
          ? 'Un rythme régulier, avec de la place pour les exceptions.'
          : 'Un espace commun pour se retrouver.'}
      </PageHeading>
      <FamilyGate>
        <div className="calendar-toolbar">
          <button className="button primary" onClick={() => setEditor({ date })}>
            {custody ? 'Planifier une garde' : 'Ajouter un événement'}
          </button>
          <label>
            Vue
            <select value={view} onChange={(e) => setView(e.target.value as typeof view)}>
              <option value="month">Mois</option>
              <option value="week">Semaine</option>
              <option value="day">Journée</option>
              <option value="agenda">Agenda</option>
            </select>
          </label>
          <label>
            Date
            <input
              type="date"
              required
              value={date}
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value)
              }}
            />
          </label>
        </div>
        {editor && (
          <EventEditor
            key={
              (editor.record?.id ?? 'new') + (editor.occurrence?.originalStart ?? '') + editor.date
            }
            {...editor}
            custody={custody || Boolean(editor.record?.payload.custody)}
            onClose={() => setEditor(null)}
          />
        )}
        <section className="calendar-panel">
          <div className="calendar-navigation">
            <button className="button" onClick={() => change(-1)} aria-label="Période précédente">
              ←
            </button>
            <h2>
              {new Intl.DateTimeFormat('fr', {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              }).format(new Date(date + 'T12:00:00Z'))}
            </h2>
            <button className="button" onClick={() => change(1)} aria-label="Période suivante">
              →
            </button>
            <button
              className="button"
              onClick={() => setDate(Temporal.Now.plainDateISO(zone).toString())}
            >
              Aujourd’hui
            </button>
          </div>
          <p className="muted">Heures affichées dans le fuseau {zone}.</p>
          {view === 'month' ? (
            <div className="month-grid">
              {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day) => (
                <span className="weekday" key={day}>
                  {day}
                </span>
              ))}
              {Array.from(
                { length: Temporal.PlainDate.from(window.first).dayOfWeek - 1 },
                (_, i) => (
                  <span className="calendar-blank" key={'blank' + i} />
                ),
              )}
              {days.map((day) => {
                const range = calendarWindow(day, 'day', zone)
                const list = occurrences.filter((o) =>
                  o.event.allDay
                    ? o.start.slice(0, 10) <= day && o.end.slice(0, 10) > day
                    : o.startInstant < range.to && o.endInstant > range.from,
                )
                return (
                  <div className="month-day" key={day}>
                    <button
                      className="day-number"
                      aria-label={'Voir le ' + day}
                      onClick={() => {
                        setDate(day)
                        setView('day')
                      }}
                    >
                      {Number(day.slice(-2))}
                    </button>
                    {list.slice(0, 3).map((o) => card(o))}
                    {list.length > 3 && (
                      <button
                        className="day-more"
                        onClick={() => {
                          setDate(day)
                          setView('day')
                        }}
                      >
                        + {list.length - 3}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="agenda-list">
              {days.map((day) => {
                const range = calendarWindow(day, 'day', zone)
                const list = occurrences.filter((o) =>
                  o.event.allDay
                    ? o.start.slice(0, 10) <= day && o.end.slice(0, 10) > day
                    : o.startInstant < range.to && o.endInstant > range.from,
                )
                return (
                  <section key={day}>
                    <h3>
                      {new Intl.DateTimeFormat('fr', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        timeZone: 'UTC',
                      }).format(new Date(day + 'T12:00:00Z'))}
                    </h3>
                    {list.length ? (
                      list.map((o) => card(o))
                    ) : (
                      <p className="muted">Rien de prévu.</p>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </section>
      </FamilyGate>
    </>
  )
}
