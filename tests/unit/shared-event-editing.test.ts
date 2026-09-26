import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { familyDatabase, asUser, call, alice, bob, eve } from '../helpers/family-database.ts'
import { blankEvent } from '../../packages/domain/src/family.ts'

test('edition partagee owner/admin, confidentialite, occurrences et inscription push', async () => {
  const db = await familyDatabase()
  try {
    await asUser(db, alice)
    const home = await call<string>(db, 'create_household', ['Famille'])
    const invitation = await call<string>(db, 'create_invitation', [home, null, 'admin'])
    const memberInvitation = await call<string>(db, 'create_invitation', [home, null, 'member'])
    await asUser(db, bob)
    await call(db, 'accept_invitation', [invitation])
    await asUser(db, eve)
    await call(db, 'accept_invitation', [memberInvitation])
    const payload = {
      ...blankEvent('2026-09-26', 'Europe/Paris'),
      title: 'Partage',
      recurrence: { frequency: 'daily', interval: 1, count: 4, until: null },
    }
    const id = randomUUID()
    await asUser(db, bob)
    await call(db, 'save_record', [home, id, 'event', payload, 0, randomUUID(), false])
    await asUser(db, alice)
    const changed = await call<{ version: number; created_by: string }>(db, 'save_record', [
      home,
      id,
      'event',
      { ...payload, title: 'Modifie par proprio' },
      1,
      randomUUID(),
      false,
    ])
    assert.equal(changed.created_by, bob)
    await call(db, 'change_occurrence', [
      home,
      id,
      changed.version,
      1,
      '2026-09-27T09:00',
      'one',
      { ...payload, start: '2026-09-27T11:00', end: '2026-09-27T12:00' },
      false,
      randomUUID(),
    ])
    const own = randomUUID(),
      priv = randomUUID()
    await call(db, 'save_record', [home, own, 'event', payload, 0, randomUUID(), false])
    await call(db, 'save_record', [
      home,
      priv,
      'event',
      { ...payload, visibility: 'private' },
      0,
      randomUUID(),
      false,
    ])
    await asUser(db, bob)
    await call(db, 'save_record', [
      home,
      own,
      'event',
      { ...payload, title: 'Modifie par admin' },
      1,
      randomUUID(),
      false,
    ])
    await call(db, 'change_occurrence', [
      home,
      own,
      2,
      1,
      '2026-09-27T09:00',
      'one',
      payload,
      true,
      randomUUID(),
    ])
    await assert.rejects(
      call(db, 'save_record', [home, priv, 'event', payload, 1, randomUUID(), false]),
      /FORBIDDEN/,
    )
    await assert.rejects(
      call(db, 'change_occurrence', [
        home,
        priv,
        1,
        1,
        '2026-09-27T09:00',
        'one',
        payload,
        true,
        randomUUID(),
      ]),
      /FORBIDDEN/,
    )
    await asUser(db, eve)
    await assert.rejects(
      call(db, 'save_record', [home, own, 'event', payload, 3, randomUUID(), false]),
      /FORBIDDEN/,
    )
    const endpoint = 'https://fcm.googleapis.com/fcm/send/test'
    await asUser(db, alice)
    assert.equal(await call(db, 'push_registered', [endpoint]), false)
    await call(db, 'register_push', [endpoint, 'a'.repeat(87), 'b'.repeat(22)])
    assert.equal(await call(db, 'push_registered', [endpoint]), true)
    await asUser(db, bob)
    assert.equal(await call(db, 'push_registered', [endpoint]), false)
    await call(db, 'save_record', [home, randomUUID(), 'event', payload, 0, randomUUID(), false])
    await db.exec('reset role')
    assert.equal(
      (await db.query<{ n: number }>('select count(*)::int n from private.activity_jobs')).rows[0]
        .n,
      1,
    )
  } finally {
    await db.close()
  }
})
