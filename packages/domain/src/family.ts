import { remindersSchema } from './reminder-options.ts'
import { Temporal } from '@js-temporal/polyfill'
import { z } from 'zod'

const title = z.string().trim().min(1, 'Un titre est nécessaire.').max(120)
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const uuid = z.uuid()
const local = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  .refine((value) => {
    try {
      Temporal.PlainDateTime.from(value, { overflow: 'reject' })
      return true
    } catch {
      return false
    }
  }, 'Date invalide.')
const zone = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      if (/^[+-]/.test(value)) return false
      new Intl.DateTimeFormat('fr', { timeZone: value })
      return true
    } catch {
      return false
    }
  }, 'Fuseau invalide.')
export const recurrenceSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1).max(52),
  count: z.number().int().min(1).max(10000).nullable(),
  until: local.nullable(),
})
export const eventSchema = z
  .object({
    title,
    description: z.string().max(4000),
    location: z.string().max(300),
    color,
    start: local,
    end: local,
    timeZone: zone,
    allDay: z.boolean(),
    visibility: z.enum(['household', 'private', 'selected']),
    viewers: z.array(uuid).max(50),
    people: z.array(uuid).max(50),
    childId: uuid.nullable(),
    categoryId: uuid.nullable(),
    custody: z.boolean(),
    recurrence: recurrenceSchema.nullable(),
    eventType: z.enum(['event', 'birthday']).optional(),
    reminders: remindersSchema,
  })
  .superRefine((value, ctx) => {
    if (value.end <= value.start)
      ctx.addIssue({ code: 'custom', message: 'La fin doit suivre le début.', path: ['end'] })
    if (value.allDay && (!value.start.endsWith('T00:00') || !value.end.endsWith('T00:00')))
      ctx.addIssue({
        code: 'custom',
        message: 'Une journée entière commence et finit à minuit.',
        path: ['end'],
      })
    if (value.custody && !value.childId)
      ctx.addIssue({ code: 'custom', message: 'Choisissez un enfant.', path: ['childId'] })
    if (value.recurrence?.until && value.recurrence.until < value.start)
      ctx.addIssue({
        code: 'custom',
        message: 'La récurrence se termine avant son début.',
        path: ['recurrence'],
      })
    try {
      for (const time of [value.start, value.end])
        Temporal.PlainDateTime.from(time).toZonedDateTime(value.timeZone, {
          disambiguation: 'reject',
        })
    } catch {
      ctx.addIssue({
        code: 'custom',
        message:
          'Cette heure est ambiguë ou inexistante avec le changement d’heure. Choisissez une autre heure.',
        path: ['start'],
      })
    }
  })
export const childSchema = z.object({
  title,
  color,
  avatar: z.enum(['profile', 'sun', 'leaf', 'home']),
})
export const categorySchema = z.object({ title, color })
export const shoppingSchema = z.object({
  title,
  quantity: z.string().max(80),
  category: z.string().max(80),
  done: z.boolean(),
})
export const taskSchema = z.object({
  title,
  description: z.string().max(4000),
  assignee: uuid.nullable(),
  due: local.nullable(),
  timeZone: zone,
  priority: z.enum(['low', 'normal', 'high']),
  status: z.enum(['todo', 'doing', 'done']),
  reminders: remindersSchema,
})
export type FamilyEvent = z.infer<typeof eventSchema>
export type Shopping = z.infer<typeof shoppingSchema>
export type Task = z.infer<typeof taskSchema>
export type Child = z.infer<typeof childSchema>
export type Category = z.infer<typeof categorySchema>
export type Kind = 'event' | 'shopping' | 'task' | 'child' | 'category'
export interface FamilyRecord<K extends Kind = Kind> {
  id: string
  household_id: string
  kind: K
  payload: K extends 'event'
    ? FamilyEvent
    : K extends 'task'
      ? Task
      : K extends 'shopping'
        ? Shopping
        : K extends 'child'
          ? Child
          : Category
  created_by: string
  version: number
  created_at: string
  updated_at: string
  deleted: boolean
}
export interface EventException {
  id: string
  household_id: string
  event_id: string
  original_start: string
  cancelled: boolean
  payload: FamilyEvent | null
  version: number
}
export interface Occurrence {
  eventId: string
  originalStart: string
  start: string
  end: string
  startInstant: string
  endInstant: string
  event: FamilyEvent
  exception: EventException | null
  index: number
}
export const schemas = {
  event: eventSchema,
  shopping: shoppingSchema,
  task: taskSchema,
  child: childSchema,
  category: categorySchema,
}

export { blankEvent } from './event-defaults.ts'
