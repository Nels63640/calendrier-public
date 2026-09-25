import { Temporal } from '@js-temporal/polyfill'
import type { FamilyRecord, EventException, Task } from './family.ts'
import { blankEvent } from './event-defaults.ts'
import { expandEvent, reminderTimes } from './recurrence.ts'

export interface ReminderSource {
  record: FamilyRecord
  exceptions: EventException[]
  subscriptions: { id: string }[]
}
export interface ReminderJob {
  id: string
  recordId: string
  version: number
  subscriptionId: string
  due: string
}
export function planReminders(sources: ReminderSource[], now: string): ReminderJob[] {
  const instant = Temporal.Instant.from(now),
    from = instant.subtract({ minutes: 15 }),
    to = instant.add({ hours: 24 * 31 })
  const jobs: ReminderJob[] = []
  for (const source of sources) {
    let record: FamilyRecord<'event'>
    if (source.record.kind === 'task') {
      const task = source.record.payload as Task
      if (!task.due || task.status === 'done') continue
      record = {
        ...source.record,
        kind: 'event',
        payload: {
          ...blankEvent(task.due.slice(0, 10), task.timeZone),
          title: task.title,
          start: task.due,
          end: Temporal.PlainDateTime.from(task.due)
            .add({ minutes: 1 })
            .toString({ smallestUnit: 'minute' }),
          reminders: task.reminders,
        },
      }
    } else if (source.record.kind === 'event') record = source.record as FamilyRecord<'event'>
    else continue
    for (const occurrence of expandEvent(record, source.exceptions, from.toString(), to.toString()))
      for (const reminder of reminderTimes(occurrence)) {
        if (
          Temporal.Instant.compare(Temporal.Instant.from(reminder.due), from) < 0 ||
          Temporal.Instant.compare(
            Temporal.Instant.from(reminder.due),
            instant.add({ minutes: 2 }),
          ) > 0
        )
          continue
        for (const subscription of source.subscriptions)
          jobs.push({
            id: `${record.id}:${record.version}:${occurrence.originalStart}:${reminder.minutes}:${subscription.id}`,
            recordId: record.id,
            version: record.version,
            subscriptionId: subscription.id,
            due: reminder.due,
          })
      }
  }
  return jobs
}
