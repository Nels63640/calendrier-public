import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { familyDatabase, asUser, call, alice, bob, eve } from '../helpers/family-database.ts'
import { blankEvent } from '../../packages/domain/src/family.ts'

test('foyers : invitations, isolation, concurrence, exceptions et départ', async (t) => {
  const db = await familyDatabase()
  try {
    await asUser(db, alice)
    const home = await call<string>(db, 'create_household', ['Famille A'])
    const code = await call<string>(db, 'create_invitation', [home, 'bob@example.test', 'member'])
    await asUser(db, eve)
    const elsewhere = await call<string>(db, 'create_household', ['Famille B'])
    await assert.rejects(call(db, 'accept_invitation', [code]), /INVALID_INVITATION/)
    await assert.rejects(call(db, 'family_snapshot', [home]), /FORBIDDEN/)
    await asUser(db, bob)
    assert.equal(await call(db, 'accept_invitation', [code]), home)
    await assert.rejects(call(db, 'accept_invitation', [code]), /INVALID_INVITATION/)
    await assert.rejects(call(db, 'create_invitation', [home, null, 'admin']), /FORBIDDEN/)
    await assert.rejects(call(db, 'manage_member', [home, alice, 'remove']), /FORBIDDEN/)
    await asUser(db, alice)
    const privateId = randomUUID(),
      sharedId = randomUUID(),
      childId = randomUUID()
    const event = {
      ...blankEvent('2026-03-20', 'Europe/Paris'),
      title: 'Privé',
      visibility: 'private',
      people: [bob],
    }
    await call(db, 'save_record', [
      home,
      childId,
      'child',
      { title: 'Emma', color: '#527a60', avatar: 'sun' },
      0,
      randomUUID(),
      false,
    ])
    await call(db, 'save_record', [home, privateId, 'event', event, 0, randomUUID(), false])
    const recurring = {
      ...event,
      title: 'Garde',
      visibility: 'household',
      childId,
      custody: true,
      start: '2026-03-20T18:00',
      end: '2026-03-27T18:00',
      recurrence: { frequency: 'weekly', interval: 2, count: null, until: null },
    }
    await call(db, 'save_record', [home, sharedId, 'event', recurring, 0, randomUUID(), false])
    await t.test('RLS ne confond pas personne concernée et accès', async () => {
      await asUser(db, bob)
      assert.equal(
        (await db.query('select * from public.family_records where id=$1', [privateId])).rows
          .length,
        0,
      )
      await assert.rejects(
        call(db, 'save_record', [home, sharedId, 'event', recurring, 1, randomUUID(), false]),
        /FORBIDDEN/,
      )
      await asUser(db, eve)
      assert.equal(
        (await db.query('select * from public.family_records where household_id=$1', [home])).rows
          .length,
        0,
      )
      await assert.rejects(
        call(db, 'save_record', [elsewhere, sharedId, 'event', recurring, 1, randomUUID(), false]),
        /FORBIDDEN/,
      )
    })
    await t.test('mutation idempotente et conflit de version', async () => {
      await asUser(db, bob)
      const id = randomUUID(),
        mutation = randomUUID(),
        payload = { title: 'Pommes', quantity: '2', category: 'Fruits', done: false }
      const first = await call<{ version: number }>(db, 'save_record', [
        home,
        id,
        'shopping',
        payload,
        0,
        mutation,
        false,
      ])
      const replay = await call<{ version: number }>(db, 'save_record', [
        home,
        id,
        'shopping',
        payload,
        0,
        mutation,
        false,
      ])
      assert.equal(first.version, replay.version)
      await call(db, 'save_record', [
        home,
        id,
        'shopping',
        { ...payload, done: true },
        1,
        randomUUID(),
        false,
      ])
      await assert.rejects(
        call(db, 'save_record', [home, id, 'shopping', payload, 1, randomUUID(), false]),
        /CONFLICT/,
      )
      await assert.rejects(
        db.query('update public.family_records set payload=$1', [payload]),
        /permission denied/,
      )
    })
    await t.test('exceptions et fractionnement atomique', async () => {
      await asUser(db, alice)
      await call(db, 'change_occurrence', [
        home,
        sharedId,
        1,
        2,
        '2026-04-17T18:00',
        'one',
        { ...recurring, start: '2026-04-18T18:00', end: '2026-04-25T18:00' },
        false,
        randomUUID(),
      ])
      assert.equal((await db.query('select * from public.event_exceptions')).rows.length, 1)
      await assert.rejects(
        call(db, 'change_occurrence', [
          home,
          sharedId,
          2,
          1,
          '2026-04-04T18:00',
          'one',
          recurring,
          true,
          randomUUID(),
        ]),
        /INVALID_OCCURRENCE/,
      )
      await call(db, 'change_occurrence', [
        home,
        sharedId,
        2,
        1,
        '2026-04-03T18:00',
        'following',
        { ...recurring, start: '2026-04-03T19:00', end: '2026-04-10T19:00' },
        false,
        randomUUID(),
      ])
      const exception = (
        await db.query<{ event_id: string; original_start: string }>(
          'select * from public.event_exceptions',
        )
      ).rows[0]
      assert.notEqual(exception.event_id, sharedId)
      assert.equal(exception.original_start, '2026-04-17T19:00')
      await assert.rejects(
        call(db, 'save_record', [
          home,
          childId,
          'child',
          { title: 'Emma', color: '#527a60', avatar: 'sun' },
          1,
          randomUUID(),
          true,
        ]),
        /IN_USE/,
      )
    })
    await t.test('un administrateur ne lit pas un événement privé', async () => {
      await asUser(db, alice)
      await call(db, 'manage_member', [home, bob, 'admin'])
      await asUser(db, bob)
      assert.equal(
        (await db.query('select * from public.family_records where id=$1', [privateId])).rows
          .length,
        0,
      )
      await call(db, 'manage_member', [home, bob, 'leave'])
      await assert.rejects(call(db, 'family_snapshot', [home]), /FORBIDDEN/)
    })
    await asUser(db, alice)
    await assert.rejects(call(db, 'erase_account', ['SUPPRIMER MON COMPTE']), /TRANSFER_OWNERSHIP/)
    await assert.rejects(call(db, 'delete_household', [home, 'Nom erroné']), /CONFIRMATION/)
  } finally {
    await db.close()
  }
})
