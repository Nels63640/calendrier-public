import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('configuration push réservée au serveur et au bon secret de déclenchement', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema vault;
      create table vault.decrypted_secrets(name text, decrypted_secret text);
      insert into vault.decrypted_secrets values
        ('REMINDER_CRON_SECRET', repeat('x', 32)),
        ('VAPID_SUBJECT', 'https://example.com'),
        ('VAPID_PUBLIC_KEY', 'publique-test'),
        ('VAPID_PRIVATE_KEY', 'privee-test');
    `)
    await db.exec(await readFile('supabase/migrations/202609260008_worker_push_config.sql', 'utf8'))
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(
        db.query("select public.worker_push_config(repeat('x',32))"),
        /permission denied/,
      )
      await db.exec('reset role')
    }
    await db.exec('set role service_role')
    for (const token of [null, '', 'incorrect']) {
      const result = await db.query<{ config: unknown }>(
        'select public.worker_push_config($1) as config',
        [token],
      )
      assert.equal(result.rows[0].config, null)
    }
    const result = await db.query<{ config: Record<string, string> }>(
      "select public.worker_push_config(repeat('x',32)) as config",
    )
    assert.deepEqual(result.rows[0].config, {
      VAPID_SUBJECT: 'https://example.com',
      VAPID_PUBLIC_KEY: 'publique-test',
      VAPID_PRIVATE_KEY: 'privee-test',
    })
    await db.exec(
      "reset role; delete from vault.decrypted_secrets where name='VAPID_PRIVATE_KEY'; set role service_role;",
    )
    await assert.rejects(
      db.query("select public.worker_push_config(repeat('x',32))"),
      /Configuration push incomplète/,
    )
  } finally {
    await db.close()
  }
})
