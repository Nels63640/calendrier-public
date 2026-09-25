import { test, expect } from '@playwright/test'
import { familyDatabase, asUser, call, alice } from '../helpers/family-database'
import { connectDatabase, login } from '../helpers/family-browser'

test.use({ baseURL: 'http://127.0.0.1:4175', serviceWorkers: 'block' })
test('accueil calendrier, année-mois-jour, événement réel, recherche et menu', async ({
  context,
  page,
}) => {
  const db = await familyDatabase()
  try {
    await asUser(db, alice)
    await call(db, 'create_household', ['Chez nous'])
    await connectDatabase(context, db)
    await page.clock.setFixedTime(new Date('2026-09-25T21:23:00Z'))
    await login(page)
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('2026')
    await page.getByRole('button', { name: 'septembre 2026', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('septembre')
    await page.getByRole('button', { name: 'Voir le 2026-09-25', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('vendredi')
    await expect(page.locator('[data-day="2026-09-25"] .hour-line')).toHaveCount(25)
    await page.getByRole('button', { name: 'Ajouter un événement' }).click()
    await page.getByLabel('Titre', { exact: true }).fill('Sortie au parc')
    await page.getByRole('button', { name: 'Enregistrer l’événement' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await page.getByRole('button', { name: 'Rechercher un événement' }).click()
    await page.getByRole('searchbox').fill('Sortie au parc')
    await page
      .getByRole('dialog', { name: 'Rechercher' })
      .getByRole('button', { name: /Sortie au parc/ })
      .click()
    await expect(page.getByLabel('Titre', { exact: true })).toHaveValue('Sortie au parc')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
    await page.getByRole('link', { name: /Courses Notre liste/ }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Les courses')
    await page.getByRole('link', { name: 'Retour au calendrier' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('2026')
    await page.setViewportSize({ width: 320, height: 700 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally {
    await db.close()
  }
})
