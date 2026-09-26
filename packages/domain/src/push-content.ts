/** Détails minimaux autorisés par le serveur, sans description ni liste de personnes. */
export interface PushDetail {
  title: string
  start?: string | null
  allDay?: boolean
  timeZone?: string | null
}
function clean(value: unknown, limit: number) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : ''
}
export function pushDetailText(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const item = input as Record<string, unknown>
  const title = clean(item.title, 120)
  if (!title) return ''
  const match =
    typeof item.start === 'string'
      ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(item.start)
      : null
  if (!match) return title
  const [, year, month, day, hour, minute] = match
  const when = day + '/' + month + '/' + year
  return (
    when +
    (item.allDay === true ? ' · Journée entière' : ' à ' + hour + ':' + minute) +
    ' · ' +
    title
  )
}
export function detailedPushBody(
  kind: 'activity' | 'reminder',
  action: unknown,
  details: unknown,
  total?: number,
) {
  if (!Array.isArray(details)) return ''
  const lines = details.slice(0, 3).map(pushDetailText).filter(Boolean)
  if (!lines.length) return ''
  const prefix =
    kind === 'reminder'
      ? 'Rappel'
      : action === 'created'
        ? 'Ajout'
        : action === 'deleted'
          ? 'Suppression'
          : 'Modification'
  const remaining = Math.max(
    0,
    Math.min(10000, Number.isFinite(total) ? total! : details.length) - lines.length,
  )
  return (
    prefix +
    ' : ' +
    lines.join(' ; ') +
    (remaining ? ' ; +' + remaining + ' autre(s)' : '')
  ).slice(0, 650)
}
