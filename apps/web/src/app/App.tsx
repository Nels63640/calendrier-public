import { useFamily } from '../features/family/family-context'
import { Fragment, useEffect, useRef, useState, type MouseEvent } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router'
import { Icon } from '../components/Icon'
import { QuickAddDialog } from '../components/QuickAddDialog'
import { HomePage } from '../features/dashboard/HomePage'
import { CalendarPage } from '../features/calendar/CalendarPage'
import { ListsPage } from '../features/family/ListsPage'
import { HouseholdPage } from '../features/family/HouseholdPage'
import { FamilyBar } from '../features/family/FamilyShell'
import { useAccount } from '../features/auth/auth-context'
import { NotFoundPage } from '../features/overview/NotFoundPage'
import { ProfilePage } from '../features/settings/ProfilePage'
import { PwaStatus } from '../pwa/PwaStatus'
import { PushProofPage } from '../features/settings/PushProofPage'
import { AuthPage } from '../features/auth/AuthPage'
import { navigation } from './navigation'

export function App() {
  const account = useAccount()
  const family = useFamily()
  const familyKey = (account.user?.id ?? '') + family.active
  const [quickOpen, setQuickOpen] = useState(false)
  const { pathname } = useLocation()
  const calendarHome = pathname === '/calendrier' || (pathname === '/' && Boolean(account.user))
  const previousPath = useRef(pathname)

  const openQuickAdd = (event: MouseEvent<HTMLButtonElement>) => {
    // Safari ne donne pas systématiquement le focus au bouton touché.
    // Le dialogue pourra ainsi restituer le focus à son déclencheur.
    event.currentTarget.focus({ preventScroll: true })
    setQuickOpen(true)
  }

  useEffect(() => {
    const heading = document.querySelector<HTMLHeadingElement>('h1')
    document.title = `${heading?.textContent ?? 'Accueil'} · Calendrier familial`
    if (previousPath.current !== pathname) {
      window.scrollTo({ top: 0, behavior: 'instant' })
      heading?.focus({ preventScroll: true })
      previousPath.current = pathname
    }
  }, [pathname])

  const navLink = (item: (typeof navigation)[number]) => (
    <NavLink
      key={item.path}
      to={item.path}
      end={item.path === '/'}
      className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
    >
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </NavLink>
  )

  return (
    <div
      className={`app-shell${calendarHome ? ' calendar-shell' : account.user ? ' simple-shell' : ''}`}
    >
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
      >
        Aller au contenu
      </a>
      <aside className="sidebar">
        <Link to="/" className="brand" aria-label="Calendrier familial, accueil">
          <span className="brand-mark">
            <Icon name="home" size={24} />
          </span>
          <span>
            Calendrier<span className="brand-subtitle">familial</span>
          </span>
        </Link>
        <p className="sidebar-label">VOTRE QUOTIDIEN</p>
        <nav aria-label="Navigation principale">{navigation.map(navLink)}</nav>
        <button
          className="button primary sidebar-add"
          onClick={openQuickAdd}
          aria-haspopup="dialog"
        >
          <Icon name="plus" size={20} /> Ajouter
        </button>
        <div className="sidebar-note">
          <Icon name="leaf" size={25} />
          <p>
            Moins à organiser.
            <br />
            <strong>Plus à partager.</strong>
          </p>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          {account.user && (
            <Link className="return-calendar" to="/" aria-label="Retour au calendrier">
              ‹ Calendrier
            </Link>
          )}
          <Link to="/" className="mobile-brand">
            <span className="brand-mark">
              <Icon name="home" size={20} />
            </span>
            <span>Calendrier familial</span>
          </Link>
          <span className="desktop-context">Un peu de place pour l’essentiel.</span>
          <span className="preview-badge">{account.user ? 'En famille' : 'Bienvenue'}</span>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          <PwaStatus />
          {!calendarHome && <FamilyBar />}
          <Routes>
            {(['connexion', 'inscription', 'verification', 'recuperation'] as const).map((mode) => (
              <Route
                key={mode}
                path={'/auth/' + mode}
                element={<AuthPage key={mode} mode={mode} />}
              />
            ))}
            <Route
              path="/"
              element={account.user ? <CalendarPage key={familyKey} /> : <HomePage />}
            />
            <Route path="/calendrier" element={<CalendarPage key={familyKey} />} />
            <Route path="/taches" element={<ListsPage key={familyKey + 'tasks'} kind="task" />} />
            <Route
              path="/courses"
              element={<ListsPage key={familyKey + 'shopping'} kind="shopping" />}
            />
            <Route path="/garde" element={<CalendarPage key={familyKey + 'custody'} custody />} />
            <Route path="/foyer" element={<HouseholdPage key={account.user?.id} />} />
            <Route path="/profil" element={<ProfilePage />} />
            <Route path="/profil/notifications" element={<PushProofPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          <footer className="page-footer">Pensé pour les familles, à leur rythme.</footer>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Navigation mobile">
        {navigation
          .filter((item) => item.mobile)
          .map((item, index) => (
            <Fragment key={item.path}>
              {index === 2 && (
                <button
                  className="mobile-add"
                  onClick={openQuickAdd}
                  aria-haspopup="dialog"
                  aria-label="Ajouter"
                >
                  <Icon name="plus" size={26} />
                </button>
              )}
              <div className={`mobile-nav-slot slot-${index}`}>{navLink(item)}</div>
            </Fragment>
          ))}
      </nav>
      <QuickAddDialog open={quickOpen} onClose={() => setQuickOpen(false)} />
    </div>
  )
}
