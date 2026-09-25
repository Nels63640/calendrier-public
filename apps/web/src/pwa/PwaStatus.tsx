import { useOnline } from './browser-state'
import { usePwa } from './pwa-context'

export function PwaStatus() {
  const online = useOnline()
  const { updateAvailable, applyUpdate, error } = usePwa()
  return (
    <div className="pwa-status">
      {!online && (
        <p className="status-notice" role="status">
          Vous êtes hors connexion. L’interface déjà téléchargée reste accessible. Les essais de
          notifications nécessitent une connexion.
        </p>
      )}
      {error && (
        <p className="status-notice" role="status">
          {error}
        </p>
      )}
      {updateAvailable && (
        <section className="update-notice" aria-label="Mise à jour disponible">
          <div>
            <strong>Une nouvelle version est disponible</strong>
            <p>Terminez vos actions avant de recharger l’application.</p>
          </div>
          <button className="button primary" onClick={applyUpdate}>
            Mettre à jour
          </button>
        </section>
      )}
    </div>
  )
}
