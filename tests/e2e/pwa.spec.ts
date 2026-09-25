import { expect, test } from '@playwright/test'

test('le manifest et les icônes rendent la PWA installable', async ({ page, request }) => {
  await page.goto('/profil')
  const manifestUrl = await page.locator('link[rel="manifest"]').getAttribute('href')
  const response = await request.get(manifestUrl!)
  const manifest = await response.json()
  expect(manifest).toMatchObject({
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    lang: 'fr',
  })
  expect(manifest.icons).toHaveLength(3)
  for (const icon of manifest.icons) {
    const image = await request.get(icon.src)
    expect(image.ok()).toBe(true)
    expect(image.headers()['content-type']).toContain('image/png')
  }
  await page.getByText('Comment installer l’application ?', { exact: true }).click()
  await expect(
    page.getByText('Sur iPhone ou iPad, ouvrez cette adresse dans Safari.'),
  ).toBeVisible()
})

test('la navigation interne suit les changements de connexion', async ({ page, context }) => {
  await page.goto('/profil')
  await expect(
    page.getByText(/L’interface est prête à être consultée hors connexion/),
  ).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true)
  await context.setOffline(true)
  await page.getByRole('link', { name: 'Accueil', exact: true }).filter({ visible: true }).click()
  await page.getByRole('link', { name: /Les courses Une liste/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Les courses')
  await expect(page.getByRole('status')).toContainText('Vous êtes hors connexion')
  await page.getByRole('link', { name: 'Retour à l’accueil' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Le quotidien, ensemble.')
  const cached = await page.evaluate(async () =>
    (
      await Promise.all(
        (await caches.keys()).map(async (key) =>
          (await (await caches.open(key)).keys()).map((request) => request.url),
        ),
      )
    ).flat(),
  )
  expect(cached.some((url) => /\/api\//.test(url))).toBe(false)
  await context.setOffline(false)
  await expect(page.getByText(/Vous êtes hors connexion/)).not.toBeVisible()
})

test('l’outil push ne demande aucune permission à l’ouverture', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__permissionCalls', { value: 0, writable: true })
    if ('Notification' in window)
      Notification.requestPermission = async () => {
        Reflect.set(
          window,
          '__permissionCalls',
          Number(Reflect.get(window, '__permissionCalls')) + 1,
        )
        return 'denied'
      }
  })
  await page.goto('/profil/notifications')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tester les notifications')
  expect(await page.evaluate(() => Reflect.get(window, '__permissionCalls'))).toBe(0)
  await expect(page.getByLabel('Code d’essai privé')).toHaveAttribute('type', 'password')
  await expect(
    page.getByRole('button', { name: 'Activer les notifications de test' }),
  ).not.toBeVisible()
})
