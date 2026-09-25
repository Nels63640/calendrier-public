import { BrowserRouter, HashRouter } from 'react-router'
import type { ReactNode } from 'react'
export function AppRouter({ children }: { children: ReactNode }) {
  const Router = import.meta.env.VITE_ROUTING === 'hash' ? HashRouter : BrowserRouter
  return <Router>{children}</Router>
}
