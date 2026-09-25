import { readdir, readFile, writeFile } from 'node:fs/promises'
const directory = new URL('../supabase/migrations/', import.meta.url)
const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()
const chunks = await Promise.all(
  files.map(
    async (name) => `-- Migration : ${name}\n${await readFile(new URL(name, directory), 'utf8')}`,
  ),
)
await writeFile(
  new URL('../supabase/INSTALL.sql', import.meta.url),
  `-- FICHIER GÉNÉRÉ : node scripts/bundle-database.mjs\n-- Installation initiale seulement, dans un projet dédié vide.\n-- Les migrations individuelles restent la source de référence.\n-- Les e-mails et la planification sont configurés séparément.\n\n${chunks.join('\n\n')}\n`,
)
console.log('supabase/INSTALL.sql généré sans identifiants ni secrets.')
