import { useState, type FormEvent } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import { blankEvent } from '../../../../../packages/domain/src/family'
import { type Reminder } from '../../../../../packages/domain/src/reminder-options'
import { useFamily } from '../family/family-context'
import { useAccount } from '../auth/auth-context'
import { useAccountAction } from '../auth/useAccountAction'
import { ReminderEditor } from './ReminderEditor'
export function BirthdayEditor({ onClose }: { onClose: () => void }) {
  const family = useFamily(),
    account = useAccount(),
    action = useAccountAction()
  const [month, setMonth] = useState(1),
    [day, setDay] = useState(1),
    [reminders, setReminders] = useState<Reminder[]>([])
  const max = Temporal.PlainDate.from({ year: 2000, month, day: 1 }).daysInMonth
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await action.run(async () => {
      const date = Temporal.PlainDate.from({ year: 2000, month, day }).toString()
      const base = blankEvent(date, account.profile?.time_zone ?? 'Europe/Paris')
      await family.save('event', {
        ...base,
        title: 'Anniversaire de ' + String(form.get('person')).trim(),
        eventType: 'birthday',
        allDay: true,
        start: date + 'T00:00',
        end: Temporal.PlainDate.from(date).add({ days: 1 }).toString() + 'T00:00',
        recurrence: { frequency: 'yearly', interval: 1, count: null, until: null },
        reminders,
        visibility: form.get('visibility'),
        color: '#c689ed',
      })
      onClose()
      return 'Anniversaire enregistré.'
    })
  }
  return (
    <form className="account-form" onSubmit={(event) => void submit(event)}>
      <fieldset disabled={action.busy}>
        <label>
          Prénom ou nom
          <input name="person" required maxLength={100} autoComplete="off" />
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
          <select name="visibility" defaultValue="household">
            <option value="household">Tout le foyer</option>
            <option value="private">Moi uniquement</option>
          </select>
        </label>
        <ReminderEditor value={reminders} onChange={setReminders} />
        <p className="muted">
          L’anniversaire est une journée entière ; les rappels sont calculés avant son début à
          minuit.
        </p>
        <button className="button primary">Enregistrer l’anniversaire</button>
      </fieldset>
      <p role={action.failed ? 'alert' : 'status'}>{action.message}</p>
    </form>
  )
}
