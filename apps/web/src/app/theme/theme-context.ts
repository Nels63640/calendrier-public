import { createContext, useContext } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'
export const themeStorageKey = 'family-calendar:theme'

export function parseTheme(value: string | null): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system'
}

export const ThemeContext = createContext<{
  preference: ThemePreference
  setPreference: (value: ThemePreference) => void
} | null>(null)

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('Le thème doit être utilisé dans ThemeProvider.')
  return context
}
