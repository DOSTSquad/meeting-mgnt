import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadDotenv } from 'dotenv'

loadDotenv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'),
  override: true,
})

const { createWorkerRuntime } = await import('./worker-runtime.js')

const workerRuntime = createWorkerRuntime()

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
