import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { PageHeading } from '../../components/PageHeading'
import { usePwa } from '../../pwa/pwa-context'
import { useOnline } from '../../pwa/browser-state'
import {
  applicationServerKey,
  proofRequest,
  pushSupport,
  type PushConfig,
} from '../../pwa/push-client'

export function PushProofPage() {
  const { ready } = usePwa()
  const online = useOnline()
  const [code, setCode] = useState('')
  const [token, setToken] = useState('')
  const [config, setConfig] = useState<PushConfig | null>(null)
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [subscriptionId, setSubscriptionId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const supportIssue = pushSupport()

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    let disposed = false
    void navigator.serviceWorker
      .getRegistration()
      .then(async (registration) => {
        const existing = await registration?.pushManager.getSubscription()
        if (!disposed) setSubscription(existing ?? null)
      })
      .catch(() => {})
    return () => {
      disposed = true
    }
  }, [ready])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await action()
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'L’essai n’a pas abouti. Vous pouvez réessayer.',
      )
    } finally {
      setBusy(false)
    }
  }

  const connect = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const result = await proofRequest<PushConfig>('session', code.trim(), {})
      if (!result.publicKey) throw new Error('La configuration de l’essai est incomplète.')
      setConfig(result)
      setToken(code.trim())
      setCode('')
      setSubscriptionId('')
      setMessage(
        'L’outil d’essai est connecté. Vous pouvez maintenant autoriser les notifications.',
      )
    })
  }

  const activate = () => {
    if (!config) return
    // La demande part directement du clic, avant tout aller-retour serveur (nécessaire sur iOS).
    const permission = Notification.requestPermission()
    void run(async () => {
      if ((await permission) !== 'granted')
        throw new Error('Vous n’avez pas autorisé les notifications. Aucun message ne sera envoyé.')
      const registration = await navigator.serviceWorker.ready
      let current = await registration.pushManager.getSubscription()
      const created = !current
      if (!current)
        current = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(config.publicKey),
        })
      try {
        const result = await proofRequest<{ id: string }>('subscribe', token, current.toJSON())
        setSubscription(current)
        setSubscriptionId(result.id)
        setMessage('Cet appareil est prêt pour un envoi de test.')
      } catch (failure) {
        if (created) await current.unsubscribe().catch(() => {})
        throw failure
      }
    })
  }

  const send = () =>
    void run(async () => {
      await proofRequest('send', token, { id: subscriptionId })
      setMessage(
        'Le service push a accepté le message. Vérifiez sa réception sur cet appareil ; l’envoi ne garantit pas son affichage.',
      )
    })

  const deactivate = () =>
    void run(async () => {
      if (subscription && !(await subscription.unsubscribe()))
        throw new Error(
          'L’abonnement n’a pas pu être désactivé. Réessayez avec une connexion stable.',
        )
      setSubscription(null)
      if (subscriptionId && token) {
        try {
          await proofRequest('unsubscribe', token, { id: subscriptionId })
        } catch {
          setMessage(
            'Notifications désactivées sur cet appareil. La copie temporaire du serveur expirera automatiquement.',
          )
          setSubscriptionId('')
          return
        }
      }
      setSubscriptionId('')
      setMessage('L’abonnement de test de cet appareil est désactivé.')
    })

  return (
    <>
      <PageHeading eyebrow="ESSAI SUR CET APPAREIL" title="Tester les notifications">
        Une vérification ponctuelle avant l’arrivée des rappels familiaux.
      </PageHeading>
      <section className="settings-card push-proof-card" aria-labelledby="proof-title">
        <h2 id="proof-title">Recevoir un message de test</h2>
        <p className="muted">
          Cet outil utilise un serveur d’essai privé. Aucun événement ni renseignement familial
          n’est envoyé. Le code d’essai reste uniquement dans cette page et s’efface en la quittant.
        </p>
        {supportIssue && (
          <p className="status-notice" role="status">
            {supportIssue}
          </p>
        )}
        {!ready && (
          <p className="status-notice">
            Ouvrez la version installable et attendez la préparation du mode hors connexion avant
            d’activer les notifications.
          </p>
        )}
        {!config ? (
          <form onSubmit={connect} className="proof-form">
            <label htmlFor="proof-code">Code d’essai privé</label>
            <input
              id="proof-code"
              type="password"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              required
              minLength={32}
              maxLength={128}
              aria-describedby="proof-help"
            />
            <p id="proof-help" className="muted">
              Le code est fourni lors de la préparation locale de l’essai. Il ne s’agit pas d’un mot
              de passe de compte.
            </p>
            <button className="button primary" disabled={busy || !online}>
              Connecter l’outil d’essai
            </button>
          </form>
        ) : (
          <div className="proof-actions">
            <button
              className="button primary"
              disabled={
                busy || !online || !ready || Boolean(supportIssue) || Boolean(subscriptionId)
              }
              onClick={activate}
            >
              Activer les notifications de test
            </button>
            <button
              className="button secondary"
              disabled={busy || !online || !subscriptionId}
              onClick={send}
            >
              Envoyer une notification de test
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setConfig(null)
                setToken('')
                setSubscriptionId('')
                setMessage('')
                setError('')
              }}
            >
              Reconnecter l’outil d’essai
            </button>
          </div>
        )}
        {subscription && (
          <button className="button secondary" disabled={busy || !online} onClick={deactivate}>
            Désactiver cet abonnement
          </button>
        )}
        {busy && <p role="status">Vérification en cours…</p>}
        {message && (
          <p role="status" className="proof-result">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="status-notice">
            {error}
          </p>
        )}
        <details>
          <summary>Ce que cet essai vérifie</summary>
          <p>
            Autorisation, abonnement de cet appareil, envoi Web Push et ouverture de cette page au
            toucher. Le serveur garde l’abonnement en mémoire pendant une heure au maximum, puis
            l’oublie. Un redémarrage l’efface aussi.
          </p>
          <p>
            Sur iPhone/iPad 16.4 ou ultérieur, utilisez l’application ajoutée à l’écran d’accueil.
            Une adresse HTTPS et une connexion sont nécessaires. Les modes de concentration peuvent
            retarder ou masquer l’alerte.
          </p>
        </details>
      </section>
      <Link className="text-link" to="/profil">
        Retour au profil
      </Link>
    </>
  )
}
