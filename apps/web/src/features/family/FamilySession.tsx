import type { ReactNode } from 'react'
import { FamilyProvider } from './FamilyProvider'
export function FamilySession({ children }: { children: ReactNode }) {
  return <FamilyProvider>{children}</FamilyProvider>
}
