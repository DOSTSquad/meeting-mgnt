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
    enableOfflineQueue: false,
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
// broken publish can never stall the BullMQ producer or worker.
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
