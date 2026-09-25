import { useEffect, useState } from 'react'
import { useInstalled } from './browser-state'
import { usePwa } from './pwa-context'

interface InstallPrompt extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallationCard() {
  const installed = useInstalled()
  const { ready } = usePwa()
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null)
  const [message, setMessage] = useState('')
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setPrompt(event as InstallPrompt)
    }
    const onInstalled = () => {
      setPrompt(null)
      setMessage(
        'L’installation a été acceptée. Retrouvez l’application sur votre écran d’accueil.',
      )
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])
  const install = async () => {
    if (!prompt) return
    try {
      await prompt.prompt()
      const choice = await prompt.userChoice
      setMessage(
        choice.outcome === 'accepted'
          ? 'L’installation a été acceptée.'
          : 'Vous pourrez installer l’application plus tard.',
      )
    } catch {
      setMessage('Ouvrez le menu de votre navigateur pour installer l’application.')
    }
    setPrompt(null)
  }

  return (
    <section className="settings-card installation-card" aria-labelledby="installation-title">
      <h2 id="installation-title">Toujours à portée de main</h2>
      <p className="muted">
        Retrouvez le calendrier familial directement sur votre écran d’accueil.
      </p>
      {installed ? (
        <p className="pill">Ouverte comme une application</p>
      ) : (
        <>
          {prompt && (
            <button className="button primary" onClick={() => void install()}>
              Installer l’application
            </button>
          )}
          <details>
            <summary>Comment installer l’application ?</summary>
            <ol>
              <li>Sur iPhone ou iPad, ouvrez cette adresse dans Safari.</li>
              <li>
                Ouvrez le menu de partage, puis choisissez « Sur l’écran d’accueil » (ou « Ajouter à
                l’écran d’accueil »).
              </li>
              <li>Validez l’ajout, puis ouvrez l’application depuis son icône.</li>
            </ol>
            <p>
              Sur Android ou ordinateur, cherchez « Installer l’application » dans le menu du
              navigateur si le bouton d’installation n’apparaît pas.
            </p>
          </details>
        </>
      )}
      {message && <p role="status">{message}</p>}
      <p className="muted pwa-caption">
        {ready
          ? 'L’interface est prête à être consultée hors connexion. Les derniers foyers consultés sont disponibles selon le cache de cet appareil.'
          : 'Le mode hors connexion sera préparé lors de l’ouverture de la version installable avec une connexion.'}
      </p>
    </section>
  )
}
