import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import webpush from 'web-push'
const directory = new URL('../.local/', import.meta.url)
await mkdir(directory, { recursive: true })
const target = new URL('production-push.json', directory)
let config
try {
  config = JSON.parse(await readFile(target, 'utf8'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  const keys = webpush.generateVAPIDKeys()
  config = {
    VAPID_PUBLIC_KEY: keys.publicKey,
    VAPID_PRIVATE_KEY: keys.privateKey,
    VAPID_SUBJECT: 'https://nels63640.github.io/calendrier-public/',
    REMINDER_CRON_SECRET: randomBytes(32).toString('base64url'),
  }
  await writeFile(target, JSON.stringify(config, null, 2), { mode: 0o600, flag: 'wx' })
}
await writeFile(
  new URL('production-push.env', directory),
  Object.entries(config)
    .map(([key, value]) => key + '=' + value)
    .join('\n') + '\n',
  { mode: 0o600 },
)
console.log(
  'Configuration créée ou conservée dans .local/production-push.env (exclue de Git). Aucune clé affichée.',
)
