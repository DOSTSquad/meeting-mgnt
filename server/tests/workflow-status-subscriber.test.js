import { EventEmitter } from 'node:events'

import { describe, beforeEach, it, expect, jest } from '@jest/globals'

const { createWorkflowStatusSubscriber } = await import('../services/workflow-status-subscriber.js')

const MEETING_A = '11111111-1111-4111-8111-111111111111'
const MEETING_B = '22222222-2222-4222-8222-222222222222'

class FakeRedis extends EventEmitter {
  constructor() {
    super()
    this.subscribed = []
    this.quit = jest.fn(async () => 'OK')
    this.disconnect = jest.fn()
  }

  async subscribe(channel) {
    this.subscribed.push(channel)
    return 1
  }

  deliver(payload) {
    this.emit('message', 'channel', JSON.stringify(payload))
  }
}

let redis
let subscriber

const createSubject = () => {
  redis = new FakeRedis()
  return createWorkflowStatusSubscriber({
    channel: 'test-channel',
    createConnection: () => redis,
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
  })
}

beforeEach(() => {
  subscriber = createSubject()
})

describe('workflow status subscriber', () => {
  it('opens exactly one Redis subscription for many listeners', async () => {
    await subscriber.subscribe(MEETING_A, jest.fn())
    await subscriber.subscribe(MEETING_A, jest.fn())
    await subscriber.subscribe(MEETING_B, jest.fn())

    expect(redis.subscribed).toEqual(['test-channel'])
    expect(subscriber.listenerCount(MEETING_A)).toBe(2)
    expect(subscriber.meetingCount()).toBe(2)
  })

  it('delivers a message only to listeners of that meeting', async () => {
    const forA = jest.fn()
    const forB = jest.fn()
    await subscriber.subscribe(MEETING_A, forA)
    await subscriber.subscribe(MEETING_B, forB)

    redis.deliver({ meetingId: MEETING_A, recordingStatus: 'transcribing' })

    expect(forA).toHaveBeenCalledTimes(1)
    expect(forB).not.toHaveBeenCalled()
  })

  it('stops delivering after unsubscribe and forgets the meeting', async () => {
    const listener = jest.fn()
    const unsubscribe = await subscriber.subscribe(MEETING_A, listener)

    unsubscribe()
    redis.deliver({ meetingId: MEETING_A })

    expect(listener).not.toHaveBeenCalled()
    expect(subscriber.meetingCount()).toBe(0)
  })

  it('is safe to unsubscribe twice', async () => {
    const unsubscribe = await subscriber.subscribe(MEETING_A, jest.fn())

    unsubscribe()
    expect(() => unsubscribe()).not.toThrow()
  })

  it('keeps other listeners when one of them throws', async () => {
    const failing = jest.fn(() => {
      throw new Error('listener exploded')
    })
    const healthy = jest.fn()
    await subscriber.subscribe(MEETING_A, failing)
    await subscriber.subscribe(MEETING_A, healthy)

    redis.deliver({ meetingId: MEETING_A })

    expect(healthy).toHaveBeenCalledTimes(1)
  })

  it('ignores malformed messages instead of throwing', async () => {
    const listener = jest.fn()
    await subscriber.subscribe(MEETING_A, listener)

    expect(() => redis.emit('message', 'channel', 'not json')).not.toThrow()
    expect(listener).not.toHaveBeenCalled()
  })

  it('ignores a message for a meeting nobody is watching', async () => {
    const listener = jest.fn()
    await subscriber.subscribe(MEETING_A, listener)

    redis.deliver({ meetingId: MEETING_B })

    expect(listener).not.toHaveBeenCalled()
  })

  it('drops every listener on close', async () => {
    await subscriber.subscribe(MEETING_A, jest.fn())

    await subscriber.close()

    expect(redis.quit).toHaveBeenCalled()
    expect(subscriber.meetingCount()).toBe(0)
  })
})
