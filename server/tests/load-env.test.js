import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, it, expect } from '@jest/globals'

const serverDir = fileURLToPath(new URL('../', import.meta.url))

const read = (relativePath) => readFileSync(path.join(serverDir, relativePath), 'utf8')

// ESM hoists every `import` above ordinary statements, so a `loadDotenv()` call
// written below the imports runs only after the module's whole import graph has
// been evaluated. Any module-level constant derived from process.env therefore
// takes its default:
//
//   export const BUCKET_AUDIO = process.env.MINIO_BUCKET_AUDIO || 'meeting-audio'
//
// Nothing looks broken while the defaults happen to match .env, which is exactly
// what makes it worth pinning: the day one value differs, local development
// diverges from production for reasons that look impossible.
const ENTRYPOINTS = ['app.js', 'scripts/migrate.js', 'scripts/seed.js']

describe('environment loading order', () => {
  it.each(ENTRYPOINTS)('%s loads .env through an import, not a call', (entrypoint) => {
    const source = read(entrypoint)

    expect(source).toMatch(/^import '\.\.?\/(\.\.\/)?load-env\.js'$/m)
    expect(source).not.toContain('loadDotenv(')
  })

  it.each(ENTRYPOINTS)('%s imports load-env before anything local', (entrypoint) => {
    const source = read(entrypoint)
    const importLines = source
      .split('\n')
      .map((line, index) => ({ line: line.trim(), index }))
      .filter(({ line }) => line.startsWith('import '))

    const loadEnvAt = importLines.findIndex(({ line }) => line.includes('load-env.js'))
    const firstLocalAt = importLines.findIndex(
      ({ line }) => line.includes("from '.") && !line.includes('load-env.js')
    )

    expect(loadEnvAt).toBe(0)

    if (firstLocalAt !== -1) {
      expect(loadEnvAt).toBeLessThan(firstLocalAt)
    }
  })

  it('keeps load-env free of exports so nothing tempts a reorder', () => {
    const source = read('load-env.js')

    expect(source).toContain('loadDotenv(')
    expect(source).not.toMatch(/^export /m)
  })

  it('leaves the worker entrypoint deliberately different', () => {
    const source = read('worker.js')

    // systemd is the real environment for the worker, and the unit file's
    // Environment=NODE_ENV=production must not be overridable by a stale line in
    // .env. Its dynamic imports already run after the load, so hoisting does not
    // apply here.
    expect(source).toContain('loadDotenv(')
    expect(source).not.toContain('override: true')
    expect(source).toMatch(/await import\(/)
  })
})
