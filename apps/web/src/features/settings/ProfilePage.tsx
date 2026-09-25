import { NotificationSettings } from './NotificationSettings'
import { PrivacySettings } from './PrivacySettings'
import { AccountPanel } from '../auth/AccountPanel'
import { Link } from 'react-router'
import { InstallationCard } from '../../pwa/InstallationCard'
import { PageHeading } from '../../components/PageHeading'

export function ProfilePage() {
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
      <details className="page-fold">
        <summary>Installer l’application</summary>
        <InstallationCard />
      </details>
      <details className="page-fold">
        <summary>Notifications</summary>
        <NotificationSettings />
      </details>
      <details className="page-fold">
        <summary>Données et confidentialité</summary>
        <PrivacySettings />
      </details>
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
