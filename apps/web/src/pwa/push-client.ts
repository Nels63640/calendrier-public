export interface PushConfig {
  publicKey: string
}

export async function proofRequest<T>(path: string, token: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/push-proof/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
    redirect: 'error',
  })
  if (response.status === 401 || response.status === 403)
    throw new Error('Le code d’essai est incorrect ou cette adresse n’est pas autorisée.')
  if (response.status === 429) throw new Error('Patientez un instant avant de recommencer.')
  if (response.status === 410)
    throw new Error('Cet abonnement a expiré. Désactivez-le, puis activez un nouvel essai.')
  if (response.status === 404)
    throw new Error(
      'Le serveur d’essai est indisponible ou a redémarré. Reconnectez l’outil puis réactivez cet appareil.',
    )
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
    throw new Error('Le serveur d’essai ne répond pas. Vérifiez son démarrage et votre connexion.')
  return response.json() as Promise<T>
}

export function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
}

export function pushSupport() {
  if (!window.isSecureContext) return 'Une adresse HTTPS est nécessaire sur votre téléphone.'
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return 'Les notifications ne sont pas disponibles dans cette fenêtre. Sur iPhone/iPad compatible (16.4 ou ultérieur), installez l’application et ouvrez-la depuis l’écran d’accueil.'
  }
  if (Notification.permission === 'denied')
    return 'Les notifications sont refusées. Vous pouvez modifier ce choix dans les réglages de votre navigateur ou de votre appareil.'
  return ''
}
