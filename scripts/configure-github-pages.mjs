import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

// Accès via le gestionnaire Git déjà connecté. Aucun jeton écrit dans le projet ou les logs.
const repository = 'Nels63640/calendrier-public'
const credential = spawnSync('git', ['-c', 'credential.interactive=false', 'credential', 'fill'], {
  input: `protocol=https\nhost=github.com\npath=${repository}.git\n\n`,
  encoding: 'utf8',
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
})
if (credential.status !== 0) throw new Error('Connecter Git à GitHub avant cette configuration.')
const fields = Object.fromEntries(
  credential.stdout
    .trim()
    .split('\n')
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i), line.slice(i + 1)]
    }),
)
const headers = {
  Authorization: 'Bearer ' + fields.password,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
}
async function api(path, method = 'GET', body) {
  const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok && response.status !== 404)
    throw new Error(`GitHub ${method} ${path} : HTTP ${response.status}`)
  return response
}
const source = await readFile(new URL('../apps/web/.env.local', import.meta.url), 'utf8')
const env = Object.fromEntries(
  source
    .split(/\r?\n/)
    .filter((line) => line.startsWith('VITE_'))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i), line.slice(i + 1).trim()]
    }),
)
for (const name of [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_VAPID_PUBLIC_KEY',
]) {
  if (!env[name]) continue
  const existing = await api('actions/variables/' + name)
  const response = await api(
    existing.status === 404 ? 'actions/variables' : 'actions/variables/' + name,
    existing.status === 404 ? 'POST' : 'PATCH',
    { name, value: env[name] },
  )
  if (!response.ok) throw new Error('Impossible de configurer la variable publique ' + name)
  console.log('Variable publique configurée : ' + name)
}
const pages = await api('pages')
const configured = await api('pages', pages.status === 404 ? 'POST' : 'PUT', {
  build_type: 'workflow',
})
if (!configured.ok)
  throw new Error('Activer GitHub Pages avec GitHub Actions dans les réglages du dépôt.')
console.log('GitHub Pages configuré pour le workflow de déploiement.')
