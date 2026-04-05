import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const outfile = resolve(projectRoot, 'release/app/server/railway-web-server.mjs')

await mkdir(dirname(outfile), { recursive: true })

await build({
  entryPoints: [resolve(projectRoot, 'backend/server/railway-web-server.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: false,
  minify: false,
  tsconfig: resolve(projectRoot, 'tsconfig.json'),
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
})
