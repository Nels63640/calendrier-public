import { mkdir, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import webpush from 'web-push'

const directory = new URL('../../.local/', import.meta.url)
await mkdir(directory, { recursive: true })
const keys = webpush.generateVAPIDKeys()
try {
  await writeFile(
    new URL('push-proof.json', directory),
    JSON.stringify(
      {
        ...keys,
        accessToken: randomBytes(32).toString('base64url'),
        origin: 'http://127.0.0.1:4173',
        subject: '',
      },
      null,
      2,
    ),
    { flag: 'wx', mode: 0o600 },
  )
  console.log(
    'Configuration créée dans .local/push-proof.json. Renseignez subject avec mailto:votre-adresse. Le champ accessToken est le code privé à saisir dans l’outil d’essai. Ne partagez pas ce fichier.',
  )
} catch (failure) {
  if (failure && typeof failure === 'object' && 'code' in failure && failure.code === 'EEXIST')
    console.log('La configuration existe déjà ; elle a été conservée.')
  else throw new Error('Impossible de créer la configuration locale.', { cause: failure })
}
