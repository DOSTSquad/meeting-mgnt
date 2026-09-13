import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadDotenv } from 'dotenv'

// Do not override: systemd injects NODE_ENV=production and the real environment
// must win over .env, otherwise the production fixture-provider guard in
// worker-runtime.js can be silently disabled by a stale NODE_ENV in .env.
const loaded = loadDotenv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'),
})

// Because .env does not override, a variable already exported in the developer's
// shell silently wins. A stray DATABASE_URL from another project sends the worker
// at the wrong database and the only symptom is an authentication failure from
// the outbox dispatcher, with nothing pointing at the cause.
const SHADOW_SENSITIVE = ['DATABASE_URL', 'REDIS_URL', 'MINIO_ENDPOINT']
const shadowed = SHADOW_SENSITIVE.filter(
  (key) => key in (loaded.parsed ?? {}) && process.env[key] !== loaded.parsed[key]
)

if (shadowed.length > 0) {
  console.warn(
    `Environment overrides .env for: ${shadowed.join(', ')}. ` +
      'That is correct under systemd, but in local development it usually means a ' +
      'variable exported by your shell. Prefix the command with ' +
      `\`env ${shadowed.map((key) => `-u ${key}`).join(' ')}\` to use .env instead.`
  )
}

const { createWorkerRuntime } = await import('./worker-runtime.js')
const { createAiResultConsumerService } = await import('./services/ai-result-consumer.js')

// Queue consumers are registered here, never from the Express entrypoint.
// Order matters only for shutdown, which stops them in reverse.
const workerRuntime = createWorkerRuntime({
  services: [createAiResultConsumerService()],
})

try {
  const started = workerRuntime.start()

  if (!started) {
    await workerRuntime.stop()
    process.exit(0)
  }
} catch (error) {
  console.error('Worker runtime failed to start', { message: error.message })
  await workerRuntime.stop()
  process.exit(1)
}

const shutdown = async () => {
  await workerRuntime.stop()
  process.exit(0)
}

process.once('SIGINT', () => {
  void shutdown()
})
process.once('SIGTERM', () => {
  void shutdown()
})
