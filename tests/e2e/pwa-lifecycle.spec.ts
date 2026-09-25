import { expect, test } from '@playwright/test'
import { appServer } from '../helpers/app-server'

test('une mise à jour attend la confirmation sans effacer la saisie', async ({ page }) => {
  const server = await appServer()
  try {
    await page.goto(`${server.origin}/profil/notifications`)
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true)
    await page.getByLabel('Code d’essai privé').fill('brouillon de test sans secret')
    server.nextRevision()
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())?.update()
    })
    await expect(page.getByRole('button', { name: 'Mettre à jour', exact: true })).toBeVisible()
    await expect(page.getByLabel('Code d’essai privé')).toHaveValue('brouillon de test sans secret')
    await Promise.all([
      page.waitForEvent('load'),
      page.getByRole('button', { name: 'Mettre à jour', exact: true }).click(),
    ])
    await expect(page.getByLabel('Code d’essai privé')).toHaveValue('')
    await expect(page.getByRole('button', { name: 'Mettre à jour', exact: true })).not.toBeVisible()
  } finally {
    await server.stop()
  }
})

test('les liens directs fonctionnent même lorsque le serveur est arrêté', async ({ page }) => {
  const server = await appServer()
  try {
    await page.goto(`${server.origin}/profil`)
    await page.getByText('Installer l’application', { exact: true }).click()
    await expect(
      page.getByText(/L’interface est prête à être consultée hors connexion/),
    ).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true)
    await server.stop()
    await page.goto(`${server.origin}/courses`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Les courses')
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Les courses')
  } finally {
    await server.stop()
  }
})
