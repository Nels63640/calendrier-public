import { expect, test } from '@playwright/test'
import { createECDH, randomBytes } from 'node:crypto'
import { createProofServer } from '../../scripts/push-proof/server'

test('le parcours d’essai rejoint le vrai serveur local via le proxy', async ({ page }) => {
  const key = createECDH('prime256v1')
  key.generateKeys()
  const accessToken = randomBytes(32).toString('base64url')
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/essai-simule',
    keys: {
      p256dh: key.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
  }
  let sends = 0
  const server = createProofServer(
    {
      publicKey: key.getPublicKey().toString('base64url'),
      accessToken,
      origin: 'http://127.0.0.1:4173',
    },
    async () => {
      sends++
    },
  )
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(4318, '127.0.0.1', resolve)
  })
  try {
    // API du téléphone simulée ; HTTP, contrôles d’accès, enregistrement et retrait réels.
    await page.addInitScript((value) => {
      Object.defineProperty(Notification, 'permission', { get: () => 'default' })
      Notification.requestPermission = async () => 'granted'
      let current: PushSubscription | null = null
      PushManager.prototype.getSubscription = async () => current
      PushManager.prototype.subscribe = async () => {
        current = {
          endpoint: value.endpoint,
          expirationTime: null,
          options: { applicationServerKey: null, userVisibleOnly: true },
          getKey: () => null,
          toJSON: () => value,
          unsubscribe: async () => {
            current = null
            return true
          },
        }
        return current
      }
    }, subscription)
    await page.goto('/profil/notifications')
    await page.getByLabel('Code d’essai privé').fill(accessToken)
    await page.getByRole('button', { name: 'Connecter l’outil d’essai' }).click()
    await page.getByRole('button', { name: 'Activer les notifications de test' }).click()
    await expect(page.getByRole('status')).toContainText('Cet appareil est prêt')
    await page.getByRole('button', { name: 'Envoyer une notification de test' }).click()
    await expect(page.getByRole('status')).toContainText('Le service push a accepté')
    expect(sends).toBe(1)
    await page.getByRole('button', { name: 'Désactiver cet abonnement' }).click()
    await expect(page.getByRole('status')).toContainText('est désactivé')
    await expect(
      page.getByRole('button', { name: 'Envoyer une notification de test' }),
    ).toBeDisabled()
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
