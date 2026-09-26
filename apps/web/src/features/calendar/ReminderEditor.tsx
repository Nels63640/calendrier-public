import { useState } from 'react'
import {
  reminderChoice,
  reminderKey,
  reminderLimits,
  reminderPreview,
  type Reminder,
  type ReminderUnit,
} from '../../../../../packages/domain/src/reminder-options'

const presets: { label: string; value: Reminder }[] = [
  { label: 'À l’heure', value: { amount: 0, unit: 'minutes' } },
  { label: '15 min', value: { amount: 15, unit: 'minutes' } },
  { label: '1 heure', value: { amount: 1, unit: 'hours' } },
  { label: '1 jour', value: { amount: 1, unit: 'days' } },
  { label: '1 semaine', value: { amount: 1, unit: 'weeks' } },
]
const units: Record<ReminderUnit, string> = {
  minutes: 'Minutes',
  hours: 'Heures',
  days: 'Jours',
  weeks: 'Semaines',
  months: 'Mois',
}

export function ReminderEditor({
  value,
  onChange,
  defaultValue = [],
  name,
  start,
  timeZone = 'UTC',
}: {
  value?: Reminder[]
  onChange?: (value: Reminder[]) => void
  defaultValue?: Reminder[]
  name?: string
  start?: string
  timeZone?: string
}) {
  const [local, setLocal] = useState(defaultValue)
  const selected = value ?? local
  function change(next: Reminder[]) {
    setLocal(next)
    onChange?.(next)
  }
  function update(index: number, item: Reminder) {
    change(selected.map((entry, i) => (i === index ? item : entry)))
  }
  return (
    <section className="reminder-editor" aria-label="Rappels avant le début">
      <div className="reminder-heading">
        <div>
          <h3>Me rappeler</h3>
          <p>Choisissez quand recevoir vos notifications.</p>
        </div>
        <span className="reminder-count">{selected.length}/5</span>
      </div>
      {name && <input type="hidden" name={name} value={JSON.stringify(selected)} />}
      <div className="reminder-presets" aria-label="Délais rapides">
        {presets.map((preset) => {
          const index = selected.findIndex(
            (item) => reminderKey(item) === reminderKey(preset.value),
          )
          return (
            <button
              type="button"
              key={preset.label}
              aria-pressed={index >= 0}
              disabled={selected.length >= 5 && index < 0}
              onClick={() =>
                change(
                  index >= 0 ? selected.filter((_, i) => i !== index) : [...selected, preset.value],
                )
              }
            >
              {preset.label}
            </button>
          )
        })}
      </div>
      {selected.length === 0 ? (
        <p className="reminder-empty">
          Aucun rappel. Choisissez un délai rapide ou personnalisez-le.
        </p>
      ) : (
        <ol className="reminder-list">
          {selected.map((item, index) => {
            const choice = reminderChoice(item)
            const preview = start ? reminderPreview(item, start, timeZone) : ''
            return (
              <li key={index}>
                <div className="reminder-row">
                  <label>
                    <span>Délai {index + 1}</span>
                    <input
                      aria-label={'Délai du rappel ' + (index + 1)}
                      type="number"
                      inputMode="numeric"
                      min={choice.unit === 'minutes' ? 0 : 1}
                      max={reminderLimits[choice.unit]}
                      step={1}
                      required
                      value={choice.amount}
                      onChange={(event) =>
                        update(index, { ...choice, amount: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <span>Avant le début</span>
                    <select
                      aria-label={'Unité du rappel ' + (index + 1)}
                      value={choice.unit}
                      onChange={(event) => {
                        const unit = event.target.value as ReminderUnit
                        update(index, {
                          unit,
                          amount: Math.max(
                            unit === 'minutes' ? 0 : 1,
                            Math.min(choice.amount, reminderLimits[unit]),
                          ),
                        })
                      }}
                    >
                      {Object.entries(units).map(([unit, label]) => (
                        <option key={unit} value={unit}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="reminder-remove"
                    aria-label={'Supprimer le rappel ' + (index + 1)}
                    onClick={() => change(selected.filter((_, i) => i !== index))}
                  >
                    ×
                  </button>
                </div>
                {preview && <p className="reminder-preview">Notification le {preview}</p>}
              </li>
            )
          })}
        </ol>
      )}
      <button
        className="reminder-add"
        type="button"
        disabled={selected.length >= 5}
        onClick={() => {
          const amount =
            [10, 20, 30, 45, 5, 25].find(
              (amount) => !selected.some((item) => reminderKey(item) === String(amount)),
            ) ?? 10
          change([...selected, { amount, unit: 'minutes' }])
        }}
      >
        + Ajouter un rappel personnalisé
      </button>
      <p className="reminder-hint">
        Jusqu’à 5 rappels. Les mois suivent le calendrier. Activez les notifications dans votre
        profil.
      </p>
    </section>
  )
}
