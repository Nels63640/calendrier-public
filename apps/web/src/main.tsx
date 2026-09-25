import { FamilySession } from './features/family/FamilySession'
import './styles/family.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppRouter } from './app/AppRouter'
import { AuthProvider } from './features/auth/AuthProvider'
import './styles/account.css'
import { App } from './app/App'
import { PwaProvider } from './pwa/PwaProvider'
import './styles/pwa.css'
import './styles/theme.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/calendar-native.css'
import './styles/interface.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PwaProvider>
      <AppRouter>
        <AuthProvider>
          <FamilySession>
            <App />
          </FamilySession>
        </AuthProvider>
      </AppRouter>
    </PwaProvider>
  </StrictMode>,
)
