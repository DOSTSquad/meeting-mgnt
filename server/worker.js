import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadDotenv } from 'dotenv'

// Do not override: systemd injects NODE_ENV=production and the real environment
// must win over .env, otherwise the production fixture-provider guard in
// worker-runtime.js can be silently disabled by a stale NODE_ENV in .env.
loadDotenv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'),
})

const { createWorkerRuntime } = await import('./worker-runtime.js')
const { createTranscriptionWorker } = await import('./services/transcription-worker.js')
const { createAnalysisWorker } = await import('./services/analysis-worker.js')

// Queue consumers are registered here, never from the Express entrypoint.
// Order matters only for shutdown, which stops them in reverse.
const workerRuntime = createWorkerRuntime({
  services: [createTranscriptionWorker(), createAnalysisWorker()],
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
