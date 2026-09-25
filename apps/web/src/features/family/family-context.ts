import { createContext, useContext } from 'react'
import type { FamilyRecord, Kind } from '../../../../../packages/domain/src/family'
import type { Household, Snapshot } from './family-api'
import { emptySnapshot } from './family-api'
export interface FamilyState {
  households: Household[]
  active: string
  snapshot: Snapshot
  loading: boolean
  error: string
  pending: number
  offline: boolean
  select: (id: string) => void
  refresh: () => Promise<void>
  save: (kind: Kind, payload: unknown, existing?: FamilyRecord, deleted?: boolean) => Promise<void>
  discardPending: () => Promise<void>
}
export const FamilyContext = createContext<FamilyState>({
  households: [],
  active: '',
  snapshot: emptySnapshot,
  loading: false,
  error: '',
  pending: 0,
  offline: false,
  select: () => {},
  refresh: async () => {},
  save: async () => {},
  discardPending: async () => {},
})
export function useFamily() {
  return useContext(FamilyContext)
}
