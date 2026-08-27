import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadDotenv } from 'dotenv'

/**
 * Loads `.env` as an import side effect.
 *
 * This exists because ESM hoists every `import` above ordinary statements. A
 * `loadDotenv()` call written below the imports in a module runs *after* that
 * module's entire import graph has already been evaluated, so any module-level
 * constant derived from `process.env` silently takes its default:
 *
 *   export const BUCKET_AUDIO = process.env.MINIO_BUCKET_AUDIO || 'meeting-audio'
 *
 * Importing this module first makes the load happen before the rest of the
 * graph, because ESM evaluates dependencies in the order their imports appear.
 * It must therefore stay the first import in any entrypoint that needs `.env`,
 * and it must have no other exports, so nothing tempts a reorder.
 *
 * `override: true` keeps `.env` authoritative for the API, which is what local
 * development expects. `server/worker.js` deliberately does the opposite: there
 * the real environment is systemd, and `Environment=NODE_ENV=production` in the
 * unit file must not be overridable by a stale line in `.env`.
 */
loadDotenv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'),
  override: true,
})
