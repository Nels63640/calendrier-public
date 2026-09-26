import { AccountError } from '../auth/auth-errors'
import { useState, type FormEvent } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import { blankEvent, type FamilyRecord } from '../../../../../packages/domain/src/family'
import { type Reminder } from '../../../../../packages/domain/src/reminder-options'
import { useFamily } from '../family/family-context'
import { useAccount } from '../auth/auth-context'
import { useAccountAction } from '../auth/useAccountAction'
import { ReminderEditor } from './ReminderEditor'
export function BirthdayEditor({
  record,
  onClose,
}: {
  record?: FamilyRecord<'event'>
  onClose: () => void
}) {
  const family = useFamily(),
    account = useAccount(),
    action = useAccountAction()
  const initialDate = Temporal.PlainDateTime.from(
    record?.payload.start ?? '2000-01-01T00:00',
  ).toPlainDate()
  const [month, setMonth] = useState(initialDate.month),
    [day, setDay] = useState(initialDate.day),
    [reminders, setReminders] = useState<Reminder[]>(record?.payload.reminders ?? [])
  const role = family.snapshot.members.find((member) => member.user_id === account.user?.id)?.role
  const canEdit =
    !record || record.created_by === account.user?.id || role === 'owner' || role === 'admin'
  const [deleting, setDeleting] = useState(false)
  const max = Temporal.PlainDate.from({ year: 2000, month, day: 1 }).daysInMonth
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await action.run(async () => {
      if (!canEdit) throw new AccountError('Vous ne pouvez pas modifier cet anniversaire.')
      const person = String(form.get('person')).trim()
      if (!person) throw new AccountError('Indiquez un prénom ou un nom.')
      const year = month === 2 && day === 29 && !initialDate.inLeapYear ? 2000 : initialDate.year
      const date = Temporal.PlainDate.from({ year, month, day }, { overflow: 'reject' }).toString()
      const base = record?.payload ?? blankEvent(date, account.profile?.time_zone ?? 'Europe/Paris')
      await family.save(
        'event',
        {
          ...base,
          title: 'Anniversaire de ' + person,
          eventType: 'birthday',
          allDay: true,
          start: date + 'T00:00',
          end: Temporal.PlainDate.from(date).add({ days: 1 }).toString() + 'T00:00',
          recurrence: base.recurrence ?? {
            frequency: 'yearly',
            interval: 1,
            count: null,
            until: null,
          },
          reminders,
          visibility: form.get('visibility'),
          color: form.get('color'),
        },
        record,
      )
      onClose()
      return 'Anniversaire enregistré.'
    })
  }
  return (
    <form className="account-form" onSubmit={(event) => void submit(event)}>
      <fieldset disabled={action.busy || !canEdit}>
        <label>
          Prénom ou nom
          <input
            name="person"
            defaultValue={record?.payload.title.replace(/^Anniversaire de /, '') ?? ''}
            required
            maxLength={100}
            autoComplete="off"
          />
        </label>
        <div className="field-pair">
          <label>
            Jour
            <input
              type="number"
              min={1}
              max={max}
              step={1}
              required
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
            />
          </label>
          <label>
            Mois
            <select
              value={month}
              onChange={(e) => {
                const next = Number(e.target.value)
                setMonth(next)
                setDay(
                  Math.max(
                    1,
                    Math.min(
                      day,
                      Temporal.PlainDate.from({ year: 2000, month: next, day: 1 }).daysInMonth,
                    ),
                  ),
                )
              }}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {Temporal.PlainDate.from({ year: 2000, month: i + 1, day: 1 }).toLocaleString(
                    'fr',
                    { month: 'long' },
                  )}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted">
          Revient chaque année. Pas besoin de renseigner l’année de naissance.
          {month === 2 && day === 29
            ? ' Le 29 février est célébré le 28 les années non bissextiles.'
            : ''}
        </p>
        <label>
          Visibilité
          <select name="visibility" defaultValue={record?.payload.visibility ?? 'household'}>
            <option value="household">Tout le foyer</option>
            <option value="private">Moi uniquement</option>
            {record?.payload.visibility === 'selected' && (
              <option value="selected">Personnes sélectionnées</option>
            )}
          </select>
        </label>
        <label>
          Couleur
          <input name="color" type="color" defaultValue={record?.payload.color ?? '#c689ed'} />
        </label>
        {record && (
          <p className="muted">Les modifications s’appliquent à cet anniversaire chaque année.</p>
        )}
        <ReminderEditor value={reminders} onChange={setReminders} />
        <p className="muted">
          L’anniversaire est une journée entière ; les rappels sont calculés avant son début à
          minuit.
        </p>
        {canEdit && (
          <button className="button primary">
            {record ? 'Enregistrer les modifications' : 'Enregistrer l’anniversaire'}
          </button>
        )}
        {record &&
          canEdit &&
          (deleting ? (
            <div>
              <p>Supprimer cet anniversaire pour toutes les années ?</p>
              <button
                type="button"
                className="button danger"
                onClick={() => {
                  void action.run(async () => {
                    await family.save('event', record.payload, record, true)
                    onClose()
                  })
                }}
              >
                Confirmer la suppression
              </button>
              <button type="button" className="button" onClick={() => setDeleting(false)}>
                Annuler
              </button>
            </div>
          ) : (
            <button type="button" className="button danger" onClick={() => setDeleting(true)}>
              Supprimer l’anniversaire
            </button>
          ))}
      </fieldset>
      {!canEdit && (
        <p>
          Seuls l’auteur, les administrateurs et le propriétaire peuvent modifier cet anniversaire.
        </p>
      )}
      <p role={action.failed ? 'alert' : 'status'}>{action.message}</p>
    </form>
  )
}
