import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import webpush from 'npm:web-push@3.6.7'
import { planReminders, type ReminderSource } from '../../../packages/domain/src/reminders.ts'

const env = (key: string) => {
  const value = Deno.env.get(key)
  if (!value) throw new Error('Configuration serveur incomplète')
  return value
}
const client = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})
webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))
async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client.rpc(name, args)
  if (error) throw new Error('Échec de traitement serveur')
  return data as T
}

Deno.serve(async (request) => {
  if (
    request.method !== 'POST' ||
    request.headers.get('authorization') !== `Bearer ${env('REMINDER_CRON_SECRET')}`
  )
    return new Response('Accès refusé', { status: 401 })
  try {
    await rpc('prune_family_data')
    let after = await rpc<string>('reminder_cursor')
    const started = Date.now()
    // Reprise indépendante de toute session ou de l’ouverture de la PWA.
    while (Date.now() - started < 30000) {
      const sources = await rpc<ReminderSource[]>('reminder_sources', { p_after: after })
      if (!sources.length) {
        await rpc('reminder_cursor', { p_after: '00000000-0000-0000-0000-000000000000' })
        break
      }
      for (const job of planReminders(sources, new Date().toISOString()))
        await rpc('enqueue_reminder', {
          p_id: job.id,
          p_record: job.recordId,
          p_version: job.version,
          p_subscription: job.subscriptionId,
          p_due: job.due,
        })
      after = sources[sources.length - 1].record.id
      await rpc('reminder_cursor', {
        p_after: sources.length < 100 ? '00000000-0000-0000-0000-000000000000' : after,
      })
      if (sources.length < 100) break
    }
    const jobs = await rpc<
      {
        id: string
        lease: string
        subscriptionId: string
        endpoint: string
        keys: { p256dh: string; auth: string }
      }[]
    >('claim_reminders')
    for (let offset = 0; offset < jobs.length; offset += 5) {
      await Promise.all(
        jobs.slice(offset, offset + 5).map(async (job) => {
          let status = 'sent'
          try {
            const endpoint = new URL(job.endpoint)
            if (
              endpoint.protocol !== 'https:' ||
              endpoint.port ||
              endpoint.username ||
              endpoint.password ||
              !(
                /^(?:[a-z0-9-]+\.)?push\.apple\.com$/.test(endpoint.hostname) ||
                ['fcm.googleapis.com', 'updates.push.services.mozilla.com'].includes(
                  endpoint.hostname,
                )
              )
            )
              throw new Error('Destination refusée')
            await webpush.sendNotification(
              { endpoint: job.endpoint, keys: job.keys },
              JSON.stringify({
                kind: 'reminder',
                id: job.id,
                title: 'Calendrier familial',
                body: 'Un rappel vous attend dans votre espace.',
                tag: job.id,
                url: '/calendrier',
              }),
              { TTL: 300, timeout: 5000 },
            )
          } catch (error) {
            const code =
              error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 0
            status = code === 404 || code === 410 ? 'expired' : 'retry'
          }
          await rpc('finish_reminder', { p_id: job.id, p_lease: job.lease, p_status: status })
        }),
      )
    }
    return Response.json({ processed: jobs.length })
  } catch {
    return Response.json(
      { error: 'Traitement incomplet, reprise au prochain passage.' },
      { status: 500 },
    )
  }
})
