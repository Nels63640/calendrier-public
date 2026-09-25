import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useAccount } from '../auth/auth-context'
import { supabase } from '../../data/supabase'
import { AccountError, formError } from '../auth/auth-errors'
import { FamilyContext } from './family-context'
import {
  emptySnapshot,
  listHouseholds,
  rpc,
  saveCommand,
  type Household,
  type SaveCommand,
  type Snapshot,
} from './family-api'
import {
  clearOffline,
  readOffline,
  writeOffline,
  offlineHouseholds,
  retainOffline,
} from './offline'
import type { FamilyRecord, Kind } from '../../../../../packages/domain/src/family'

export function FamilyProvider({ children }: { children: ReactNode }) {
  const account = useAccount()
  const user = account.user?.id ?? ''
  const [owner, setOwner] = useState('')
  const [households, setHouseholds] = useState<Household[]>([])
  const [active, setActive] = useState('')
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState<SaveCommand[]>([])
  const [offline, setOffline] = useState(!navigator.onLine)
  const identity = useRef({ user, active })
  useLayoutEffect(() => {
    identity.current = { user, active }
  }, [user, active])
  const queue = useRef(pending)
  useLayoutEffect(() => {
    queue.current = pending
  }, [pending])
  const generation = useRef(0)
  const loadedUser = useRef(user)

  const refresh = useCallback(async () => {
    if (!user) return
    const version = ++generation.current
    const current = () =>
      identity.current.user === user &&
      identity.current.active === active &&
      version === generation.current
    setLoading(true)
    try {
      if (!navigator.onLine) {
        const spaces = await offlineHouseholds(user)
        if (!current()) return
        setOwner(user)
        setHouseholds(spaces)
        const chosen = spaces.some((space) => space.id === active) ? active : (spaces[0]?.id ?? '')
        if (chosen !== active) {
          setActive(chosen)
          return
        }
        const cached = chosen ? await readOffline(user, chosen) : null
        if (current()) {
          setSnapshot(cached?.snapshot ?? emptySnapshot)
          setPending(cached?.pending ?? [])
          setError('')
        }
        return
      }
      const spaces = await listHouseholds()
      if (!current()) return
      await retainOffline(
        user,
        spaces.map((space) => space.id),
      ).catch(() => {})
      if (!current()) return
      setOwner(user)
      setHouseholds(spaces)
      const chosen = spaces.some((h) => h.id === active) ? active : (spaces[0]?.id ?? '')
      if (chosen !== active) {
        setSnapshot(emptySnapshot)
        setPending([])
        setActive(chosen)
        return
      }
      if (!chosen) {
        setSnapshot(emptySnapshot)
        return
      }
      let commands = queue.current
      if (!commands.length)
        commands = (await readOffline(user, chosen).catch(() => null))?.pending ?? []
      if (!current()) return
      setPending(commands)
      while (commands.length) {
        try {
          await rpc('save_record', { ...commands[0] })
        } catch (cause) {
          setError(formError(cause))
          break
        }
        commands = commands.slice(1)
        if (!current()) return
        setPending(commands)
        // Journal persistant après chaque accusé de réception ; rejeu idempotent si fermeture avant écriture.
        await writeOffline(user, chosen, emptySnapshot, commands).catch(() => {})
      }
      const data = await rpc<Snapshot>('family_snapshot', { p_household: chosen })
      if (!current()) return
      setSnapshot(data)
      if (!commands.length) setError('')
      await writeOffline(user, chosen, data, commands).catch(() => {})
    } catch (cause) {
      if (!current()) return
      setError(formError(cause))
      if (!navigator.onLine && active) {
        const cached = await readOffline(user, active).catch(() => null)
        if (cached && current()) {
          setSnapshot(cached.snapshot)
          setPending(cached.pending)
        }
      } else {
        setSnapshot(emptySnapshot)
      }
    } finally {
      if (current()) setLoading(false)
    }
  }, [user, active])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (loadedUser.current !== user) {
        loadedUser.current = user
        queue.current = []
        setPending([])
        setSnapshot(emptySnapshot)
        setHouseholds([])
        setOwner(user)
      }
      if (user) void refresh()
      else {
        setHouseholds([])
        setActive('')
        setSnapshot(emptySnapshot)
        setPending([])
        setError('')
        if (account.status === 'signed-out') void clearOffline().catch(() => {})
      }
    }, 0)
    const counter = generation
    return () => {
      clearTimeout(timer)
      counter.current++
    }
  }, [user, refresh, account.status])
  useEffect(() => {
    const update = () => {
      setOffline(!navigator.onLine)
      if (navigator.onLine) void refresh()
    }
    const visible = () => {
      if (document.visibilityState === 'visible') update()
    }
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    document.addEventListener('visibilitychange', visible)
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) void refresh()
    }, 15000)
    const channel =
      active && supabase
        ? supabase
            .channel(`family:${active}`)
            .on(
              'postgres_changes',
              {
                event: '*',
                schema: 'public',
                table: 'family_records',
                filter: `household_id=eq.${active}`,
              },
              () => {
                void refresh()
              },
            )
            .subscribe()
        : null
    return () => {
      clearInterval(poll)
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      document.removeEventListener('visibilitychange', visible)
      if (channel) void supabase?.removeChannel(channel)
    }
  }, [active, refresh])

  async function save(kind: Kind, payload: unknown, existing?: FamilyRecord, deleted = false) {
    if (!user || !active) throw new AccountError('Choisissez un foyer.')
    const command = saveCommand(active, kind, payload, existing, deleted)
    if (!navigator.onLine) {
      if (!['shopping', 'task'].includes(kind))
        throw new AccountError(
          'Reconnectez-vous pour modifier le calendrier ou les réglages du foyer.',
        )
      if (pending.some((c) => c.p_id === command.p_id))
        throw new AccountError('Une modification de cet élément attend déjà la connexion.')
      const next = [...pending, command]
      await writeOffline(user, active, snapshot, next)
      setPending(next)
      return
    }
    await rpc('save_record', { ...command })
    await refresh()
  }
  async function discardPending() {
    await writeOffline(user, active, snapshot, [])
    setPending([])
    queue.current = []
    await refresh()
  }
  function select(id: string) {
    generation.current++
    setSnapshot(emptySnapshot)
    setPending([])
    setError('')
    setActive(id)
  }
  // Une transition de compte ne rend jamais les données du compte précédent.
  const valid = Boolean(user) && owner === user && households.some((h) => h.id === active)
  return (
    <FamilyContext.Provider
      value={{
        households: user && owner === user ? households : [],
        active: user && owner === user ? active : '',
        snapshot: valid ? snapshot : emptySnapshot,
        loading,
        error,
        pending: pending.length,
        offline,
        select,
        refresh,
        save,
        discardPending,
      }}
    >
      {children}
    </FamilyContext.Provider>
  )
}
