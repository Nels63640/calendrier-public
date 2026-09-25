import { useEffect, useState, type ReactNode } from 'react'
import { parseTheme, ThemeContext, themeStorageKey, type ThemePreference } from './theme-context'

function readPreference() {
  try {
    return parseTheme(localStorage.getItem(themeStorageKey))
  } catch {
    return 'system' as const
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setTheme] = useState<ThemePreference>(readPreference)

  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = preference === 'dark' || (preference === 'system' && query.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#191e1b' : '#f7f5ef')
    }
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [preference])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === themeStorageKey || event.key === null) setTheme(readPreference())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setPreference = (value: ThemePreference) => {
    setTheme(value)
    try {
      localStorage.setItem(themeStorageKey, value)
    } catch {
      /* Le thème reste utilisable lorsque le stockage du navigateur est indisponible. */
    }
  }

  return (
    <ThemeContext.Provider value={{ preference, setPreference }}>{children}</ThemeContext.Provider>
  )
}
