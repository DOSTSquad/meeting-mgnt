import { createApp } from './app.js'
import { createWorkflowOutboxDispatcher } from './services/workflow-outbox-dispatcher.js'

const PORT = Number(process.env.PORT) || 3001
const app = createApp()
const workflowOutboxDispatcher = createWorkflowOutboxDispatcher()

const server = app.listen(PORT, () => {
  workflowOutboxDispatcher.start()
  console.log(`Server running at http://localhost:${PORT}`)
})

const shutdown = async () => {
  await workflowOutboxDispatcher.stop()
  server.close(() => {
    process.exit(0)
  })
}

process.once('SIGINT', () => {
  void shutdown()
})
process.once('SIGTERM', () => {
  void shutdown()
})
