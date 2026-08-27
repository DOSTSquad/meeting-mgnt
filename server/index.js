import { createApp } from './app.js'
import { closePool } from './db/postgres.js'

const PORT = Number(process.env.PORT) || 3001
const app = createApp()

const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})

const shutdown = async () => {
  server.close(async () => {
    await closePool()
    process.exit(0)
  })
}

process.once('SIGINT', () => {
  void shutdown()
})
process.once('SIGTERM', () => {
  void shutdown()
})
