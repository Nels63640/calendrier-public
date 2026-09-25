import { useFamily } from '../family/family-context'
import { useState, type FormEvent } from 'react'
import { useAccount } from '../auth/auth-context'
import { useAccountAction } from '../auth/useAccountAction'
import { supabase } from '../../data/supabase'
import { listHouseholds, rpc, type Snapshot } from '../family/family-api'
import { clearOffline } from '../family/offline'

export function PrivacySettings() {
  const family = useFamily()
  const account = useAccount(),
    action = useAccountAction()
  const [confirm, setConfirm] = useState('')
  async function exportData() {
    const spaces = await listHouseholds()
    const households = []
    for (const household of spaces)
      households.push({
        ...household,
        data: await rpc<Snapshot>('family_snapshot', { p_household: household.id }),
      })
    const payload = {
      format: 'family-calendar-v1',
      exportedAt: new Date().toISOString(),
      profile: account.profile,
      households,
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = 'calendrier-familial-export.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return 'L’export des données auxquelles vous avez accès a été téléchargé. Conservez-le dans un endroit privé.'
  }
  function erase(event: FormEvent) {
    event.preventDefault()
    void action.run(async () => {
      await rpc('erase_account', { p_confirmation: confirm })
      await clearOffline()
      await supabase?.auth.signOut({ scope: 'local' })
      setConfirm('')
      return 'Votre compte et les données que vous avez créées ont été supprimés.'
    })
  }
  return (
    <section className="settings-card">
      <h2>Vos données vous appartiennent</h2>
      <p>
        Nous utilisons votre adresse e-mail, votre profil et les informations que vous choisissez
        d’enregistrer pour organiser votre foyer. Aucun outil publicitaire ou analytique tiers n’est
        ajouté.
      </p>
      <p>
        Les profils et les données partagées sont stockés dans le projet Supabase de cet espace. Le
        navigateur conserve les jetons de session et une copie privée des derniers foyers consultés
        pendant 7 jours, avec au plus 100 modifications de tâches ou courses en attente. Une
        révocation de droits ne peut effacer un appareil qui reste déconnecté.
      </p>
      <button
        className="button"
        disabled={action.busy}
        onClick={() => {
          void action.run(async () => {
            await family.discardPending()
            await clearOffline()
            return 'Les copies et modifications en attente sur cet appareil ont été effacées.'
          })
        }}
      >
        Effacer le stockage hors connexion
      </button>
      {account.user && (
        <>
          <button
            className="button"
            disabled={action.busy}
            onClick={() => {
              void action.run(exportData)
            }}
          >
            Exporter mes données accessibles
          </button>
          <details>
            <summary>Supprimer mon compte</summary>
            <p>
              Cette action est définitive : votre profil, vos invitations personnelles, vos
              abonnements et les événements, tâches ou courses que vous avez créés seront supprimés,
              y compris dans les foyers partagés. Transférez ou supprimez d’abord les foyers dont
              vous êtes propriétaire. Un export permet de conserver une copie.
            </p>
            <form className="account-form" onSubmit={erase}>
              <label>
                Recopiez SUPPRIMER MON COMPTE
                <input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="off"
                />
              </label>
              <button
                className="button"
                disabled={action.busy || confirm !== 'SUPPRIMER MON COMPTE'}
              >
                Supprimer définitivement mon compte
              </button>
            </form>
          </details>
        </>
      )}
      <p role={action.failed ? 'alert' : 'status'}>{action.message}</p>
      <p className="muted">
        Avant une ouverture publique, l’exploitant doit renseigner son identité, son contact, la
        région d’hébergement et ses modalités de sauvegarde dans la politique de confidentialité.
      </p>
    </section>
  )
}
