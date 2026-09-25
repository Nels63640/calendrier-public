import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Sert le vrai build sans modifier dist ; permet une coupure réseau et une révision de SW. */
export async function appServer() {
  const directory = fileURLToPath(new URL('../../apps/web/dist-test/', import.meta.url))
  let revision = 0
  let stopped = false
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webmanifest': 'application/manifest+json',
  }
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
      if (pathname.startsWith('/api/')) {
        response.writeHead(404).end()
        return
      }
      const relative = extname(pathname) ? pathname : '/index.html'
      const path = resolve(directory, '.' + relative)
      if (!path.startsWith(resolve(directory) + sep)) {
        response.writeHead(403).end()
        return
      }
      let body = await readFile(path)
      if (relative === '/sw.js')
        body = Buffer.concat([body, Buffer.from(`\n// Test revision ${revision}\n`)])
      response.writeHead(200, {
        'Content-Type': types[extname(path)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      response.end(body)
    } catch {
      response.writeHead(404).end()
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Adresse de test absente')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    nextRevision: () => {
      revision++
    },
    stop: async () => {
      if (stopped) return
      stopped = true
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
