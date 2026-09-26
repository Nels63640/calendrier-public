import { expect, test } from '@playwright/test'

test('le gestionnaire de push transmet un message neutre à l’API de notification', async ({
  page,
  context,
}) => {
  await page.goto('/profil')
  await page.getByText('Installer l’application', { exact: true }).click()
  await expect(
    page.getByText(/L’interface est prête à être consultée hors connexion/),
  ).toBeVisible()
  const worker = context.serviceWorkers()[0]
  // Le navigateur Windows de test refuse les notifications système : l’API est simulée explicitement.
  const calls = await worker.evaluate(async () => {
    const scope = globalThis as unknown as { registration: ServiceWorkerRegistration }
    const calls: { title: string; options?: NotificationOptions }[] = []
    const original = scope.registration.showNotification
    scope.registration.showNotification = async (title, options) => {
      calls.push({ title, options })
    }
    try {
      const jobs: Promise<unknown>[] = []
      const event = new Event('push')
      Object.defineProperty(event, 'data', {
        value: { json: () => ({ id: 'essai-local', title: 'Donnée à ignorer' }) },
      })
      Object.defineProperty(event, 'waitUntil', {
        value: (job: Promise<unknown>) => jobs.push(job),
      })
      self.dispatchEvent(event)
      await Promise.all(jobs)
      return calls
    } finally {
      scope.registration.showNotification = original
    }
  })
  expect(calls).toHaveLength(1)
  expect(calls[0]).toMatchObject({
    title: 'Calendrier familial',
    options: {
      body: 'Votre notification de test est arrivée.',
      data: { url: '/profil/notifications' },
    },
  })
})

test('le refus de permission reste explicite et ne crée aucun abonnement', async ({ page }) => {
  let subscriptions = 0
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { get: () => 'default' })
    Notification.requestPermission = async () => 'denied'
  })
  await page.route('**/api/push-proof/**', async (route) => {
    if (route.request().url().endsWith('/subscribe')) subscriptions++
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ publicKey: 'cle-publique-de-test' }),
    })
  })
  await page.goto('/profil/notifications')
  await page.getByLabel('Code d’essai privé').fill('code-de-test-sans-secret-00000000000000')
  await page.getByRole('button', { name: 'Connecter l’outil d’essai' }).click()
  await page.getByRole('button', { name: 'Activer les notifications de test' }).click()
  await expect(page.getByRole('alert')).toContainText('Vous n’avez pas autorisé')
  expect(subscriptions).toBe(0)
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toContain('code-de-test')
})

test('rappel et modification affichent la date, l’heure et le nom dans le Service Worker', async ({
  page,
  context,
}) => {
  await page.goto('/profil')
  await page.getByText('Installer l’application', { exact: true }).click()
  await expect(
    page.getByText(/L’interface est prête à être consultée hors connexion/),
  ).toBeVisible()
  const calls = await context.serviceWorkers()[0].evaluate(async () => {
    const scope = globalThis as unknown as { registration: ServiceWorkerRegistration }
    const results: { title: string; options?: NotificationOptions }[] = []
    const original = scope.registration.showNotification
    scope.registration.showNotification = async (title, options) => {
      results.push({ title, options })
    }
    try {
      for (const [kind, prefix] of [
        ['reminder', 'Rappel'],
        ['activity', 'Modification'],
      ]) {
        const pending: Promise<unknown>[] = []
        const event = new Event('push')
        Object.defineProperty(event, 'data', {
          value: {
            json: () => ({
              kind,
              entity: 'event',
              action: 'updated',
              id: kind,
              body: prefix + ' : 27/09/2026 à 14:30 · Dentiste',
            }),
          },
        })
        Object.defineProperty(event, 'waitUntil', {
          value: (p: Promise<unknown>) => pending.push(p),
        })
        self.dispatchEvent(event)
        await Promise.all(pending)
      }
      return results
    } finally {
      scope.registration.showNotification = original
    }
  })
  expect(calls).toHaveLength(2)
  expect(calls[0].options?.body).toBe('Rappel : 27/09/2026 à 14:30 · Dentiste')
  expect(calls[1].options?.body).toBe('Modification : 27/09/2026 à 14:30 · Dentiste')
  expect(calls[0].options?.data).toEqual({ url: '/calendrier' })
})
