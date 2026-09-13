import { randomUUID } from 'node:crypto'

import { closeRedisConnections } from './redis-connections.js'
import { dispatchPendingWorkflowOutbox } from './workflow-outbox-service.js'

const DEFAULT_INTERVAL_MS = 5000
const DEFAULT_LIMIT = 25
const DEFAULT_LEASE_SECONDS = 60

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const parseOptionalPositiveInteger = (value) => {
  const parsed = Number.parseInt(value, 10)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

export const getWorkflowOutboxDispatcherConfig = (environment = process.env) => ({
  enabled: environment.AI_PIPELINE_ENABLED === 'true',
  intervalMs: parsePositiveInteger(
    environment.WORKFLOW_OUTBOX_DISPATCH_INTERVAL_MS,
    DEFAULT_INTERVAL_MS
  ),
  limit: parsePositiveInteger(environment.WORKFLOW_OUTBOX_DISPATCH_LIMIT, DEFAULT_LIMIT),
  leaseSeconds: parsePositiveInteger(
    environment.WORKFLOW_OUTBOX_LEASE_SECONDS,
    DEFAULT_LEASE_SECONDS
  ),
  retryDelaySeconds: parseOptionalPositiveInteger(environment.WORKFLOW_OUTBOX_RETRY_DELAY_SECONDS),
})

export const createWorkflowOutboxDispatcher = ({
  workerId = `workflow-dispatcher-${process.pid}-${randomUUID()}`,
  dispatch = dispatchPendingWorkflowOutbox,
  logger = console,
  environment = process.env,
  closeRedis = closeRedisConnections,
} = {}) => {
  const config = getWorkflowOutboxDispatcherConfig(environment)
  let timer
  let stopped = false
  let activeDispatch

  const dispatchOnce = async () => {
    if (!config.enabled || stopped || activeDispatch) {
      return []
    }

    activeDispatch = (async () => {
      try {
        return await dispatch({
          limit: config.limit,
          leaseSeconds: config.leaseSeconds,
          workerId,
          retryDelaySeconds: config.retryDelaySeconds,
        })
      } catch (error) {
        logger.error('Workflow outbox dispatcher failed', {
          message: error.message,
        })
        return []
      } finally {
        activeDispatch = undefined
      }
    })()

    return activeDispatch
  }

  const start = () => {
    if (!config.enabled || timer) {
      return
    }

    void dispatchOnce()
    timer = setInterval(() => {
      void dispatchOnce()
    }, config.intervalMs)
    timer.unref?.()
  }

  const stop = async () => {
    stopped = true

    if (timer) {
      clearInterval(timer)
      timer = undefined
    }

    await activeDispatch
    await closeRedis()
  }

  return {
    isEnabled: () => config.enabled,
    start,
    stop,
    dispatchOnce,
  }
}
