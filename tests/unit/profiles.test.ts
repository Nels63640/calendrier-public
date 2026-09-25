import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('PostgreSQL : profils privés, contraintes et colonnes protégées', async () => {
  const db = new PGlite()
  const a = '11111111-1111-4111-8111-111111111111'
  const b = '22222222-2222-4222-8222-222222222222'
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;`)
    await db.exec(
      await readFile(
        new URL('../../supabase/migrations/202609250001_profiles.sql', import.meta.url),
        'utf8',
      ),
    )
    await db.query('insert into auth.users values ($1, $2), ($3, $4)', [
      a,
      { first_name: 'Alice', role: 'admin' },
      b,
      { first_name: '' },
    ])
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${a}'`)
    const own = await db.query<{ id: string; first_name: string }>('select * from public.profiles')
    assert.equal(own.rows.length, 1)
    assert.equal(own.rows[0].id, a)
    assert.equal(own.rows[0].first_name, 'Alice')
    assert.equal(
      (
        await db.query('update public.profiles set first_name = $1 where id = $2 returning id', [
          'Intrusion',
          b,
        ])
      ).rows.length,
      0,
    )
    await assert.rejects(db.query('update public.profiles set id = $1', [b]), /permission denied/)
    await assert.rejects(
      db.query('update public.profiles set created_at = now()'),
      /permission denied/,
    )
    await assert.rejects(db.query('delete from public.profiles'), /permission denied/)
    await assert.rejects(
      db.query('insert into public.profiles (id) values ($1)', [a]),
      /permission denied/,
    )
    for (const patch of ["first_name = ''", "avatar = 'admin'", "time_zone = 'Europe/Imaginaire'"])
      await assert.rejects(db.exec(`update public.profiles set ${patch}`), /check constraint/)
    await db.exec(
      "update public.profiles set first_name = 'Alicia', avatar = 'leaf', time_zone = 'Europe/Paris'",
    )
    await db.exec(`set request.jwt.claim.sub = '${b}'`)
    assert.equal(
      (await db.query<{ first_name: string }>('select first_name from public.profiles')).rows[0]
        .first_name,
      'Mon profil',
    )
    await db.exec('reset role; set role anon')
    await assert.rejects(db.query('select * from public.profiles'), /permission denied/)
    await db.exec('reset role')
    await db.query('delete from auth.users where id = $1', [a])
    assert.equal((await db.query('select * from public.profiles')).rows.length, 1)
  } finally {
    await db.close()
  }
})
