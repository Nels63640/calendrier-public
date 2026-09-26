import { detailedPushBody, type PushDetail } from './push-content.ts'

export interface PushJob {
  id: string
  lease: string
  endpoint: string
  keys: { p256dh: string; auth: string }
  kind?: string
  action?: string
  details?: PushDetail[]
  total?: number
}
export async function deliverPushJobs(
  jobs: PushJob[],
  kind: 'activity' | 'reminder',
  transport: {
    send: (
      subscription: { endpoint: string; keys: PushJob['keys'] },
      payload: string,
    ) => Promise<unknown>
    finish: (id: string, lease: string, status: 'sent' | 'expired' | 'retry') => Promise<unknown>
  },
) {
  for (let offset = 0; offset < jobs.length; offset += 5) {
    await Promise.all(
      jobs.slice(offset, offset + 5).map(async (job) => {
        let status: 'sent' | 'expired' | 'retry' = 'sent'
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
            throw Error('Destination refusée')
          await transport.send(
            { endpoint: job.endpoint, keys: job.keys },
            JSON.stringify({
              kind,
              id: job.id,
              entity: job.kind,
              action: job.action,
              body: detailedPushBody(kind, job.action, job.details, job.total),
            }),
          )
        } catch (error) {
          const code =
            error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 0
          status = code === 404 || code === 410 ? 'expired' : 'retry'
        }
        await transport.finish(job.id, job.lease, status)
      }),
    )
  }
  return jobs.length
}
