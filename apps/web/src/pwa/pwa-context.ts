import { createContext, useContext } from 'react'

export const PwaContext = createContext({
  ready: false,
  updateAvailable: false,
  error: '',
  applyUpdate: () => {},
})

export function usePwa() {
  return useContext(PwaContext)
}
