import { NotificationSettings } from './NotificationSettings'
import { PrivacySettings } from './PrivacySettings'
import { AccountPanel } from '../auth/AccountPanel'
import { Link } from 'react-router'
import { InstallationCard } from '../../pwa/InstallationCard'
import { Icon, type IconName } from '../../components/Icon'
import { PageHeading } from '../../components/PageHeading'
import { useTheme, type ThemePreference } from '../../app/theme/theme-context'

const themes: { value: ThemePreference; label: string; detail: string; icon: IconName }[] = [
  { value: 'system', label: 'Automatique', detail: 'Comme votre appareil', icon: 'monitor' },
  { value: 'light', label: 'Clair', detail: 'Un peu de lumière', icon: 'sun' },
  { value: 'dark', label: 'Sombre', detail: 'Tout en douceur', icon: 'moon' },
]

export function ProfilePage() {
  const { preference, setPreference } = useTheme()
  return (
    <>
      <PageHeading eyebrow="UN ESPACE À VOTRE IMAGE" title="Votre profil">
        Les petites préférences qui font la différence.
      </PageHeading>
      <AccountPanel />
      <section className="settings-card">
        <h2>Votre famille</h2>
        <Link className="text-link" to="/foyer">
          Créer, rejoindre ou gérer un foyer
        </Link>
      </section>
      <section className="settings-card">
        <fieldset className="theme-fieldset">
          <legend>Apparence</legend>
          <p id="theme-help" className="muted">
            Choisissez l’ambiance qui vous convient. Votre préférence est conservée sur cet appareil
            lorsque le stockage est disponible.
          </p>
          <div className="theme-options">
            {themes.map((theme) => (
              <label className="theme-option" key={theme.value}>
                <input
                  type="radio"
                  name="theme"
                  value={theme.value}
                  checked={preference === theme.value}
                  onChange={() => setPreference(theme.value)}
                  aria-describedby="theme-help"
                />
                <Icon name={theme.icon} size={27} />
                <strong>{theme.label}</strong>
                <span>{theme.detail}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>
      <InstallationCard />
      <NotificationSettings />
      <PrivacySettings />
      {import.meta.env.VITE_ROUTING !== 'hash' && (
        <section className="settings-card notification-card" aria-labelledby="notifications-title">
          <h2 id="notifications-title">Les notifications</h2>
          <p className="muted">
            Diagnostic de développement : cet outil nécessite le serveur local de test des
            notifications.
          </p>
          <Link className="text-link" to="/profil/notifications">
            Tester les notifications
          </Link>
        </section>
      )}
    </>
  )
}
