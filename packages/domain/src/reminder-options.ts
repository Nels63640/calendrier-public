import { Temporal } from '@js-temporal/polyfill'
import { z } from 'zod'

export const reminderLimits = {
  minutes: 525600,
  hours: 8760,
  days: 365,
  weeks: 52,
  months: 12,
} as const
export type ReminderUnit = keyof typeof reminderLimits
export const reminderChoiceSchema = z
  .object({
    amount: z.number().int().min(0),
    unit: z.enum(['minutes', 'hours', 'days', 'weeks', 'months']),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.amount > reminderLimits[value.unit] || (value.unit !== 'minutes' && value.amount < 1))
      ctx.addIssue({
        code: 'custom',
        message: 'Choisissez un délai valide, jusqu’à un an avant.',
        path: ['amount'],
      })
  })
export const remindersSchema = z
  .array(z.union([z.number().int().min(0).max(43200), reminderChoiceSchema]))
  .max(5)
export type ReminderChoice = z.infer<typeof reminderChoiceSchema>
export type Reminder = number | ReminderChoice
export function reminderChoice(value: Reminder): ReminderChoice {
  if (typeof value !== 'number') return value
  // Les anciennes durées restent stockées intactes jusqu’à leur modification.
  if (value > 0 && value % 10080 === 0) return { amount: value / 10080, unit: 'weeks' }
  if (value > 0 && value % 1440 === 0) return { amount: value / 1440, unit: 'days' }
  if (value > 0 && value % 60 === 0) return { amount: value / 60, unit: 'hours' }
  return { amount: value, unit: 'minutes' }
}
export function reminderKey(value: Reminder) {
  if (typeof value === 'number') return String(value)
  if (value.unit === 'minutes' || value.unit === 'hours')
    return String(value.amount * (value.unit === 'hours' ? 60 : 1))
  if (value.unit === 'days' || value.unit === 'weeks')
    return 'days:' + value.amount * (value.unit === 'weeks' ? 7 : 1)
  return 'months:' + value.amount
}
export function reminderDue(value: Reminder, start: string, timeZone: string) {
  const zoned = Temporal.PlainDateTime.from(start).toZonedDateTime(timeZone, {
    disambiguation: 'reject',
  })
  if (typeof value === 'number') return zoned.toInstant().subtract({ minutes: value }).toString()
  // Mois/jours/semaines civils : conserver l’heure locale et rabattre au dernier jour du mois.
  return zoned
    .subtract({ [value.unit]: value.amount })
    .toInstant()
    .toString()
}
export function reminderPreview(value: Reminder, start: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(reminderDue(value, start, timeZone)))
  } catch {
    return ''
  }
}
