import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
export const alice = '11111111-1111-4111-8111-111111111111',
  bob = '22222222-2222-4222-8222-222222222222',
  eve = '33333333-3333-4333-8333-333333333333'
export async function familyDatabase() {
  const db = new PGlite()
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`)
  const dir = new URL('../../supabase/migrations/', import.meta.url)
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort())
    await db.exec(await readFile(new URL(file, dir), 'utf8'))
  for (const [id, name] of [
    [alice, 'Alice'],
    [bob, 'Bob'],
    [eve, 'Eve'],
  ])
    await db.query('insert into auth.users values($1,$2,now(),$3)', [
      id,
      name.toLowerCase() + '@example.test',
      { first_name: name },
    ])
  return db
}
export async function asUser(db: PGlite, user: string) {
  await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${user}'`)
}
export async function call<T = unknown>(db: PGlite, name: string, args: unknown[]): Promise<T> {
  const result = await db.query<{ value: T }>(
    `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as value`,
    args,
  )
  return result.rows[0].value
}
