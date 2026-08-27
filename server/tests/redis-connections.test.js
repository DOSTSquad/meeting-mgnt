import { describe, afterEach, it, expect } from '@jest/globals'

process.env.REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'

// lazyConnect keeps every client in this file offline, so nothing here opens a
// socket. Only the resolved option set is under test.
const { closeRedisConnections, getProducerRedisConnection, getPublisherRedisConnection } =
  await import('../services/redis-connections.js')

afterEach(async () => {
  await closeRedisConnections()
})

describe('redis connection roles', () => {
  it('buffers publisher commands issued before the socket is up', () => {
    // Regression: with lazyConnect, the first publish of a process is always
    // issued before the connection is ready. Without the offline queue ioredis
    // rejects it with "Stream isn't writeable", so the first status
    // invalidation after every worker start was silently dropped.
    expect(getPublisherRedisConnection().options.enableOfflineQueue).toBe(true)
  })

  it('keeps the BullMQ producer failing fast instead of buffering', () => {
    expect(getProducerRedisConnection().options.enableOfflineQueue).toBe(false)
  })

  it('names each connection by role so Redis CLIENT LIST is readable', () => {
    expect(getPublisherRedisConnection().options.connectionName).toBe('meeting-mgnt-publisher')
    expect(getProducerRedisConnection().options.connectionName).toBe('meeting-mgnt-producer')
  })
})
