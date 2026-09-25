/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { notificationContent, safeNotificationUrl } from './pwa/push-payload'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

setCacheNameDetails({ prefix: 'family-calendar' })
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
// Seulement la coquille statique. Jamais de cache de réponses API ou de données privées.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL(import.meta.env.BASE_URL + 'index.html'), {
    denylist: [/^\/api(?:\/|$)/, /^\/auth(?:\/|$)/, /\.[a-z0-9]+$/i],
  }),
)
clientsClaim()

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting())
})

self.addEventListener('push', (event) => {
  let payload: unknown = null
  try {
    payload = event.data?.json()
  } catch {
    /* Un push invalide affiche tout de même un message neutre. */
  }
  const content = notificationContent(payload)
  event.waitUntil(
    self.registration.showNotification(content.title, {
      body: content.body,
      icon: import.meta.env.BASE_URL + 'icons/icon-192.png',
      badge: import.meta.env.BASE_URL + 'icons/icon-192.png',
      tag: content.tag,
      data: { url: content.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const local = safeNotificationUrl(event.notification.data?.url, self.location.origin)
  const route = new URL(local).pathname
  const url = new URL(
    import.meta.env.BASE_URL +
      (import.meta.env.VITE_ROUTING === 'hash' ? '#' + route : route.slice(1)),
    self.location.origin,
  ).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = windows.find((client) => client.url === url)
      if (existing) {
        await existing.focus()
        return
      }
      // Ne pas naviguer de force un onglet où une future saisie peut être en cours.
      await self.clients.openWindow(url)
    })(),
  )
})
