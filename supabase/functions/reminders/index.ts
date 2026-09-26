import { deliverPushJobs, type PushJob } from '../../../packages/domain/src/push-delivery.ts'
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
async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client.rpc(name, args)
  if (error) throw new Error('Échec de traitement serveur')
  return data as T
}

Deno.serve(async (request) => {
  const authorization = request.headers.get('authorization') ?? ''
  if (request.method !== 'POST' || !/^Bearer [A-Za-z0-9_-]{32,}$/.test(authorization))
    return new Response('Accès refusé', { status: 401 })
  try {
    const configuration = await rpc<Record<string, string> | null>('worker_push_config', {
      p_token: authorization.slice(7),
    })
    if (!configuration) return new Response('Accès refusé', { status: 401 })
    webpush.setVapidDetails(
      configuration.VAPID_SUBJECT,
      configuration.VAPID_PUBLIC_KEY,
      configuration.VAPID_PRIVATE_KEY,
    )
    const send = (
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
      payload: string,
    ) => webpush.sendNotification(subscription, payload, { TTL: 3600, timeout: 5000 })
    const activityJobs = await rpc<PushJob[]>('claim_activity')
    await deliverPushJobs(activityJobs, 'activity', {
      send,
      finish: (id, lease, status) =>
        rpc('finish_activity', { p_id: id, p_lease: lease, p_status: status }),
    })
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
          p_detail: job.detail,
        })
      after = sources[sources.length - 1].record.id
      await rpc('reminder_cursor', {
        p_after: sources.length < 100 ? '00000000-0000-0000-0000-000000000000' : after,
      })
      if (sources.length < 100) break
    }
    const jobs = await rpc<PushJob[]>('claim_reminders')
    await deliverPushJobs(jobs, 'reminder', {
      send,
      finish: (id, lease, status) =>
        rpc('finish_reminder', { p_id: id, p_lease: lease, p_status: status }),
    })
    return Response.json({ processed: jobs.length, activities: activityJobs.length })
  } catch {
    return Response.json(
      { error: 'Traitement incomplet, reprise au prochain passage.' },
      { status: 500 },
    )
  }
})
