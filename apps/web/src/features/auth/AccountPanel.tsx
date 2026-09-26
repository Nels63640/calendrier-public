import { cancelPendingPush, settlePendingPush } from '../settings/pending-push'
import { clearOffline } from '../family/offline'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/Icon'
import { supabase, sessionStorage } from '../../data/supabase'
import { useAccount, authStore } from './auth-context'
import { accountApi } from './account-api'
import { AccountError } from './auth-errors'
import type { Profile } from './auth-validation'
import { useAccountAction } from './useAccountAction'

function ProfileEditor({ profile }: { profile: Profile }) {
  const action = useAccountAction()
  const [avatar, setAvatar] = useState(profile.avatar)
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void action.run(async () => {
      const saved = await accountApi.saveProfile(profile.id, Object.fromEntries(data))
      authStore.updateProfile(saved)
      return 'Votre profil a été enregistré.'
    })
  }
  return (
    <form className="account-form" onSubmit={save} aria-busy={action.busy}>
      <fieldset disabled={action.busy}>
        <span className="profile-avatar" aria-hidden="true">
          <Icon name={avatar} size={28} />
        </span>
        <label>
          Prénom
          <input
            name="first_name"
            defaultValue={profile.first_name}
            required
            maxLength={60}
            autoComplete="given-name"
          />
        </label>
        <label>
          Avatar
          <select
            name="avatar"
            value={avatar}
            onChange={(event) => setAvatar(event.target.value as Profile['avatar'])}
          >
            <option value="profile">Silhouette</option>
            <option value="sun">Soleil</option>
            <option value="leaf">Feuille</option>
            <option value="home">Maison</option>
          </select>
        </label>
        <label>
          Fuseau horaire
          <input
            name="time_zone"
            defaultValue={profile.time_zone}
            required
            maxLength={100}
            list="time-zones"
            aria-describedby="zone-help"
          />
        </label>
        <datalist id="time-zones">
          {[
            'Europe/Paris',
            'Europe/Warsaw',
            'Europe/Brussels',
            'Europe/Zurich',
            'America/Montreal',
            'Indian/Reunion',
            'UTC',
          ].map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
        <p id="zone-help" className="muted">
          Un nom de zone, par exemple Europe/Paris. Votre choix est conservé même en déplacement.
        </p>
        <button className="button primary" type="submit">
          {action.busy ? 'Enregistrement…' : 'Enregistrer mon profil'}
        </button>
      </fieldset>
      <p role={action.failed ? 'alert' : 'status'} className="account-feedback">
        {action.message}
      </p>
    </form>
  )
}

export function AccountPanel() {
  const account = useAccount()
  const action = useAccountAction()
  async function logout() {
    if (!supabase) return
    cancelPendingPush()
    await settlePendingPush()
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      const subscription = await (
        await navigator.serviceWorker.getRegistration()
      )?.pushManager.getSubscription()
      if (subscription) {
        await Promise.resolve(
          supabase.rpc('disable_push', { p_endpoint: subscription.endpoint }),
        ).catch(() => {})
        await subscription.unsubscribe().catch(() => false)
      }
    }
    await clearOffline().catch(() => {})
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    await authStore.retry()
    if (error)
      throw new AccountError(
        'La révocation de la session n’a pas pu être confirmée. Réessayez avec une connexion réseau.',
      )
    return 'Vous êtes déconnecté de cet appareil.'
  }
  return (
    <section className="settings-card account-card" aria-labelledby="account-title">
      <h2 id="account-title">{account.user ? 'Votre compte' : 'Bienvenue chez vous'}</h2>
      {account.status === 'unavailable' && (
        <p>Les comptes ne sont pas encore activés dans cet espace.</p>
      )}
      {account.status === 'loading' && <p role="status">Ouverture de votre espace…</p>}
      {(account.status === 'unavailable' || account.status === 'signed-out') && (
        <div className="account-links">
          <Link className="button primary" to="/auth/connexion">
            Se connecter
          </Link>
          <Link to="/auth/inscription">Créer un compte</Link>
        </div>
      )}
      {account.status === 'error' && (
        <p role="alert">
          Impossible de vérifier votre session. Vérifiez votre connexion puis réessayez.
        </p>
      )}
      {account.recovering && account.user && (
        <p role="status">Connexion en cours de rétablissement. Votre compte est conservé.</p>
      )}
      {account.user && <p className="account-email">{account.user.email}</p>}
      {account.profile && (
        <details className="profile-edit">
          <summary>Modifier mon profil</summary>
          <ProfileEditor key={account.profile.id} profile={account.profile} />
        </details>
      )}
      {account.user && !account.profile && !account.profileError && (
        <p role="status">Chargement du profil…</p>
      )}
      {account.profileError && <p role="alert">Votre profil n’a pas pu être chargé.</p>}
      {(account.profileError || account.status === 'error') && (
        <button
          className="button"
          disabled={action.busy}
          onClick={() => {
            void action.run(() => authStore.retry())
          }}
        >
          Réessayer
        </button>
      )}
      {(account.user || account.status === 'error') && (
        <button
          className="button"
          disabled={action.busy}
          onClick={() => {
            void action.run(logout)
          }}
        >
          Se déconnecter
        </button>
      )}
      {!sessionStorage.persistent && (
        <p>Le stockage est indisponible : la session sera oubliée à la fermeture de cette page.</p>
      )}
      <p role={action.failed ? 'alert' : 'status'} className="account-feedback">
        {action.message}
      </p>
    </section>
  )
}
