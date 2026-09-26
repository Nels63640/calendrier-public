import { queuePush, pendingPush, cancelPendingPush, settlePendingPush } from './pending-push'
import { recoverPush } from './usePushRecovery'
import { useEffect, useState } from 'react'
import { useAccount } from '../auth/auth-context'
import { useAccountAction } from '../auth/useAccountAction'
import { AccountError } from '../auth/auth-errors'
import { rpc } from '../family/family-api'

export function NotificationSettings() {
  const account = useAccount(),
    action = useAccountAction()
  const [enabled, setEnabled] = useState(false)
  const [verification, setVerification] = useState<'checking' | 'verified' | 'unavailable'>(
    'checking',
  )
  const [queued, setQueued] = useState(false)
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
  const supported =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  useEffect(() => {
    let active = true
    let version = 0
    const userId = account.user?.id
    const check = async () => {
      if (!supported || !userId) return
      const request = ++version
      try {
        const registration = await navigator.serviceWorker.getRegistration()
        const subscription = await registration?.pushManager.getSubscription()
        const registered =
          Boolean(subscription) &&
          (await rpc<boolean>('push_registered', { p_endpoint: subscription!.endpoint }))
        if (active && request === version) {
          setEnabled(registered && Notification.permission === 'granted')
          setVerification('verified')
          setQueued(pendingPush()?.userId === userId)
        }
      } catch {
        if (active && request === version) {
          setVerification('unavailable')
          setQueued(pendingPush()?.userId === userId)
        }
      }
    }
    const refresh = () => {
      void check()
    }
    const visible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    refresh()
    window.addEventListener('online', refresh)
    window.addEventListener('family-push-status', refresh)
    document.addEventListener('visibilitychange', visible)
    return () => {
      active = false
      window.removeEventListener('online', refresh)
      window.removeEventListener('family-push-status', refresh)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [supported, account.user?.id, account.recovering])
  async function enable() {
    if (!key)
      throw new AccountError('Les notifications ne sont pas encore raccordées à cet espace.')
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration?.active)
      throw new AccountError('Préparez l’installation de l’application, puis réessayez.')
    const permission = await Notification.requestPermission()
    if (permission !== 'granted')
      throw new AccountError(
        'La permission n’a pas été accordée. Vous pouvez la modifier dans les réglages du navigateur.',
      )
    const bytes = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
      c.charCodeAt(0),
    )
    const old = await registration.pushManager.getSubscription()
    const subscription =
      old ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytes,
      }))
    queuePush(account.user!.id, subscription.endpoint)
    setQueued(true)
    try {
      await recoverPush(account.user!.id)
      if (pendingPush()?.userId === account.user!.id)
        return 'Autorisation conservée. L’activation reprendra automatiquement avec la connexion.'
      setEnabled(true)
      setVerification('verified')
      setQueued(false)
      return 'Les notifications sont activées sur cet appareil.'
    } catch {
      // Le serveur peut avoir enregistré l'abonnement avant une coupure de la réponse.
      // Ne jamais détruire l'abonnement du téléphone sur une erreur réseau.
      return 'Autorisation conservée. L’activation reprendra automatiquement avec la connexion.'
    }
  }
  async function disable() {
    cancelPendingPush()
    await settlePendingPush()
    const subscription = await (
      await navigator.serviceWorker.getRegistration()
    )?.pushManager.getSubscription()
    if (subscription) {
      await rpc('disable_push', { p_endpoint: subscription.endpoint })
      await subscription.unsubscribe()
    }
    setEnabled(false)
    setQueued(false)
    setVerification('verified')
    return 'Les notifications sont désactivées sur cet appareil.'
  }
  if (!account.user) return null
  return (
    <section className="settings-card">
      <h2>Vos notifications</h2>
      <p>
        Sur iPhone, ajoutez l’application à l’écran d’accueil, puis ouvrez-la depuis son icône pour
        autoriser les notifications.
      </p>
      <p>Recevez les ajouts et modifications des autres membres du foyer, ainsi que vos rappels.</p>
      <p>
        Les alertes commencent après l’activation sur cet appareil. Les événements créés auparavant
        ne sont pas renvoyés.
      </p>
      <p className="muted">
        Les alertes affichent le titre, la date et l’heure de l’événement, y compris sur l’écran
        verrouillé. La réception dépend de l’appareil et du réseau ; elle n’est pas garantie à la
        seconde.
      </p>
      {!supported ? (
        <p>Les notifications ne sont pas disponibles dans ce navigateur.</p>
      ) : !key ? (
        <p>Les notifications attendent encore leur raccordement serveur.</p>
      ) : (
        <div className="row-actions">
          <button
            className="button primary"
            disabled={action.busy || verification === 'checking'}
            onClick={() => {
              void action.run(verification === 'verified' && enabled ? disable : enable)
            }}
          >
            {verification === 'checking'
              ? 'Vérification…'
              : verification === 'unavailable'
                ? 'Vérifier l’activation'
                : enabled
                  ? 'Désactiver sur cet appareil'
                  : 'Activer sur cet appareil'}
          </button>
          <button
            className="button"
            disabled={action.busy}
            onClick={() => {
              void action.run(async () => {
                cancelPendingPush()
                await settlePendingPush()
                await rpc('disable_push', {})
                setEnabled(false)
                setQueued(false)
                setVerification('verified')
                return 'Tous vos appareils ont été désinscrits.'
              })
            }}
          >
            Désactiver tous mes appareils
          </button>
        </div>
      )}
      {verification === 'unavailable' && (
        <p role="status">
          Vérification temporairement indisponible. Vos notifications ne sont pas désactivées par
          cette erreur.
        </p>
      )}
      {queued && (
        <p role="status">Activation en attente du réseau. Votre autorisation est conservée.</p>
      )}
      <p>
        Vos notifications restent inscrites pendant une coupure réseau ou la reprise de votre
        session.
      </p>
      <p role={action.failed ? 'alert' : 'status'}>{action.message}</p>
    </section>
  )
}
