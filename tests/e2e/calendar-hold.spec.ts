import { test, expect } from '@playwright/test'
import { familyDatabase, asUser, call, alice } from '../helpers/family-database'
import { connectDatabase, login } from '../helpers/family-browser'

test.use({ baseURL: 'http://127.0.0.1:4175', serviceWorkers: 'block' })
test('appui long à une heure, annulation du geste et encadré modifiable selon sa durée', async ({
  page,
  context,
}) => {
  const db = await familyDatabase()
  try {
    await asUser(db, alice)
    await call(db, 'create_household', ['Notre famille'])
    await connectDatabase(context, db)
    await page.clock.setFixedTime(new Date('2026-09-26T09:00:00Z'))
    await login(page)
    await page.getByRole('button', { name: 'septembre 2026', exact: true }).click()
    await page.getByRole('button', { name: 'Voir le 2026-09-26', exact: true }).click()
    const timeline = page.locator('[data-day="2026-09-26"] .native-timeline')
    await timeline.evaluate((element) => {
      const viewport = element.closest('.native-scroll')!
      viewport.scrollTop +=
        element.getBoundingClientRect().top + 512.5 - viewport.getBoundingClientRect().top - 160
    })
    await page.waitForTimeout(350)
    const rect = await timeline.boundingBox()
    if (!rect) throw Error('Journée absente')
    const x = rect.x + rect.width * 0.6,
      y = rect.y + 513
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.waitForTimeout(100)
    await page.mouse.move(x, y + 30)
    await page.waitForTimeout(600)
    await page.mouse.up()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.waitForTimeout(600)
    await page.mouse.up()
    await expect(page.getByLabel('Début', { exact: true })).toHaveValue('2026-09-26T10:15')
    await expect(page.getByLabel('Fin', { exact: true })).toHaveValue('2026-09-26T11:15')
    await page.getByLabel('Titre', { exact: true }).fill('Rendez-vous Clara')
    await page.getByRole('button', { name: 'Enregistrer l’événement' }).click()
    const card = timeline.getByRole('button', { name: /Rendez-vous Clara/ })
    await expect(card).toHaveCSS('height', '50px')
    await expect(card).toHaveCSS('top', '512.5px')
    await card.click()
    await page.getByLabel('Fin', { exact: true }).fill('2026-09-26T12:15')
    await page.getByRole('button', { name: 'Enregistrer l’événement' }).click()
    await expect(card).toHaveCSS('height', '100px')
    await card.click()
    await expect(page.getByLabel('Fin', { exact: true })).toHaveValue('2026-09-26T12:15')
  } finally {
    await db.close()
  }
})
