import { test, expect } from '@playwright/test'
import { familyDatabase, asUser, call, alice } from '../helpers/family-database'
import { connectDatabase, login } from '../helpers/family-browser'

test.use({ baseURL: 'http://127.0.0.1:4175', serviceWorkers: 'block' })
test('parcours familial réel en base : foyer, enfant, garde, courses, tâche et export', async ({
  context,
  page,
}) => {
  const db = await familyDatabase()
  try {
    await connectDatabase(context, db)
    await login(page)
    await page.getByRole('link', { name: 'Gérer le foyer', exact: true }).click()
    await page.getByLabel('Nom du foyer').fill('La maison')
    await page.getByRole('button', { name: 'Créer le foyer', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Les membres de La maison' })).toBeVisible()
    await page.getByLabel('Prénom de l’enfant').fill('Emma')
    await page.getByRole('button', { name: 'Ajouter un enfant', exact: true }).click()
    await expect(page.getByText('Emma', { exact: true })).toBeVisible()
    await page.goto('/garde')
    await page.getByRole('button', { name: 'Planifier une garde', exact: true }).click()
    await page
      .getByRole('combobox', { name: 'Enfant', exact: true })
      .selectOption({ label: 'Emma' })
    await page.getByLabel('Titre', { exact: true }).fill('Semaine Emma')
    await page.getByRole('button', { name: 'Enregistrer l’événement' }).click()
    await expect(page.getByRole('button', { name: /Semaine Emma/ }).first()).toBeVisible()
    await page.goto('/courses')
    await page.getByLabel('Produit', { exact: true }).fill('Pommes')
    await page.getByLabel('Quantité').fill('2 kg')
    await page.getByRole('button', { name: 'Ajouter le produit' }).click()
    await expect(page.getByText('Pommes', { exact: true })).toBeVisible()
    await page.getByRole('checkbox', { name: /Pommes/ }).click()
    await expect(page.getByText('Pommes', { exact: true })).toHaveCount(0)
    await page.getByLabel('Voir les éléments terminés').check()
    await expect(page.getByRole('checkbox', { name: /Pommes/ })).toBeChecked()
    await page.goto('/taches')
    await page.getByLabel('Titre de la tâche').fill('Préparer le sac')
    await page.getByRole('button', { name: 'Ajouter la tâche' }).click()
    await expect(page.getByText('Préparer le sac', { exact: true })).toBeVisible()
    await page.goto('/')
    await expect(page.getByText('Préparer le sac', { exact: true })).toBeVisible()
    await page.goto('/profil')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exporter mes données accessibles' }).click()
    expect((await download).suggestedFilename()).toBe('calendrier-familial-export.json')
    await page.setViewportSize({ width: 320, height: 700 })
    await page.goto('/calendrier')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally {
    await db.close()
  }
})

test('courses hors connexion : journal durable puis reprise sans doublon', async ({
  context,
  page,
}) => {
  const db = await familyDatabase()
  try {
    await asUser(db, alice)
    await call(db, 'create_household', ['Hors ligne'])
    await connectDatabase(context, db)
    await login(page)
    await page.goto('/courses')
    await page.getByLabel('Produit', { exact: true }).waitFor()
    await context.setOffline(true)
    await page.getByLabel('Produit', { exact: true }).fill('Pain')
    await page.getByRole('button', { name: 'Ajouter le produit' }).click()
    await expect(page.getByText('Modification conservée en attente de connexion.')).toBeVisible()
    await expect(page.getByText(/1 modification\(s\) en attente/)).toBeVisible()
    await context.setOffline(false)
    await expect(page.getByText('Pain', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByText('Pain', { exact: true })).toHaveCount(1)
    await asUser(db, alice)
    expect(
      (await db.query("select * from public.family_records where kind='shopping'")).rows,
    ).toHaveLength(1)
  } finally {
    await db.close()
  }
})
