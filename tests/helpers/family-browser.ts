import type { BrowserContext, Page } from '@playwright/test'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, alice, bob } from './family-database.ts'

/** Seul Auth est simulé ; toutes les opérations familiales exécutent les migrations PostgreSQL. */
export async function connectDatabase(context: BrowserContext, db: PGlite) {
  let queue = Promise.resolve()
  await context.route('https://auth.test.invalid/**', (route) => {
    const current = queue.then(async () => {
      const request = route.request(),
        url = new URL(request.url()),
        body = request.postDataJSON() as Record<string, unknown> | null
      let id = alice
      const jwt = request.headers().authorization?.replace('Bearer ', '')
      try {
        if (jwt)
          id = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).sub ?? alice
      } catch {
        /* clé publique lors de la connexion */
      }
      if (url.pathname.endsWith('/token')) id = body?.email === 'bob@example.test' ? bob : alice
      const user = {
        id,
        email: id === bob ? 'bob@example.test' : 'alice@example.test',
        aud: 'authenticated',
        role: 'authenticated',
        email_confirmed_at: '2026-09-25T00:00:00Z',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-09-25T00:00:00Z',
      }
      const headers = {
        'x-supabase-api-version': '2024-01-01',
        'access-control-expose-headers': 'X-Supabase-Api-Version',
      }
      try {
        let data: unknown = {}
        if (url.pathname.endsWith('/token')) {
          const payload = Buffer.from(
            JSON.stringify({
              sub: id,
              exp: Math.floor(Date.now() / 1000) + 3600,
              role: 'authenticated',
            }),
          ).toString('base64url')
          data = {
            access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.synthetic`,
            refresh_token: 'synthetic',
            token_type: 'bearer',
            expires_in: 3600,
            user,
          }
        } else if (url.pathname.endsWith('/user')) data = user
        else {
          await asUser(db, id)
          if (url.pathname.endsWith('/profiles'))
            data = (await db.query('select * from public.profiles where id=$1', [id])).rows[0]
          else if (url.pathname.endsWith('/households'))
            data = (await db.query('select * from public.households order by created_at')).rows
          else if (url.pathname.includes('/rpc/')) {
            const name = url.pathname.split('/').pop()!
            if (!/^[a-z_]+$/.test(name)) throw new Error('FORBIDDEN')
            const entries = Object.entries(body ?? {})
            if (entries.some(([key]) => !/^p_[a-z_]+$/.test(key))) throw new Error('FORBIDDEN')
            const result = await db.query<{ value: unknown }>(
              `select public.${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(',')}) as value`,
              entries.map(([, v]) => v),
            )
            data = result.rows[0].value
          }
        }
        await route.fulfill({ status: 200, headers, json: data })
      } catch (error) {
        await route.fulfill({
          status: 400,
          headers,
          json: { code: 'P0001', message: error instanceof Error ? error.message : 'ERROR' },
        })
      }
    })
    queue = current.catch(() => {})
    return current
  })
}
export async function login(page: Page, email = 'alice@example.test') {
  await page.goto('/auth/connexion')
  await page.getByLabel('Adresse e-mail').fill(email)
  await page.getByLabel('Mot de passe', { exact: true }).fill('longue-phrase-de-test')
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await page.getByRole('button', { name: 'Ouvrir le menu', exact: true }).waitFor()
}
