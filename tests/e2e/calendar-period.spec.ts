import { test, expect } from '@playwright/test'
import { familyDatabase } from '../helpers/family-database'
import { connectDatabase, login } from '../helpers/family-browser'

test.use({ baseURL: 'http://127.0.0.1:4175', serviceWorkers: 'block' })
test('sélection sur deux mois, désélection et création persistante d’une garde', async ({
  page,
  context,
}) => {
  const db = await familyDatabase()
  try {
    await page.clock.setFixedTime(new Date('2026-09-25T12:00:00Z'))
    await connectDatabase(context, db)
    await login(page)
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
    await page.getByRole('link', { name: /Famille Membres/ }).click()
    await page.getByLabel('Nom du foyer').fill('La maison')
    await page.getByRole('button', { name: 'Créer le foyer', exact: true }).click()
    await page.getByText('Les enfants', { exact: true }).click()
    await page.getByLabel('Prénom de l’enfant').fill('Clara')
    await page.getByRole('button', { name: 'Ajouter un enfant', exact: true }).click()
    await expect(page.getByText('Clara', { exact: true })).toBeVisible()
    await page.goto('/')
    await page.getByRole('button', { name: 'septembre 2026', exact: true }).click()
    await page.getByRole('button', { name: 'Sélect.', exact: true }).click()
    const create = page.getByRole('button', { name: 'Créer une période', exact: true })
    await expect(create).toBeDisabled()
    await page.getByRole('button', { name: 'Sélectionner le 2026-09-28', exact: true }).click()
    await expect(create).toBeDisabled()
    await page.getByRole('button', { name: 'Sélectionner le 2026-10-03', exact: true }).click()
    await expect(create).toBeEnabled()
    await page.getByRole('button', { name: 'Sélectionner le 2026-10-03', exact: true }).click()
    await expect(create).toBeDisabled()
    await page.getByRole('button', { name: 'Sélectionner le 2026-10-03', exact: true }).click()
    await create.click()
    await expect(page.getByLabel('Début', { exact: true })).toHaveValue('2026-09-28')
    await expect(page.getByLabel('Dernier jour inclus')).toHaveValue('2026-10-03')
    await page.getByLabel('Toute la journée').uncheck()
    await expect(page.getByLabel('Fin', { exact: true })).toHaveValue('2026-10-03T10:00')
    await page.getByLabel('Toute la journée').check()
    await expect(page.getByLabel('Dernier jour inclus')).toHaveValue('2026-10-03')
    await page.getByLabel('Type de période').selectOption('school')
    await expect(page.getByLabel('Titre', { exact: true })).toHaveValue('Vacances scolaires')
    await page.getByLabel('Type de période').selectOption('custody')
    await page
      .getByRole('combobox', { name: 'Enfant', exact: true })
      .selectOption({ label: 'Clara' })
    await page.getByLabel('Titre', { exact: true }).fill('Garde de Clara')
    await expect(page.getByLabel('Modèle de garde')).toHaveCount(0)
    await page.getByRole('button', { name: 'Enregistrer l’événement' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Sélect.', exact: true })).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'Rechercher un événement' }).click()
    await page.getByRole('searchbox').fill('Garde de Clara')
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Garde de Clara/ })
      .click()
    await expect(page.getByLabel('Début', { exact: true })).toHaveValue('2026-09-28')
    await expect(page.getByLabel('Dernier jour inclus')).toHaveValue('2026-10-03')
    await expect(page.getByRole('combobox', { name: 'Enfant', exact: true })).not.toHaveValue('')
  } finally {
    await db.close()
  }
})
