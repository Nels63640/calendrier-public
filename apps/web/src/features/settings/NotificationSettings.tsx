import { useEffect, useState } from 'react'
import { useAccount } from '../auth/auth-context'
import { useAccountAction } from '../auth/useAccountAction'
import { AccountError } from '../auth/auth-errors'
import { rpc } from '../family/family-api'

export function NotificationSettings() {
  const account = useAccount(),
    action = useAccountAction()
  const [enabled, setEnabled] = useState(false)
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
  const supported =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  useEffect(() => {
    if (supported)
      void navigator.serviceWorker
        .getRegistration()
        .then((r) => r?.pushManager.getSubscription())
        .then(async (s) =>
          setEnabled(
            Boolean(s) && (await rpc<boolean>('push_registered', { p_endpoint: s!.endpoint })),
          ),
        )
        .catch(() => {})
  }, [supported, account.user?.id])
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
    try {
      const json = subscription.toJSON()
      await rpc('register_push', {
        p_endpoint: subscription.endpoint,
        p_p256dh: json.keys?.p256dh,
        p_auth: json.keys?.auth,
      })
      setEnabled(true)
      return 'Les notifications sont activées sur cet appareil.'
    } catch (error) {
      if (!old) await subscription.unsubscribe()
      throw error
    }
  }
  async function disable() {
    const subscription = await (
      await navigator.serviceWorker.getRegistration()
    )?.pushManager.getSubscription()
    if (subscription) {
      await rpc('disable_push', { p_endpoint: subscription.endpoint })
      await subscription.unsubscribe()
    }
    setEnabled(false)
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
            disabled={action.busy}
            onClick={() => {
              void action.run(enabled ? disable : enable)
            }}
          >
            {enabled ? 'Désactiver sur cet appareil' : 'Activer sur cet appareil'}
          </button>
          <button
            className="button"
            disabled={action.busy}
            onClick={() => {
              void action.run(async () => {
                await rpc('disable_push', {})
                setEnabled(false)
                return 'Tous vos appareils ont été désinscrits.'
              })
            }}
          >
            Désactiver tous mes appareils
          </button>
        </div>
      )}
      <p role={action.failed ? 'alert' : 'status'}>{action.message}</p>
    </section>
  )
}
