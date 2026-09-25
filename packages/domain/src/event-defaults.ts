import type { FamilyEvent } from './family.ts'
export function blankEvent(date: string, timeZone: string): FamilyEvent {
  return {
    title: '',
    description: '',
    location: '',
    start: date + 'T09:00',
    end: date + 'T10:00',
    timeZone,
    allDay: false,
    color: '#ff414b',
    visibility: 'household',
    viewers: [],
    people: [],
    childId: null,
    categoryId: null,
    custody: false,
    recurrence: null,
    reminders: [],
  }
}
