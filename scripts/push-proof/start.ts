import { readFile } from 'node:fs/promises'
import webpush from 'web-push'
import { createProofServer } from './server.ts'

try {
  const config = JSON.parse(
    await readFile(new URL('../../.local/push-proof.json', import.meta.url), 'utf8'),
  ) as {
    publicKey: string
    privateKey: string
    accessToken: string
    origin: string
    subject: string
  }
  if (!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.subject)) throw new Error('Contact manquant')
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey)
  const server = createProofServer(config, (subscription, payload) =>
    webpush.sendNotification(subscription, payload, {
      TTL: 60,
      timeout: 10_000,
      urgency: 'normal',
    }),
  )
  server.listen(4318, '127.0.0.1', () =>
    console.log(
      'Serveur d’essai démarré en local. Ouvrez la version compilée sur http://127.0.0.1:4173/profil/notifications.',
    ),
  )
  server.on('error', () => {
    console.error('Le serveur d’essai ne peut pas démarrer. Vérifiez que le port 4318 est libre.')
    process.exitCode = 1
    server.close()
  })
} catch {
  console.error(
    'Configuration absente ou invalide. Exécutez npm run push:setup puis renseignez le contact mailto dans .local/push-proof.json. Aucun secret n’est affiché.',
  )
  process.exitCode = 1
}
