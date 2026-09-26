import { ReminderEditor } from './ReminderEditor'
import { useState, type FormEvent } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import type {
  FamilyEvent,
  FamilyRecord,
  Occurrence,
  Child,
  Category,
} from '../../../../../packages/domain/src/family'
import { blankEvent, eventSchema } from '../../../../../packages/domain/src/family'
import { useFamily } from '../family/family-context'
import { useAccount } from '../auth/auth-context'
import { useAccountAction } from '../auth/useAccountAction'
import { rpc } from '../family/family-api'

export function EventEditor({
  record,
  occurrence,
  date,
  custody,
  onClose,
  compact = false,
  periodEnd,
  initialStart,
  onSaved,
}: {
  record?: FamilyRecord<'event'>
  occurrence?: Occurrence
  date: string
  custody: boolean
  onClose: () => void
  compact?: boolean
  periodEnd?: string
  initialStart?: string
  onSaved?: () => void
}) {
  const family = useFamily(),
    account = useAccount(),
    action = useAccountAction()
  const initial = record
    ? {
        ...record.payload,
        ...(occurrence
          ? { ...occurrence.event, start: occurrence.start, end: occurrence.end }
          : {}),
      }
    : {
        ...blankEvent(date, account.profile?.time_zone ?? 'Europe/Paris'),
        custody,
        ...(initialStart
          ? {
              start: initialStart,
              end: Temporal.PlainDateTime.from(initialStart)
                .add({ hours: 1 })
                .toString({ smallestUnit: 'minute' }),
            }
          : {}),
        ...(periodEnd
          ? {
              allDay: true,
              start: date + 'T00:00',
              end: Temporal.PlainDate.from(periodEnd).add({ days: 1 }).toString() + 'T00:00',
            }
          : {}),
        ...(custody
          ? {
              start: date + 'T18:00',
              end: Temporal.PlainDate.from(date).add({ days: 7 }).toString() + 'T18:00',
              recurrence: { frequency: 'weekly' as const, interval: 2, count: null, until: null },
            }
          : {}),
      }
  const [periodType, setPeriodType] = useState('other')
  const [draft, setDraft] = useState<FamilyEvent>(initial)
  const [scope, setScope] = useState<'series' | 'one' | 'following'>(
    record?.payload.recurrence && occurrence ? 'one' : 'series',
  )
  const [deleting, setDeleting] = useState(false)
  const children = family.snapshot.records.filter(
    (r) => r.kind === 'child',
  ) as FamilyRecord<'child'>[]
  const categories = family.snapshot.records.filter(
    (r) => r.kind === 'category',
  ) as FamilyRecord<'category'>[]
  const role = family.snapshot.members.find((member) => member.user_id === account.user?.id)?.role
  const canEdit =
    !record || record.created_by === account.user?.id || role === 'owner' || role === 'admin'
  function patch<K extends keyof FamilyEvent>(key: K, value: FamilyEvent[K]) {
    setDraft({ ...draft, [key]: value })
  }
  async function commit(remove = false) {
    const payload = remove ? (record?.payload ?? draft) : eventSchema.parse(draft)
    if (record && occurrence && scope !== 'series')
      await rpc('change_occurrence', {
        p_household: family.active,
        p_event: record.id,
        p_version: record.version,
        p_index: occurrence.index,
        p_original: occurrence.originalStart,
        p_scope: scope,
        p_payload: payload,
        p_delete: remove,
        p_mutation: crypto.randomUUID(),
      })
    else await family.save('event', payload, record, remove)
    await family.refresh()
    onSaved?.()
    onClose()
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    void action.run(() => commit())
  }
  function allDay(value: boolean) {
    setDraft({
      ...draft,
      allDay: value,
      start: draft.start.slice(0, 10) + (value ? 'T00:00' : 'T09:00'),
      end:
        Temporal.PlainDate.from(draft.end.slice(0, 10))
          .add({ days: value ? 1 : -1 })
          .toString() + (value ? 'T00:00' : 'T10:00'),
    })
  }
  return (
    <section className="settings-card event-editor" aria-labelledby="editor-title">
      <div className={`section-heading${compact ? ' compact-editor-heading' : ''}`}>
        <h2 id="editor-title">
          {record
            ? 'Le détail de ce moment'
            : custody
              ? 'Planifier une garde'
              : 'Un nouveau moment'}
        </h2>
        <button className="button" onClick={onClose}>
          Fermer
        </button>
      </div>
      {!canEdit && (
        <p>
          La personne qui a créé cet événement, le propriétaire et les administrateurs peuvent le
          modifier.
        </p>
      )}
      <form className="account-form" onSubmit={submit}>
        <fieldset disabled={action.busy || !canEdit}>
          {record?.payload.recurrence && occurrence && (
            <label>
              Appliquer la modification
              <select
                value={scope}
                onChange={(e) => {
                  const value = e.target.value as typeof scope
                  setScope(value)
                  setDraft(value === 'series' ? record.payload : initial)
                }}
              >
                <option value="one">Uniquement cette occurrence</option>
                <option value="following">Cette occurrence et les suivantes</option>
                <option value="series">Toute la série</option>
              </select>
            </label>
          )}
          {periodEnd && !record && (
            <label>
              Type de période
              <select
                value={periodType}
                onChange={(event) => {
                  const value = event.target.value
                  const titles: Record<string, string> = {
                    other: '',
                    custody: 'Garde',
                    holiday: 'Vacances',
                    school: 'Vacances scolaires',
                  }
                  setPeriodType(value)
                  setDraft({
                    ...draft,
                    custody: value === 'custody',
                    childId: value === 'custody' ? draft.childId : null,
                    title:
                      !draft.title || Object.values(titles).includes(draft.title)
                        ? titles[value]!
                        : draft.title,
                  })
                }}
              >
                <option value="other">Autre période</option>
                <option value="custody">Garde d’un enfant</option>
                <option value="holiday">Vacances</option>
                <option value="school">Vacances scolaires</option>
              </select>
            </label>
          )}
          <label>
            Titre
            <input
              required
              maxLength={120}
              value={draft.title}
              onChange={(e) => patch('title', e.target.value)}
              placeholder={custody ? 'La semaine avec Emma' : 'Un rendez-vous, une sortie…'}
            />
          </label>
          {draft.custody && (
            <>
              <label>
                Enfant
                <select
                  required
                  value={draft.childId ?? ''}
                  onChange={(e) => {
                    const child = children.find((c) => c.id === e.target.value)
                    setDraft({
                      ...draft,
                      childId: e.target.value || null,
                      color: (child?.payload as Child)?.color ?? draft.color,
                      title: draft.title || child?.payload.title || '',
                    })
                  }}
                >
                  <option value="">Choisir un enfant</option>
                  {children.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.payload.title}
                    </option>
                  ))}
                </select>
              </label>
              {children.length === 0 && (
                <p>Ajoute d’abord l’enfant dans le menu Famille pour lui associer cette garde.</p>
              )}
              {!record && !periodEnd && (
                <label>
                  Modèle de garde
                  <select
                    defaultValue="week"
                    onChange={(e) => {
                      const start = Temporal.PlainDateTime.from(draft.start)
                      setDraft({
                        ...draft,
                        end: start
                          .add({ days: e.target.value === 'week' ? 7 : 2 })
                          .toString({ smallestUnit: 'minute' }),
                        recurrence: { frequency: 'weekly', interval: 2, count: null, until: null },
                      })
                    }}
                  >
                    <option value="week">Une semaine sur deux</option>
                    <option value="weekend">Un week-end sur deux</option>
                    <option value="custom">Personnalisé (ajustez les dates ci-dessous)</option>
                  </select>
                </label>
              )}
            </>
          )}
          <label className="check-label">
            <input
              type="checkbox"
              checked={draft.allDay}
              onChange={(e) => allDay(e.target.checked)}
            />{' '}
            Toute la journée
          </label>
          <div className="field-pair">
            <label>
              Début
              <input
                type={draft.allDay ? 'date' : 'datetime-local'}
                required
                value={draft.allDay ? draft.start.slice(0, 10) : draft.start}
                onChange={(e) => patch('start', e.target.value + (draft.allDay ? 'T00:00' : ''))}
              />
            </label>
            <label>
              {draft.allDay ? 'Dernier jour inclus' : 'Fin'}
              <input
                type={draft.allDay ? 'date' : 'datetime-local'}
                required
                value={
                  draft.allDay
                    ? Temporal.PlainDate.from(draft.end.slice(0, 10))
                        .subtract({ days: 1 })
                        .toString()
                    : draft.end
                }
                onChange={(e) => {
                  if (e.target.value)
                    patch(
                      'end',
                      draft.allDay
                        ? Temporal.PlainDate.from(e.target.value).add({ days: 1 }).toString() +
                            'T00:00'
                        : e.target.value,
                    )
                }}
              />
            </label>
          </div>
          {compact && (
            <p className="muted">
              {draft.visibility === 'private'
                ? 'Visible uniquement par vous.'
                : draft.visibility === 'household'
                  ? 'Partagé avec votre foyer.'
                  : 'Partagé avec les personnes choisies.'}
            </p>
          )}
          <ReminderEditor
            value={draft.reminders}
            onChange={(value) => patch('reminders', value)}
            start={draft.start}
            timeZone={draft.timeZone}
          />
          <details className="event-options" open={!compact}>
            <summary>Répétition, partage et autres options</summary>
            <label>
              Fuseau horaire
              <input
                required
                value={draft.timeZone}
                maxLength={100}
                onChange={(e) => patch('timeZone', e.target.value)}
              />
            </label>
            <label>
              Lieu
              <input
                value={draft.location}
                maxLength={300}
                onChange={(e) => patch('location', e.target.value)}
              />
            </label>
            <label>
              Description
              <textarea
                value={draft.description}
                maxLength={4000}
                onChange={(e) => patch('description', e.target.value)}
              />
            </label>
            <div className="field-pair">
              <label>
                Catégorie
                <select
                  value={draft.categoryId ?? ''}
                  onChange={(e) => {
                    const cat = categories.find((c) => c.id === e.target.value)
                    setDraft({
                      ...draft,
                      categoryId: e.target.value || null,
                      color: (cat?.payload as Category)?.color ?? draft.color,
                    })
                  }}
                >
                  <option value="">Sans catégorie</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.payload.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Couleur
                <input
                  type="color"
                  value={draft.color}
                  onChange={(e) => patch('color', e.target.value)}
                />
              </label>
            </div>
            {scope === 'series' && (
              <>
                <label>
                  Répétition
                  <select
                    value={draft.recurrence?.frequency ?? ''}
                    onChange={(e) =>
                      patch(
                        'recurrence',
                        e.target.value
                          ? {
                              frequency: e.target.value as 'weekly',
                              interval: 1,
                              count: null,
                              until: null,
                            }
                          : null,
                      )
                    }
                  >
                    <option value="">Ne se répète pas</option>
                    <option value="daily">Tous les jours</option>
                    <option value="weekly">Toutes les semaines</option>
                    <option value="monthly">Tous les mois</option>
                    <option value="yearly">Tous les ans</option>
                  </select>
                </label>
                {draft.recurrence && (
                  <>
                    <div className="field-pair">
                      <label>
                        Intervalle
                        <input
                          type="number"
                          min={1}
                          max={52}
                          required
                          value={draft.recurrence.interval}
                          onChange={(e) =>
                            patch('recurrence', {
                              ...draft.recurrence!,
                              interval: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Jusqu’au (facultatif)
                        <input
                          type="date"
                          value={draft.recurrence.until?.slice(0, 10) ?? ''}
                          onChange={(e) =>
                            patch('recurrence', {
                              ...draft.recurrence!,
                              until: e.target.value ? e.target.value + 'T23:59' : null,
                            })
                          }
                        />
                      </label>
                    </div>
                    <p className="muted">
                      L’heure locale est conservée lors des changements d’heure. Une date ou une
                      heure inexistante/ambiguë est omise, sans déplacement automatique.
                    </p>
                  </>
                )}
                <label>
                  Qui peut voir ce moment ?
                  <select
                    value={draft.visibility}
                    onChange={(e) =>
                      patch('visibility', e.target.value as FamilyEvent['visibility'])
                    }
                  >
                    <option value="household">Tout le foyer</option>
                    <option value="private">Seulement moi</option>
                    <option value="selected">Certaines personnes</option>
                  </select>
                </label>
                {draft.visibility === 'selected' && (
                  <div className="member-choices">
                    {family.snapshot.members
                      .filter((m) => m.user_id !== account.user?.id)
                      .map((m) => (
                        <label className="check-label" key={m.user_id}>
                          <input
                            type="checkbox"
                            checked={draft.viewers.includes(m.user_id)}
                            onChange={(e) =>
                              patch(
                                'viewers',
                                e.target.checked
                                  ? [...draft.viewers, m.user_id]
                                  : draft.viewers.filter((id) => id !== m.user_id),
                              )
                            }
                          />
                          {m.first_name}
                        </label>
                      ))}
                  </div>
                )}
                <fieldset className="member-choices">
                  <legend>Personnes concernées (ne donne pas accès à l’événement)</legend>
                  {family.snapshot.members.map((m) => (
                    <label className="check-label" key={m.user_id}>
                      <input
                        type="checkbox"
                        checked={draft.people.includes(m.user_id)}
                        onChange={(e) =>
                          patch(
                            'people',
                            e.target.checked
                              ? [...draft.people, m.user_id]
                              : draft.people.filter((id) => id !== m.user_id),
                          )
                        }
                      />
                      {m.first_name}
                    </label>
                  ))}
                </fieldset>
              </>
            )}
          </details>
          <button className="button primary">
            {action.busy ? 'Enregistrement…' : 'Enregistrer l’événement'}
          </button>
          {record && (
            <>
              <button type="button" className="button" onClick={() => setDeleting(!deleting)}>
                Supprimer…
              </button>
              {deleting && (
                <div className="account-notice">
                  <p>
                    {scope === 'one'
                      ? 'Supprimer uniquement cette occurrence ?'
                      : scope === 'following'
                        ? 'Supprimer cette occurrence et toutes les suivantes ?'
                        : 'Supprimer cet événement et toute sa série ?'}
                  </p>
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      void action.run(() => commit(true))
                    }}
                  >
                    Confirmer la suppression
                  </button>
                </div>
              )}
            </>
          )}
        </fieldset>
        <p role={action.failed ? 'alert' : 'status'} className="account-feedback">
          {action.message}
        </p>
      </form>
    </section>
  )
}
