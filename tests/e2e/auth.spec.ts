import { test, expect, type Page } from '@playwright/test'

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'alice@example.test',
  email_confirmed_at: '2026-09-25T00:00:00Z',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-09-25T00:00:00Z',
}
function session() {
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      exp: Math.floor(Date.now() / 1000) + 3600,
      role: 'authenticated',
    }),
  ).toString('base64url')
  return {
    access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.testsignature`,
    refresh_token: 'synthetic-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    user,
  }
}
async function backend(page: Page) {
  let profile = {
    id: user.id,
    first_name: 'Alice',
    avatar: 'profile',
    time_zone: 'UTC',
    created_at: user.created_at,
    updated_at: user.created_at,
  }
  const writes: unknown[] = []
  await page.route('https://auth.test.invalid/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const body = request.postDataJSON() as Record<string, unknown> | null
    let data: unknown = {}
    if (url.pathname.endsWith('/households')) data = []
    else if (url.pathname.endsWith('/signup')) data = user
    else if (url.pathname.endsWith('/token') || url.pathname.endsWith('/verify')) {
      if (body?.password === 'incorrect-password' || body?.token === '000000') {
        await route.fulfill({
          status: 400,
          headers: {
            'x-supabase-api-version': '2024-01-01',
            'access-control-expose-headers': 'X-Supabase-Api-Version',
          },
          json: {
            code: body?.token ? 'otp_expired' : 'invalid_credentials',
            msg: 'Do not show raw backend details',
          },
        })
        return
      }
      data = session()
    } else if (url.pathname.endsWith('/user')) {
      data = user
      if (request.method() === 'PUT') writes.push(body)
    } else if (url.pathname.endsWith('/profiles')) {
      if (request.method() === 'PATCH') {
        profile = { ...profile, ...body }
        writes.push(body)
      }
      data = profile
    }
    await route.fulfill({ status: 200, json: data })
  })
  return writes
}

test.describe('comptes avec API Supabase simulée', () => {
  test.use({ baseURL: 'http://127.0.0.1:4175', serviceWorkers: 'block' })

  test('connexion, profil, restauration puis déconnexion', async ({ page }) => {
    const writes = await backend(page)
    await page.goto('/auth/connexion')
    await page.getByLabel('Adresse e-mail').fill(user.email)
    await page.getByLabel('Mot de passe', { exact: true }).fill('incorrect-password')
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('incorrect')
    await page.getByLabel('Mot de passe', { exact: true }).fill('une-longue-phrase-test')
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Ouvrir le menu' })).toBeVisible()
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
    await page.getByRole('link', { name: /Mon profil/ }).click()
    await page.getByText('Modifier mon profil', { exact: true }).click()
    await expect(page.getByLabel('Prénom')).toHaveValue('Alice')
    await page.getByLabel('Prénom').fill('Alicia')
    await page.getByLabel('Avatar').selectOption('leaf')
    await page.getByLabel('Fuseau horaire').fill('Europe/Paris')
    await page.getByRole('button', { name: 'Enregistrer mon profil' }).click()
    await expect(page.getByText('Votre profil a été enregistré.')).toBeVisible()
    expect(writes).toContainEqual({
      first_name: 'Alicia',
      avatar: 'leaf',
      time_zone: 'Europe/Paris',
    })
    await page.reload()
    await expect(page.getByLabel('Prénom')).toHaveValue('Alicia')
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
      'une-longue-phrase-test',
    )
    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    await expect(page.getByRole('link', { name: 'Se connecter', exact: true })).toBeVisible()
    await expect(page.getByLabel('Prénom')).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('link', { name: 'Se connecter', exact: true })).toBeVisible()
  })

  test('inscription, code expiré puis vérification', async ({ page }) => {
    await backend(page)
    await page.goto('/auth/inscription')
    await page.getByLabel('Prénom').fill('Alice')
    await page.getByLabel('Adresse e-mail').fill(user.email)
    await page.getByLabel('Mot de passe', { exact: true }).fill('une-longue-phrase-test')
    await page.getByLabel('Confirmer le mot de passe').fill('une-autre-phrase-test')
    await page.getByRole('button', { name: 'Créer mon compte' }).click()
    await expect(page.getByRole('alert')).toContainText('identiques')
    await page.getByLabel('Confirmer le mot de passe').fill('une-longue-phrase-test')
    await page.getByRole('button', { name: 'Créer mon compte' }).click()
    await expect(page).toHaveURL(/\/auth\/verification$/)
    await page.getByLabel('Adresse e-mail').fill(user.email)
    await page.getByLabel('Code reçu par e-mail').fill('000000')
    await page.getByRole('button', { name: 'Vérifier le code' }).click()
    await expect(page.getByRole('alert')).toContainText('expiré')
    await page.getByLabel('Code reçu par e-mail').fill('123456')
    await page.getByRole('button', { name: 'Vérifier le code' }).click()
    await expect(page.getByRole('button', { name: 'Ouvrir le menu' })).toBeVisible()
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
    await page.getByRole('link', { name: /Mon profil/ }).click()
    await page.getByText('Modifier mon profil', { exact: true }).click()
    await expect(page.getByLabel('Prénom')).toHaveValue('Alice')
    expect(page.url()).not.toContain(user.email)
  })

  test('un échec de sauvegarde conserve la saisie et permet de réessayer', async ({ page }) => {
    await backend(page)
    await page.goto('/auth/connexion')
    await page.getByLabel('Adresse e-mail').fill(user.email)
    await page.getByLabel('Mot de passe', { exact: true }).fill('une-longue-phrase-test')
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Ouvrir le menu' })).toBeVisible()
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
    await page.getByRole('link', { name: /Mon profil/ }).click()
    await page.getByText('Modifier mon profil', { exact: true }).click()
    await expect(page.getByLabel('Prénom')).toHaveValue('Alice')
    await page.getByLabel('Prénom').fill('Alicia')
    const failSave = async (route: import('@playwright/test').Route) => {
      if (route.request().method() === 'PATCH')
        await route.fulfill({
          status: 400,
          json: { code: '23514', message: 'private backend detail' },
        })
      else await route.fallback()
    }
    await page.route('**/rest/v1/profiles**', failSave)
    await page.getByRole('button', { name: 'Enregistrer mon profil' }).click()
    await expect(page.getByRole('alert')).toContainText('valeur non autorisée')
    await expect(page.getByLabel('Prénom')).toHaveValue('Alicia')
    await page.unroute('**/rest/v1/profiles**', failSave)
    await page.getByRole('button', { name: 'Enregistrer mon profil' }).click()
    await expect(page.getByText('Votre profil a été enregistré.')).toBeVisible()
  })

  test('récupération par code et nouveau mot de passe', async ({ page }) => {
    const writes = await backend(page)
    await page.goto('/auth/recuperation')
    await page.getByLabel('Adresse e-mail').fill(user.email)
    await page.getByRole('button', { name: 'Recevoir un code' }).click()
    await expect(
      page.getByText('Si un compte correspond à cette adresse, un code vous a été envoyé.'),
    ).toBeVisible()
    await page.getByLabel('Code reçu par e-mail').fill('123456')
    await page.getByRole('button', { name: 'Vérifier le code' }).click()
    await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('ma-nouvelle-phrase-test')
    await page.getByLabel('Confirmer le mot de passe').fill('ma-nouvelle-phrase-test')
    await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('button', { name: 'Ouvrir le menu' })).toBeVisible()
    expect(writes).toContainEqual(expect.objectContaining({ password: 'ma-nouvelle-phrase-test' }))
  })
})

test('sans raccordement : aucun faux compte et formulaires accessibles sur mobile', async ({
  page,
}) => {
  await page.goto('/profil')
  await page.getByRole('link', { name: 'Créer un compte', exact: true }).click()
  await expect(
    page.getByText('Les comptes ne sont pas encore activés', { exact: false }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Créer mon compte' })).toBeDisabled()
  await page.setViewportSize({ width: 320, height: 640 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
