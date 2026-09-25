import type { SaveCommand, Snapshot } from './family-api'

let storageEpoch = 0

interface Stored {
  key: string
  user: string
  household: string
  snapshot: Snapshot
  at: number
  pending: SaveCommand[]
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('family-calendar-private', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('spaces', { keyPath: 'key' })
    request.onerror = () => reject(new Error('Stockage hors connexion indisponible.'))
    request.onsuccess = () => {
      const db = request.result,
        tx = db.transaction('spaces', 'readwrite')
      const cursor = tx.objectStore('spaces').openCursor()
      cursor.onsuccess = () => {
        const entry = cursor.result
        if (entry) {
          if (Date.now() - (entry.value as Stored).at >= 7 * 86400000) entry.delete()
          entry.continue()
        }
      }
      tx.oncomplete = () => resolve(db)
      tx.onerror = () => {
        db.close()
        reject(new Error('Stockage hors connexion indisponible.'))
      }
    }
  })
}
export async function readOffline(user: string, household: string): Promise<Stored | null> {
  const db = await database()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('spaces').objectStore('spaces').get(`${user}:${household}`)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const data = request.result as Stored | undefined
        resolve(data && Date.now() - data.at < 7 * 86400000 ? data : null)
      }
    })
  } finally {
    db.close()
  }
}
export async function writeOffline(
  user: string,
  household: string,
  snapshot: Snapshot,
  pending: SaveCommand[],
) {
  const epoch = storageEpoch
  if (pending.length > 100 || JSON.stringify(snapshot).length > 5_000_000)
    throw new Error('Limite du stockage hors connexion atteinte.')
  const db = await database()
  try {
    await new Promise<void>((resolve, reject) => {
      if (epoch !== storageEpoch) {
        resolve()
        return
      }
      const tx = db.transaction('spaces', 'readwrite')
      tx.objectStore('spaces').put({
        key: `${user}:${household}`,
        user,
        household,
        snapshot,
        pending,
        at: Date.now(),
      } satisfies Stored)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}
export async function clearOffline() {
  storageEpoch++
  const db = await database()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('spaces', 'readwrite')
      tx.objectStore('spaces').clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function offlineHouseholds(user: string) {
  const db = await database()
  try {
    return await new Promise<{ id: string; name: string; created_at: string }[]>(
      (resolve, reject) => {
        const request = db.transaction('spaces').objectStore('spaces').getAll()
        request.onerror = () => reject(request.error)
        request.onsuccess = () =>
          resolve(
            (request.result as Stored[])
              .filter((space) => space.user === user && Date.now() - space.at < 7 * 86400000)
              .map((space) => ({
                id: space.household,
                name: space.snapshot.name ?? 'Foyer enregistré',
                created_at: new Date(space.at).toISOString(),
              })),
          )
      },
    )
  } finally {
    db.close()
  }
}

export async function retainOffline(user: string, ids: string[]) {
  const db = await database()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('spaces', 'readwrite'),
        request = tx.objectStore('spaces').openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          const value = cursor.value as Stored
          if (value.user === user && !ids.includes(value.household)) cursor.delete()
          cursor.continue()
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}
