import { test, expect } from '@playwright/test'
import { familyDatabase, asUser, call, alice } from '../helpers/family-database'
import { connectDatabase, login } from '../helpers/family-browser'
test.use({ baseURL: 'http://127.0.0.1:4175', serviceWorkers: 'block' })

test('rappels à unités : sélection, aperçu, sauvegarde, réouverture et suppression', async ({
  page,
  context,
}, info) => {
  const db = await familyDatabase()
  try {
    await asUser(db, alice)
    await call(db, 'create_household', ['Notre famille'])
    await connectDatabase(context, db)
    await page.clock.setFixedTime(new Date('2026-09-26T09:00:00Z'))
    await login(page)
    await page.getByRole('button', { name: 'Ajouter un événement' }).click()
    await page.getByLabel('Titre', { exact: true }).fill('Dentiste avec rappels')
    await page.getByRole('button', { name: '15 min', exact: true }).click()
    await page.getByRole('button', { name: '1 heure', exact: true }).click()
    await page.getByRole('button', { name: '1 jour', exact: true }).click()
    await page.getByRole('button', { name: '1 semaine', exact: true }).click()
    await page
      .getByRole('button', { name: '+ Ajouter un rappel personnalisé', exact: true })
      .click()
    await page.getByLabel('Unité du rappel 5').selectOption('months')
    await page.getByLabel('Délai du rappel 5').fill('2')
    await expect(
      page.getByRole('button', { name: '+ Ajouter un rappel personnalisé', exact: true }),
    ).toBeDisabled()
    await expect(page.locator('.reminder-preview')).toHaveCount(5)
    await page.setViewportSize({ width: 320, height: 760 })
    await page.locator('.reminder-editor').scrollIntoViewIfNeeded()
    await expect(page.locator('.reminder-editor')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page
      .locator('.reminder-editor')
      .screenshot({ path: info.outputPath('reminder-selector.png') })
    await page.getByRole('button', { name: 'Enregistrer l’événement' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'Rechercher un événement' }).click()
    await page.getByRole('searchbox').fill('Dentiste avec rappels')
    await page.getByRole('button', { name: /Dentiste avec rappels/ }).click()
    await expect(page.getByLabel('Unité du rappel 5')).toHaveValue('months')
    await expect(page.getByLabel('Délai du rappel 5')).toHaveValue('2')
    await page.getByRole('button', { name: 'Supprimer le rappel 5', exact: true }).click()
    await page.getByRole('button', { name: 'Enregistrer l’événement' }).click()
    await db.exec('reset role')
    const stored = await db.query<{ reminders: unknown[] }>(
      "select payload->'reminders' as reminders from public.family_records where kind='event'",
    )
    expect(stored.rows[0].reminders).toHaveLength(4)
  } finally {
    await db.close()
  }
})

test('jours fériés, zones scolaires persistantes et anniversaire annuel', async ({
  page,
  context,
}) => {
  // Ce parcours complet dépasse 30 s sur WebKit dans le runner CI.
  test.setTimeout(60_000)
  const db = await familyDatabase()
  try {
    await asUser(db, alice)
    await call(db, 'create_household', ['Notre famille'])
    await connectDatabase(context, db)
    await page.clock.setFixedTime(new Date('2026-09-26T09:00:00Z'))
    await login(page)
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
    await page.getByText(/Vacances scolaires.*Choisir ma zone/).click()
    await page.getByRole('checkbox', { name: /Zone A Besançon/ }).check()
    await page.getByRole('checkbox', { name: /Zone C Créteil/ }).check()
    await page.getByRole('button', { name: 'Ajouter un anniversaire' }).click()
    await page.getByLabel('Prénom ou nom').fill('Clara')
    await page.getByLabel('Jour', { exact: true }).fill('26')
    await page.getByRole('combobox', { name: 'Mois', exact: true }).selectOption('9')
    await page.getByRole('button', { name: '1 jour', exact: true }).click()
    await page.getByRole('button', { name: 'Enregistrer l’anniversaire' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
    await page.getByText(/Vacances scolaires.*Zone A/).click()
    await expect(page.getByRole('checkbox', { name: /Zone A Besançon/ })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: /Zone C Créteil/ })).toBeChecked()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Rechercher un événement' }).click()
    await page.getByRole('searchbox').fill('Toussaint')
    await expect(
      page.getByRole('button', { name: /Vacances de la Toussaint · Zone A/ }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Vacances de la Toussaint · Zone C/ }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Vacances de la Toussaint · Zone B/ }),
    ).toHaveCount(0)
    await page.getByRole('searchbox').fill('14 juillet')
    await page.getByRole('button', { name: /14 juillet/ }).click()
    await expect(page.getByText('Calendrier officiel en lecture seule.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enregistrer l’événement' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Rechercher un événement' }).click()
    await page.getByRole('searchbox').fill('Anniversaire de Clara')
    await expect(page.getByRole('button', { name: /Anniversaire de Clara/ })).toBeVisible()
    await db.exec('reset role')
    const result = await db.query<{ type: string; repeat: string }>(
      "select payload->>'eventType' as type,payload->'recurrence'->>'frequency' as repeat from public.family_records where kind='event'",
    )
    expect(result.rows).toEqual([{ type: 'birthday', repeat: 'yearly' }])

    await page.getByRole('button', { name: 'Fermer', exact: true }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await page.getByRole('button', { name: 'Choisir une vue' }).first().click()
    await page.getByRole('button', { name: 'Journée', exact: true }).click()
    await page.getByRole('button', { name: 'Choisir une vue' }).first().click()
    await page.getByLabel('Aller à une date').fill('2026-07-13')
    await page.getByRole('button', { name: 'Fermer', exact: true }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect(
      page.locator('[data-day="2026-07-13"]').getByRole('button', { name: /14 juillet/ }),
    ).toHaveCount(0)
    await expect(
      page.locator('[data-day="2026-07-14"]').getByRole('button', { name: /14 juillet/ }),
    ).toHaveCount(1)
  } finally {
    await db.close()
  }
})

test('modifier un anniversaire existant conserve son identité, ses rappels et le 29 février', async ({
  page,
  context,
}) => {
  test.setTimeout(60_000)
  const db = await familyDatabase()
  try {
    await asUser(db, alice)
    await call(db, 'create_household', ['Notre famille'])
    await connectDatabase(context, db)
    await page.clock.setFixedTime(new Date('2026-09-26T09:00:00Z'))
    await login(page)
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
    await page.getByText(/Vacances scolaires.*Choisir ma zone/).click()
    await page.getByRole('button', { name: 'Ajouter un anniversaire' }).click()
    await page.getByLabel('Prénom ou nom').fill('Clara')
    await page.getByLabel('Jour', { exact: true }).fill('26')
    await page.getByRole('combobox', { name: 'Mois', exact: true }).selectOption('9')
    await page.getByRole('button', { name: '1 jour', exact: true }).click()
    await page.getByRole('button', { name: 'Enregistrer l’anniversaire' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await db.exec('reset role')
    const before = await db.query<{ id: string }>(
      "select id from public.family_records where kind='event'",
    )
    await page.getByRole('button', { name: 'Rechercher un événement' }).click()
    await page.getByRole('searchbox').fill('Clara')
    await page.getByRole('button', { name: /Anniversaire de Clara/ }).click()
    await expect(
      page.getByRole('heading', { name: 'Modifier l’anniversaire', exact: true }),
    ).toBeVisible()
    await expect(page.getByLabel('Prénom ou nom')).toHaveValue('Clara')
    await expect(page.getByLabel('Jour', { exact: true })).toHaveValue('26')
    await page.getByLabel('Prénom ou nom').fill('Clara Martin')
    await page.getByRole('combobox', { name: 'Mois', exact: true }).selectOption('2')
    await page.getByLabel('Jour', { exact: true }).fill('29')
    await page.getByLabel('Couleur', { exact: true }).fill('#32a852')
    await page.getByRole('button', { name: 'Enregistrer les modifications' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await db.exec('reset role')
    const after = await db.query<{ id: string; payload: Record<string, unknown>; version: number }>(
      "select id,payload,version from public.family_records where kind='event'",
    )
    expect(after.rows).toHaveLength(1)
    expect(after.rows[0].id).toBe(before.rows[0].id)
    expect(after.rows[0].version).toBe(2)
    expect(after.rows[0].payload).toMatchObject({
      title: 'Anniversaire de Clara Martin',
      color: '#32a852',
      start: '2000-02-29T00:00',
      end: '2000-03-01T00:00',
      eventType: 'birthday',
      allDay: true,
      recurrence: { frequency: 'yearly', interval: 1 },
      reminders: [{ unit: 'days', amount: 1 }],
    })
    const restored = page.waitForResponse(
      (response) => response.url().includes('/rpc/family_snapshot') && response.ok(),
    )
    await page.reload()
    await restored
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    )
    await page.getByRole('button', { name: 'Rechercher un événement' }).click()
    await page.getByRole('searchbox').fill('Clara Martin')
    const result = page.getByRole('button', { name: /Anniversaire de Clara Martin/ })
    await expect(result).toHaveCount(1)
    await result.click()
    await expect(page.getByLabel('Jour', { exact: true })).toHaveValue('29')
    await expect(page.getByLabel('Couleur', { exact: true })).toHaveValue('#32a852')
    await page.getByRole('button', { name: 'Fermer', exact: true }).click()
    await page.getByRole('button', { name: 'Choisir une vue' }).last().click()
    await page.getByRole('button', { name: 'Journée', exact: true }).click()
    await page.getByRole('button', { name: 'Choisir une vue' }).first().click()
    await page.getByLabel('Aller à une date').fill('2026-02-28')
    await page.getByRole('button', { name: 'Fermer', exact: true }).click()
    const card = page
      .locator('[data-day="2026-02-28"]')
      .getByRole('button', { name: /Anniversaire de Clara Martin/ })
    await expect(card).toBeVisible()
    await expect(card).toHaveCSS('--event-color', '#32a852')
    await card.click()
    await expect(page.getByLabel('Prénom ou nom')).toHaveValue('Clara Martin')
    await page.getByRole('button', { name: 'Supprimer l’anniversaire', exact: true }).click()
    await page.getByRole('button', { name: 'Annuler', exact: true }).click()
    await expect(page.getByLabel('Prénom ou nom')).toHaveValue('Clara Martin')
    await page.getByRole('button', { name: 'Supprimer l’anniversaire', exact: true }).click()
    await page.getByRole('button', { name: 'Confirmer la suppression', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await db.exec('reset role')
    const removed = await db.query<{ deleted: boolean }>(
      "select deleted from public.family_records where kind='event'",
    )
    expect(removed.rows).toEqual([{ deleted: true }])
  } finally {
    await db.close()
  }
})
