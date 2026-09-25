import { Link } from 'react-router'
import { Temporal } from '@js-temporal/polyfill'
import { PageHeading } from '../../components/PageHeading'
import { useAccount } from '../auth/auth-context'
import { useFamily } from '../family/family-context'
import { FamilyGate } from '../family/FamilyShell'
import { expandEvent, calendarWindow } from '../../../../../packages/domain/src/recurrence'
import type { FamilyRecord, Task, Shopping } from '../../../../../packages/domain/src/family'

export function LiveDashboard() {
  const family = useFamily(),
    account = useAccount()
  const zone = account.profile?.time_zone ?? 'Europe/Paris'
  const today = Temporal.Now.plainDateISO(zone).toString(),
    range = calendarWindow(today, 'agenda', zone)
  const events = family.snapshot.records.filter(
    (r) => r.kind === 'event',
  ) as FamilyRecord<'event'>[]
  const upcoming = events
    .flatMap((r) => expandEvent(r, family.snapshot.exceptions, range.from, range.to))
    .sort((a, b) => a.startInstant.localeCompare(b.startInstant))
    .slice(0, 6)
  const tasks = family.snapshot.records.filter(
    (r) => r.kind === 'task' && (r.payload as Task).status !== 'done',
  )
  const shopping = family.snapshot.records.filter(
    (r) => r.kind === 'shopping' && !(r.payload as Shopping).done,
  )
  return (
    <>
      <PageHeading
        eyebrow="VOTRE PETIT MONDE, RÉUNI"
        title={`Bonjour${account.profile ? ' ' + account.profile.first_name : ''}.`}
      >
        Un peu de place pour l’essentiel.
      </PageHeading>
      <FamilyGate>
        <div className="dashboard-grid">
          <section className="settings-card">
            <h2>Aujourd’hui et bientôt</h2>
            {upcoming.length ? (
              <ul className="family-list">
                {upcoming.map((o) => (
                  <li key={o.eventId + o.originalStart}>
                    <span className="color-mark" style={{ background: o.event.color }} />
                    <div>
                      <strong>{o.event.title}</strong>
                      <small>
                        {o.event.allDay
                          ? o.start.slice(0, 10)
                          : new Intl.DateTimeFormat('fr', {
                              timeZone: zone,
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            }).format(new Date(o.startInstant))}
                        {o.event.custody ? ' · Garde' : ''}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Rien de prévu pour les 30 prochains jours.</p>
            )}
            <Link className="text-link" to="/calendrier">
              Ouvrir le calendrier
            </Link>
          </section>
          <section className="settings-card">
            <h2>Un coup de main</h2>
            <p>{tasks.length} tâche(s) à faire.</p>
            <ul>
              {tasks.slice(0, 4).map((t) => (
                <li key={t.id}>{t.payload.title}</li>
              ))}
            </ul>
            <Link className="text-link" to="/taches">
              Voir les tâches
            </Link>
          </section>
          <section className="settings-card">
            <h2>Pour la maison</h2>
            <p>{shopping.length} produit(s) à prendre.</p>
            <ul>
              {shopping.slice(0, 4).map((t) => (
                <li key={t.id}>{t.payload.title}</li>
              ))}
            </ul>
            <Link className="text-link" to="/courses">
              Ouvrir les courses
            </Link>
          </section>
          <section className="settings-card">
            <h2>Le rythme des enfants</h2>
            <p>{events.filter((e) => e.payload.custody).length} planning(s) de garde.</p>
            <Link className="text-link" to="/garde">
              Retrouver les gardes
            </Link>
          </section>
        </div>
      </FamilyGate>
    </>
  )
}
