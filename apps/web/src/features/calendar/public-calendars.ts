import { Temporal } from '@js-temporal/polyfill'
import data from '../../data/public-calendars.json'
import { blankEvent, type FamilyRecord } from '../../../../../packages/domain/src/family'

export interface CalendarLayers {
  holidays: boolean
  zones: string[]
  birthdays: boolean
}
export const defaultLayers: CalendarLayers = { holidays: true, zones: [], birthdays: true }
export const schoolZones = {
  A: 'Besançon, Bordeaux, Clermont-Ferrand, Dijon, Grenoble, Limoges, Lyon, Poitiers',
  B: 'Aix-Marseille, Amiens, Lille, Nancy-Metz, Nantes, Nice, Normandie, Orléans-Tours, Reims, Rennes, Strasbourg',
  C: 'Créteil, Montpellier, Paris, Toulouse, Versailles',
}
export function readLayers(): CalendarLayers {
  try {
    const value = JSON.parse(localStorage.getItem('family-calendar-layers') ?? 'null')
    if (!value || typeof value !== 'object') return defaultLayers
    return {
      holidays: value.holidays !== false,
      birthdays: value.birthdays !== false,
      zones: Array.isArray(value.zones)
        ? value.zones.filter((v: unknown) => typeof v === 'string' && Object.hasOwn(schoolZones, v))
        : [],
    }
  } catch {
    return defaultLayers
  }
}
export function publicCalendarRecords(
  layers: CalendarLayers,
  timeZone = 'Europe/Paris',
): FamilyRecord<'event'>[] {
  function record(
    id: string,
    title: string,
    start: string,
    end: string,
    school: boolean,
  ): FamilyRecord<'event'> {
    return {
      id: 'public:' + id,
      household_id: '',
      created_by: '',
      created_at: '',
      updated_at: '',
      deleted: false,
      kind: 'event',
      version: 0,
      payload: {
        ...blankEvent(start, timeZone),
        title,
        start: start + 'T00:00',
        end: end + 'T00:00',
        allDay: true,
        color: school ? '#50c1ad' : '#dca94e',
        description: school
          ? 'Départ après la classe le premier jour indiqué ; reprise le matin du dernier jour (non inclus).'
          : 'Jour férié national en France métropolitaine.',
        location: school ? data.schoolSource : data.holidaySource,
      },
    }
  }
  return [
    ...(layers.holidays
      ? data.holidays
          .filter((h) => h.region === 'metropole')
          .map((h) =>
            record(
              'holiday:' + h.date,
              h.title,
              h.date,
              Temporal.PlainDate.from(h.date).add({ days: 1 }).toString(),
              false,
            ),
          )
      : []),
    ...data.school
      .filter((s) => layers.zones.includes(s.zone))
      .map((s) =>
        record(
          'school:' + s.zone + ':' + s.start + ':' + s.title,
          s.title + ' · Zone ' + s.zone,
          s.start,
          s.end,
          true,
        ),
      ),
  ]
}
export const calendarCoverage = {
  updated: data.fetchedAt,
  holidayYears: data.holidayYears,
  schoolYears: [...new Set(data.school.map((s) => s.schoolYear))],
}
