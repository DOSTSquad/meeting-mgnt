import { closePool } from './db/postgres.js'
import { createWorkflowOutboxDispatcher } from './services/workflow-outbox-dispatcher.js'

const getMissingWorkerConfig = (environment) =>
  ['DATABASE_URL', 'REDIS_URL'].filter((name) => !environment[name])

const workerPositiveIntegerConfig = [
  'WORKFLOW_OUTBOX_DISPATCH_INTERVAL_MS',
  'WORKFLOW_OUTBOX_DISPATCH_LIMIT',
  'WORKFLOW_OUTBOX_LEASE_SECONDS',
  'WORKFLOW_OUTBOX_RETRY_DELAY_SECONDS',
  'AI_STREAM_MAXLEN',
  'AI_STREAM_READ_BLOCK_MS',
  'AI_STREAM_CLAIM_IDLE_MS',
]

const isInvalidPositiveInteger = (value) => {
  if (value === undefined) {
    return false
  }

  const parsed = Number.parseInt(value, 10)
  return !Number.isInteger(parsed) || parsed <= 0
}

const getInvalidWorkerConfig = (environment) => [
  ...workerPositiveIntegerConfig.filter((name) => isInvalidPositiveInteger(environment[name])),
]

export const validateWorkerRuntimeConfig = (environment = process.env) => {
  const missingConfig = getMissingWorkerConfig(environment)
  if (missingConfig.length > 0) {
    throw new Error(`Worker runtime missing required config: ${missingConfig.join(', ')}`)
  }

  const invalidConfig = getInvalidWorkerConfig(environment)
  if (invalidConfig.length > 0) {
    throw new Error(`Worker runtime invalid config: ${invalidConfig.join(', ')}`)
  }
}

const stopRuntimeServices = async (services) => {
  for (const service of [...services].reverse()) {
    await service.stop?.()
  }
}

export const createWorkerRuntime = ({
  dispatcher = createWorkflowOutboxDispatcher(),
  services = [],
  closeDatabase = closePool,
  environment = process.env,
  logger = console,
} = {}) => {
  let stopped = false

  const start = () => {
    if (!dispatcher.isEnabled()) {
      logger.log('Worker runtime disabled because AI_PIPELINE_ENABLED is not true')
      return false
    }

    validateWorkerRuntimeConfig(environment)

    dispatcher.start()
    for (const service of services) {
      service.start?.()
    }
    logger.log('Worker runtime started')
    return true
  }

  const stop = async () => {
    if (stopped) {
      return
    }

    stopped = true
    await stopRuntimeServices(services)
    await dispatcher.stop()
    await closeDatabase()
    logger.log('Worker runtime stopped')
  }

  return {
    start,
    stop,
  }
}
