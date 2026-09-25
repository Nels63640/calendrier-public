import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useAccount } from '../auth/auth-context'
import { useFamily } from './family-context'

export function FamilyBar() {
  const account = useAccount(),
    family = useFamily()
  if (!account.user) return null
  return (
    <section className="family-bar" aria-label="Foyer actif">
      {family.households.length > 0 && (
        <label>
          Votre foyer
          <select value={family.active} onChange={(event) => family.select(event.target.value)}>
            {family.households.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <Link className="text-link" to="/foyer">
        Gérer le foyer
      </Link>
      {family.loading && <span role="status">Actualisation…</span>}
      {family.offline && <span role="status">Hors connexion : dernières données consultées</span>}
      {family.error && (
        <div role="alert">
          {family.error}
          <button
            className="button"
            onClick={() => {
              void family.refresh()
            }}
          >
            Actualiser
          </button>
        </div>
      )}
      {family.pending > 0 && (
        <div className="pending-note" role="status">
          {family.pending} modification(s) en attente. Les éléments restent affichés dans leur
          dernier état confirmé.
          <button
            className="button"
            onClick={() => {
              void family.refresh()
            }}
          >
            Synchroniser
          </button>
          <details>
            <summary>Résoudre un conflit</summary>
            <p>
              Relisez les données actualisées. Vous pouvez abandonner les modifications en attente
              puis les saisir à nouveau.
            </p>
            <button
              className="button"
              onClick={() => {
                void family.discardPending()
              }}
            >
              Abandonner les modifications en attente
            </button>
          </details>
        </div>
      )}
    </section>
  )
}
export function FamilyGate({ children }: { children: ReactNode }) {
  const account = useAccount(),
    family = useFamily()
  if (!account.user)
    return (
      <section className="settings-card">
        <h2>Votre organisation, ensemble</h2>
        <p>Connectez-vous pour retrouver votre foyer et ses données.</p>
        <Link className="button primary" to="/auth/connexion">
          Se connecter
        </Link>
        <Link className="button" to="/">
          Retour à l’accueil
        </Link>
      </section>
    )
  if (!family.active)
    return (
      <section className="settings-card">
        <h2>Faisons une place à votre famille</h2>
        <p>Créez votre premier foyer ou rejoignez celui d’un proche avec son code d’invitation.</p>
        <Link className="button primary" to="/foyer">
          Créer ou rejoindre un foyer
        </Link>
      </section>
    )
  return children
}
