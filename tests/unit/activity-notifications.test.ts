import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { familyDatabase, asUser, call, alice, bob, eve } from '../helpers/family-database.ts'
import { blankEvent } from '../../packages/domain/src/family.ts'

test('notifications de modification : destinataires, confidentialité, transactions et reprise', async (t) => {
  const db = await familyDatabase()
  try {
    await asUser(db, alice)
    const home = await call<string>(db, 'create_household', ['Famille'])
    const bobCode = await call<string>(db, 'create_invitation', [home, null, 'member'])
    const eveCode = await call<string>(db, 'create_invitation', [home, null, 'admin'])
    await asUser(db, bob)
    await call(db, 'accept_invitation', [bobCode])
    await asUser(db, eve)
    await call(db, 'accept_invitation', [eveCode])
    for (const user of [alice, bob, eve]) {
      await asUser(db, user)
      await call(db, 'register_push', [
        `https://fcm.googleapis.com/fcm/send/${user}`,
        'a'.repeat(87),
        'b'.repeat(22),
      ])
    }
    const clear = async () => {
      await db.exec('reset role;truncate private.activity_jobs')
      await asUser(db, alice)
    }
    const recipients = async () => {
      await db.exec('reset role')
      return (
        await db.query<{ user_id: string }>(
          'select s.user_id from private.activity_jobs j join private.push_subscriptions s on s.id=j.subscription_id order by s.user_id',
        )
      ).rows.map((r) => r.user_id)
    }
    await t.test('ajout partagé, exclusion de l’auteur et répétition idempotente', async () => {
      await clear()
      const id = randomUUID(),
        mutation = randomUUID(),
        payload = { ...blankEvent('2026-09-26', 'Europe/Paris'), title: 'Rendez-vous' }
      await call(db, 'save_record', [home, id, 'event', payload, 0, mutation, false])
      assert.deepEqual(await recipients(), [bob, eve])
      await asUser(db, alice)
      await call(db, 'save_record', [home, id, 'event', payload, 0, mutation, false])
      assert.deepEqual(await recipients(), [bob, eve])
    })
    await t.test(
      'les rôles propriétaire et administrateur reçoivent les changements d’un membre',
      async () => {
        await clear()
        await asUser(db, bob)
        await call(db, 'save_record', [
          home,
          randomUUID(),
          'shopping',
          { title: 'Pain', quantity: '1', category: '', done: false },
          0,
          randomUUID(),
          false,
        ])
        assert.deepEqual(await recipients(), [alice, eve])
      },
    )
    await t.test('événement privé et sélection des destinataires', async () => {
      await clear()
      const p = {
        ...blankEvent('2026-09-26', 'Europe/Paris'),
        title: 'Secret',
        visibility: 'private',
      }
      await call(db, 'save_record', [home, randomUUID(), 'event', p, 0, randomUUID(), false])
      assert.deepEqual(await recipients(), [])
      await asUser(db, alice)
      await call(db, 'save_record', [
        home,
        randomUUID(),
        'event',
        { ...p, visibility: 'selected', viewers: [bob] },
        0,
        randomUUID(),
        false,
      ])
      assert.deepEqual(await recipients(), [bob])
    })
    await t.test('révocation de visibilité avant envoi et RPC interdite aux membres', async () => {
      await clear()
      const id = randomUUID(),
        p = { ...blankEvent('2026-09-26', 'Europe/Paris'), title: 'Partagé' }
      await call(db, 'save_record', [home, id, 'event', p, 0, randomUUID(), false])
      await call(db, 'save_record', [
        home,
        id,
        'event',
        { ...p, visibility: 'private' },
        1,
        randomUUID(),
        false,
      ])
      await assert.rejects(call(db, 'claim_activity', []), /permission denied/)
      await db.exec('reset role;set role service_role')
      assert.deepEqual(await call(db, 'claim_activity', []), [])
    })
    await t.test('profil, invitation et changements groupés sans doublon', async () => {
      await clear()
      await db.query('update public.profiles set first_name=$1 where id=$2', [
        'Alice modifiée',
        alice,
      ])
      assert.deepEqual(await recipients(), [bob, eve])
      await clear()
      await call(db, 'create_invitation', [home, null, 'member'])
      assert.deepEqual(await recipients(), [bob, eve])
      await clear()
      await db.exec('begin')
      await call(db, 'manage_member', [home, bob, 'admin'])
      await call(db, 'manage_member', [home, bob, 'member'])
      await db.exec('commit')
      assert.deepEqual(await recipients(), [bob, eve])
    })
    await t.test('bail, nouvelle tentative et désinscription des endpoints expirés', async () => {
      await clear()
      await call(db, 'save_record', [
        home,
        randomUUID(),
        'category',
        { title: 'École', color: '#ff414b' },
        0,
        randomUUID(),
        false,
      ])
      await db.exec('reset role;set role service_role')
      const jobs = await call<{ id: string; lease: string }[]>(db, 'claim_activity', [])
      assert.equal(jobs.length, 2)
      assert.deepEqual(await call(db, 'claim_activity', []), [])
      await call(db, 'finish_activity', [jobs[0].id, randomUUID(), 'sent'])
      await call(db, 'finish_activity', [jobs[0].id, jobs[0].lease, 'retry'])
      await call(db, 'finish_activity', [jobs[1].id, jobs[1].lease, 'expired'])
      await db.exec('reset role')
      const states = await db.query<{ state: string }>('select state from private.activity_jobs')
      assert.deepEqual(states.rows, [{ state: 'pending' }])
      await db.exec(
        "update private.activity_jobs set available_at=now()-interval '1 second';set role service_role",
      )
      const retried = await call<{ id: string; lease: string }[]>(db, 'claim_activity', [])
      assert.equal(retried.length, 1)
      assert.notEqual(retried[0].lease, jobs[0].lease)
      await call(db, 'finish_activity', [retried[0].id, retried[0].lease, 'sent'])
    })
  } finally {
    await db.close()
  }
})
