import IORedis from 'ioredis'

import { WORKFLOW_STATUS_CHANNEL } from './workflow-status-publisher.js'

/**
 * Fans workflow status invalidations out to open SSE streams.
 *
 * A Redis client in subscriber mode cannot run ordinary commands, so this owns a
 * connection of its own and never borrows the stream producer, result consumer, or outbox
 * connections from redis-connections.js.
 *
 * One connection serves every stream in the process: a Redis subscription per
 * viewer would mean a SUBSCRIBE and UNSUBSCRIBE on each page load and thousands
 * of live channel names. Messages carry the meeting they belong to, so the fan
 * out filters in memory instead.
 *
 * Listeners receive the message only as a signal to reload. The payload is never
 * forwarded to a client, because Redis Pub/Sub has no delivery guarantee and
 * PostgreSQL is the authoritative record.
 */
export const createWorkflowStatusSubscriber = ({
  channel = WORKFLOW_STATUS_CHANNEL,
  createConnection = () => new IORedis(process.env.REDIS_URL, { lazyConnect: true }),
  logger = console,
} = {}) => {
  const listenersByMeeting = new Map()
  let connection
  let subscribing

  const handleMessage = (_channel, raw) => {
    let payload

    try {
      payload = JSON.parse(raw)
    } catch {
      logger.warn?.('Ignoring malformed workflow status message')
      return
    }

    const listeners = listenersByMeeting.get(payload?.meetingId)

    if (!listeners) {
      return
    }

    for (const listener of [...listeners]) {
      try {
        listener(payload)
      } catch (error) {
        logger.error?.('Workflow status listener failed', { message: error.message })
      }
    }
  }

  const ensureSubscribed = async () => {
    if (subscribing) {
      return subscribing
    }

    subscribing = (async () => {
      connection = createConnection()
      connection.on('error', (error) => {
        logger.error?.('Workflow status subscriber error', { message: error.message })
      })
      connection.on('message', handleMessage)
      await connection.subscribe(channel)
      logger.log?.(`Workflow status subscriber listening on ${channel}`)
    })()

    return subscribing
  }

  /**
   * Registers a listener for one meeting. Returns the matching unsubscribe, which
   * callers must run when the client disconnects, otherwise a closed stream keeps
   * its listener and the map grows for the life of the process.
   */
  const subscribe = async (meetingId, listener) => {
    await ensureSubscribed()

    const listeners = listenersByMeeting.get(meetingId) ?? new Set()
    listeners.add(listener)
    listenersByMeeting.set(meetingId, listeners)

    return () => {
      const current = listenersByMeeting.get(meetingId)

      if (!current) {
        return
      }

      current.delete(listener)

      if (current.size === 0) {
        listenersByMeeting.delete(meetingId)
      }
    }
  }

  const close = async () => {
    listenersByMeeting.clear()

    if (!connection) {
      return
    }

    const current = connection
    connection = undefined
    subscribing = undefined
    await current.quit().catch(() => current.disconnect())
  }

  return {
    subscribe,
    close,
    listenerCount: (meetingId) => listenersByMeeting.get(meetingId)?.size ?? 0,
    meetingCount: () => listenersByMeeting.size,
  }
}

let sharedSubscriber

export const getWorkflowStatusSubscriber = () => {
  if (!sharedSubscriber) {
    sharedSubscriber = createWorkflowStatusSubscriber()
  }

  return sharedSubscriber
}

export const closeWorkflowStatusSubscriber = async () => {
  if (!sharedSubscriber) {
    return
  }

  const current = sharedSubscriber
  sharedSubscriber = undefined
  await current.close()
}
