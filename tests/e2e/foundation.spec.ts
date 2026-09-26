import { expect, test } from '@playwright/test'

test('navigation, lien profond et retour vers le calendrier', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.locator('.native-calendar')).toBeVisible()
  await expect(page.getByRole('link', { name: /accueil/i })).toHaveCount(0)
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
  await page.getByRole('link', { name: /Courses Notre liste/ }).click()
  await expect(page).toHaveURL(/\/courses$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Les courses')
  await page.getByRole('link', { name: 'Retour au calendrier' }).click()
  await expect(page).toHaveURL(/\/$/)
  expect(errors).toEqual([])
})

test('la palette noire et rouge reste identique sur les rubriques', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  for (const path of ['/profil', '/foyer', '/taches', '/courses', '/garde', '/calendrier']) {
    await page.goto(path)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)')
  }
})

test('le thème reste utilisable quand le stockage est refusé', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException('Stockage indisponible', 'SecurityError')
    }
    Storage.prototype.setItem = () => {
      throw new DOMException('Stockage indisponible', 'SecurityError')
    }
  })
  await page.goto('/profil')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('le menu d’ajout se ferme au clavier et ouvre la rubrique choisie', async ({ page }) => {
  await page.goto('/')
  const add = page
    .getByRole('button', { name: 'Ouvrir le menu', exact: true })
    .filter({ visible: true })
  await add.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Fermer' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(add).toBeFocused()
  await add.click()
  await dialog.getByRole('link', { name: /Garde Le rythme/ }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('La garde alternée')
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
})

test('les rubriques restent dans la largeur de l’écran', async ({ page }) => {
  for (const path of ['/', '/calendrier', '/taches', '/courses', '/garde', '/profil']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  }
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

test('une route inconnue propose de retrouver le calendrier', async ({ page }) => {
  await page.goto('/page-inconnue')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cette page est introuvable.')
  await page.getByRole('link', { name: 'Revenir au calendrier' }).click()
  await expect(page).toHaveURL(/\/$/)
})
