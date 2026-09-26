import { mkdir, writeFile } from 'node:fs/promises'
import { Temporal } from '@js-temporal/polyfill'
const source =
  'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records'
async function json(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw Error('Source publique HTTP ' + r.status)
  return r.json()
}
const holidays = []
for (const region of ['metropole'])
  for (const year of [2025, 2026, 2027, 2028]) {
    const data = await json(
      'https://calendrier.api.gouv.fr/jours-feries/' + region + '/' + year + '.json',
    )
    for (const [date, title] of Object.entries(data)) holidays.push({ region, date, title })
  }
const rows = []
for (let offset = 0; ; offset += 100) {
  const query = new URLSearchParams({
    where: 'zones in ("Zone A","Zone B","Zone C") and start_date >= "2025-01-01"',
    limit: '100',
    offset: String(offset),
    order_by: 'start_date',
  })
  const data = await json(source + '?' + query)
  rows.push(...data.results)
  if (rows.length >= data.total_count) break
  if (offset >= 2000) throw Error('Pagination excessive')
}
const local = (value) =>
  Temporal.Instant.from(value).toZonedDateTimeISO('Europe/Paris').toPlainDate().toString()
const unique = new Map()
for (const row of rows) {
  if (
    /enseignant/i.test(row.population) ||
    /enseignant|prérentrée|pré-rentrée/i.test(row.description)
  )
    continue
  const start = local(row.start_date),
    end = local(row.end_date)
  unique.set([row.zones, row.description, start, end].join('|'), {
    zone: row.zones.slice(-1),
    title: row.description,
    start,
    end,
    schoolYear: row.annee_scolaire,
  })
}
const school = [...unique.values()]
for (const item of school) {
  if (/été/i.test(item.title) && item.start === item.end) {
    const back = school
      .filter((x) => x.zone === item.zone && /rentrée/i.test(x.title) && x.start > item.start)
      .sort((a, b) => a.start.localeCompare(b.start))[0]
    if (
      back &&
      Temporal.PlainDate.from(item.start).until(Temporal.PlainDate.from(back.start)).days < 100
    ) {
      item.end = back.start
      item.title = 'Vacances d’été'
    }
  }
  if (item.start === item.end)
    item.end = Temporal.PlainDate.from(item.start).add({ days: 1 }).toString()
}
const result = {
  fetchedAt: new Date().toISOString().slice(0, 10),
  holidaySource: 'https://calendrier.api.gouv.fr/jours-feries/',
  schoolSource: 'https://data.education.gouv.fr/explore/dataset/fr-en-calendrier-scolaire/',
  holidayYears: [2025, 2026, 2027, 2028],
  holidays,
  school,
}
await mkdir('apps/web/src/data', { recursive: true })
await writeFile('apps/web/src/data/public-calendars.json', JSON.stringify(result, null, 2) + '\n')
console.log(
  JSON.stringify({
    holidays: holidays.length,
    school: school.length,
    schoolYears: [...new Set(school.map((x) => x.schoolYear))],
  }),
)
