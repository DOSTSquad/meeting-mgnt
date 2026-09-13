import IORedis from 'ioredis'

let producerConnection
let workerConnection
let publisherConnection

const createRedisConnection = (role) => {
  if (!process.env.REDIS_URL) {
    const error = new Error('REDIS_URL is not configured')
    error.code = 'REDIS_MISCONFIGURED'
    throw error
  }

  const connection = new IORedis(process.env.REDIS_URL, {
    connectionName: `meeting-mgnt-${role}`,
    // Command producers and stream consumers fail fast rather than pile commands
    // up behind a dead socket. The publisher is fire-and-forget, and combined
    // with lazyConnect its first publish is issued before the socket is up, so
    // it keeps the offline queue enabled for status invalidations.
    enableOfflineQueue: role === 'publisher',
    lazyConnect: true,
    maxRetriesPerRequest: role === 'worker' ? null : 1,
  })

  connection.on('error', () => {})

  return connection
}

export const getProducerRedisConnection = () => {
  if (!producerConnection) {
    producerConnection = createRedisConnection('producer')
  }

  return producerConnection
}

export const getWorkerRedisConnection = () => {
  if (!workerConnection) {
    workerConnection = createRedisConnection('worker')
  }

  return workerConnection
}

// Status invalidations are published on their own connection so a slow or
// broken publish can never stall the stream producer or result consumer.
export const getPublisherRedisConnection = () => {
  if (!publisherConnection) {
    publisherConnection = createRedisConnection('publisher')
  }

  return publisherConnection
}

export const closeRedisConnections = async () => {
  const connections = [producerConnection, workerConnection, publisherConnection].filter(Boolean)
  producerConnection = undefined
  workerConnection = undefined
  publisherConnection = undefined

  await Promise.all(
    connections.map((connection) => connection.quit().catch(() => connection.disconnect()))
  )
}
