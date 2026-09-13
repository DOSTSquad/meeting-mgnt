import { randomUUID } from 'node:crypto'

import { getProducerRedisConnection, getWorkerRedisConnection } from './redis-connections.js'

export const TRANSCRIPTION_STREAM = process.env.AI_TRANSCRIPTION_STREAM || 'ai.transcription.jobs'
export const ANALYSIS_STREAM = process.env.AI_ANALYSIS_STREAM || 'ai.analysis.jobs'
export const RESULT_STREAM = process.env.AI_RESULT_STREAM || 'ai.results'

export const RESULT_CONSUMER_GROUP =
  process.env.AI_RESULT_CONSUMER_GROUP || 'server-result-consumers'
export const RESULT_CONSUMER_NAME =
  process.env.AI_RESULT_CONSUMER_NAME || `server-${process.pid}-${randomUUID()}`

const STREAM_MAXLEN = Number.parseInt(process.env.AI_STREAM_MAXLEN || '10000', 10)
const READ_BLOCK_MS = Number.parseInt(process.env.AI_STREAM_READ_BLOCK_MS || '1000', 10)
const CLAIM_IDLE_MS = Number.parseInt(process.env.AI_STREAM_CLAIM_IDLE_MS || '60000', 10)

const asPositiveInteger = (value, fallback) =>
  Number.isInteger(value) && value > 0 ? value : fallback

const maxLength = asPositiveInteger(STREAM_MAXLEN, 10000)
const readBlockMs = asPositiveInteger(READ_BLOCK_MS, 1000)
const claimIdleMs = asPositiveInteger(CLAIM_IDLE_MS, 60000)

const ensureConsumerGroup = async (connection, stream, group) => {
  try {
    await connection.xgroup('CREATE', stream, group, '0-0', 'MKSTREAM')
  } catch (error) {
    if (!String(error.message).includes('BUSYGROUP')) {
      throw error
    }
  }
}

const parseMessage = ([id, fields]) => {
  const values = {}
  for (let index = 0; index < fields.length; index += 2) {
    values[fields[index]] = fields[index + 1]
  }

  return {
    id,
    eventId: values.eventId,
    eventType: values.eventType,
    jobId: values.jobId,
    payload: JSON.parse(values.payload || '{}'),
  }
}

const parseReadResult = (result) => {
  if (!result?.length) {
    return []
  }

  return result.flatMap(([, messages]) => messages.map(parseMessage))
}

export const publishAiJob = async (
  { stream, eventType, jobId, payload, eventId = randomUUID() },
  { connection } = {}
) => {
  if (!stream || !eventType || !jobId) {
    throw new Error('AI stream jobs require stream, eventType, and jobId')
  }

  const producer = connection ?? getProducerRedisConnection()
  if (producer.status === 'wait') {
    await producer.connect()
  }

  const messageId = await producer.xadd(
    stream,
    'MAXLEN',
    '~',
    maxLength,
    '*',
    'eventId',
    eventId,
    'eventType',
    eventType,
    'jobId',
    jobId,
    'payload',
    JSON.stringify(payload ?? {})
  )

  return { eventId, messageId, stream, eventType, jobId }
}

export const createAiResultConsumer = ({
  connection = getWorkerRedisConnection(),
  group = RESULT_CONSUMER_GROUP,
  consumer = RESULT_CONSUMER_NAME,
  onMessage,
  logger = console,
} = {}) => {
  if (!onMessage) {
    throw new Error('AI result consumer requires an onMessage handler')
  }

  let stopped = false
  let running

  const acknowledge = (message) => connection.xack(RESULT_STREAM, group, message.id)

  const read = async (startId) => {
    const result = await connection.xreadgroup(
      'GROUP',
      group,
      consumer,
      'COUNT',
      10,
      'BLOCK',
      readBlockMs,
      'STREAMS',
      RESULT_STREAM,
      startId
    )

    return parseReadResult(result)
  }

  const claim = async () => {
    const result = await connection.xautoclaim(
      RESULT_STREAM,
      group,
      consumer,
      claimIdleMs,
      '0-0',
      'COUNT',
      10
    )

    return result?.[1]?.map(parseMessage) ?? []
  }

  const process = async (message) => {
    try {
      const result = await onMessage(message)
      if (result?.stale) {
        logger.warn?.('AI result event was stale; acknowledging', {
          eventId: message.eventId,
          eventType: message.eventType,
          jobId: message.jobId,
        })
      }
      await acknowledge(message)
    } catch (error) {
      const permanent =
        error.code?.startsWith('23') || /was not found|unsupported/i.test(error.message)

      logger.error?.(
        `AI result event failed; ${permanent ? 'acknowledging' : 'leaving it pending for reclaim'}`,
        {
          eventId: message.eventId,
          eventType: message.eventType,
          jobId: message.jobId,
          message: error.message,
        }
      )

      if (permanent) {
        await acknowledge(message)
      }
    }
  }

  const loop = async () => {
    if (connection.status === 'wait') {
      await connection.connect()
    }

    await ensureConsumerGroup(connection, RESULT_STREAM, group)

    while (!stopped) {
      const pending = await claim()
      const messages = [...pending, ...(await read('>'))]

      for (const message of messages) {
        if (stopped) {
          break
        }
        await process(message)
      }
    }
  }

  const start = () => {
    if (!running) {
      stopped = false
      running = loop().catch((error) => {
        if (!stopped) {
          logger.error?.('AI result consumer stopped unexpectedly', { message: error.message })
        }
      })
    }

    return running
  }

  const stop = async () => {
    stopped = true
    connection.disconnect()
    await running
    running = undefined
  }

  return { start, stop, acknowledge }
}
