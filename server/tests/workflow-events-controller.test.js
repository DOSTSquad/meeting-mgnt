import { EventEmitter } from 'node:events'

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals'

const getWorkflowSnapshot = jest.fn()
const subscribe = jest.fn()
const unsubscribe = jest.fn()

jest.unstable_mockModule('../services/workflow-events-service.js', () => ({
  getWorkflowSnapshot,
  isWorkflowSettled: (snapshot) =>
    ['ready_for_review', 'failed'].includes(snapshot?.analysisRun?.status),
}))

jest.unstable_mockModule('../services/workflow-status-subscriber.js', () => ({
  getWorkflowStatusSubscriber: () => ({ subscribe }),
}))

const { streamWorkflowEvents } = await import('../controllers/workflow-events-controller.js')

const MEETING_ID = '55555555-5555-4555-8555-555555555555'
const CALLER_ID = '66666666-6666-4666-8666-666666666666'

const processing = {
  recording: { id: 'rec-1', status: 'uploaded' },
  transcript: { id: 'tra-1', status: 'processing' },
  analysisRun: { id: 'run-1', status: 'queued' },
}
const completed = {
  recording: { id: 'rec-1', status: 'transcribed' },
  transcript: { id: 'tra-1', status: 'completed' },
  analysisRun: { id: 'run-1', status: 'ready_for_review' },
}

const createReq = () => {
  const req = new EventEmitter()
  req.params = { meetingId: MEETING_ID }
  req.user = { id: CALLER_ID }
  return req
}

const createRes = () => {
  const res = new EventEmitter()
  res.chunks = []
  res.writableEnded = false
  res.writeHead = jest.fn((status, headers) => {
    res.status = status
    res.headers = headers
    return res
  })
  res.flushHeaders = jest.fn()
  res.write = jest.fn((chunk) => {
    res.chunks.push(chunk)
    return true
  })
  res.end = jest.fn(() => {
    res.writableEnded = true
  })
  return res
}

const framesOf = (res) =>
  res.chunks
    .filter((chunk) => chunk.startsWith('event:'))
    .map((chunk) => {
      const [, event] = chunk.match(/^event: (\S+)/)
      const [, data] = chunk.match(/\ndata: (.*)\n\n$/)
      return { event, data: JSON.parse(data) }
    })

let req
let res
let next
let consoleError

beforeEach(() => {
  jest.useFakeTimers()
  req = createReq()
  res = createRes()
  next = jest.fn()
  subscribe.mockReset()
  unsubscribe.mockReset()
  getWorkflowSnapshot.mockReset()
  subscribe.mockImplementation(async () => unsubscribe)
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  jest.useRealTimers()
  consoleError.mockRestore()
})

describe('workflow events stream', () => {
  it('refuses a non-participant before writing any stream headers', async () => {
    const forbidden = Object.assign(new Error('Only meeting participants can access recordings'), {
      statusCode: 403,
    })
    getWorkflowSnapshot.mockRejectedValue(forbidden)

    await streamWorkflowEvents(req, res, next)

    expect(next).toHaveBeenCalledWith(forbidden)
    expect(res.writeHead).not.toHaveBeenCalled()
    expect(res.write).not.toHaveBeenCalled()
    expect(subscribe).not.toHaveBeenCalled()
  })

  it('opens the stream with headers that defeat buffering', async () => {
    getWorkflowSnapshot.mockResolvedValue(processing)

    await streamWorkflowEvents(req, res, next)

    expect(res.status).toBe(200)
    expect(res.headers).toMatchObject({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    expect(res.flushHeaders).toHaveBeenCalled()
  })

  it('sends a database snapshot first', async () => {
    getWorkflowSnapshot.mockResolvedValue(processing)

    await streamWorkflowEvents(req, res, next)

    expect(framesOf(res)[0]).toEqual({ event: 'snapshot', data: processing })
  })

  it('reloads from the database rather than forwarding the Redis payload', async () => {
    getWorkflowSnapshot.mockResolvedValueOnce(processing).mockResolvedValueOnce(completed)
    await streamWorkflowEvents(req, res, next)

    const [, listener] = subscribe.mock.calls[0]
    listener({ meetingId: MEETING_ID, recordingStatus: 'nonsense-from-redis' })
    await Promise.resolve()
    await Promise.resolve()

    const frames = framesOf(res)
    expect(frames[1]).toEqual({ event: 'status', data: completed })
    expect(getWorkflowSnapshot).toHaveBeenCalledTimes(2)
  })

  it('closes the stream once the workflow settles', async () => {
    getWorkflowSnapshot.mockResolvedValueOnce(processing).mockResolvedValueOnce(completed)
    await streamWorkflowEvents(req, res, next)

    const [, listener] = subscribe.mock.calls[0]
    listener({ meetingId: MEETING_ID })
    await Promise.resolve()
    await Promise.resolve()

    expect(framesOf(res).map((frame) => frame.event)).toEqual(['snapshot', 'status', 'settled'])
    expect(unsubscribe).toHaveBeenCalled()
    expect(res.end).toHaveBeenCalled()
  })

  it('does not subscribe when the work already finished', async () => {
    getWorkflowSnapshot.mockResolvedValue(completed)

    await streamWorkflowEvents(req, res, next)

    expect(subscribe).not.toHaveBeenCalled()
    expect(framesOf(res).map((frame) => frame.event)).toEqual(['snapshot', 'settled'])
    expect(res.end).toHaveBeenCalled()
  })

  it('releases the subscription and heartbeat when the client disconnects', async () => {
    getWorkflowSnapshot.mockResolvedValue(processing)
    await streamWorkflowEvents(req, res, next)

    req.emit('close')

    expect(unsubscribe).toHaveBeenCalledTimes(1)

    res.write.mockClear()
    jest.advanceTimersByTime(60000)
    expect(res.write).not.toHaveBeenCalled()
  })

  it('is idempotent when both req and res report close', async () => {
    getWorkflowSnapshot.mockResolvedValue(processing)
    await streamWorkflowEvents(req, res, next)

    req.emit('close')
    res.emit('close')

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(res.end).toHaveBeenCalledTimes(1)
  })

  it('sends heartbeat comments while the work is in flight', async () => {
    getWorkflowSnapshot.mockResolvedValue(processing)
    await streamWorkflowEvents(req, res, next)

    jest.advanceTimersByTime(45000)

    expect(res.chunks.filter((chunk) => chunk === ': heartbeat\n\n')).toHaveLength(3)
  })

  it('ends the stream when access is revoked mid-flight', async () => {
    getWorkflowSnapshot
      .mockResolvedValueOnce(processing)
      .mockRejectedValueOnce(Object.assign(new Error('forbidden'), { statusCode: 403 }))
    await streamWorkflowEvents(req, res, next)

    const [, listener] = subscribe.mock.calls[0]
    listener({ meetingId: MEETING_ID })
    await Promise.resolve()
    await Promise.resolve()

    expect(framesOf(res).map((frame) => frame.event)).toEqual(['snapshot', 'error'])
    expect(unsubscribe).toHaveBeenCalled()
    expect(res.end).toHaveBeenCalled()
  })

  it('closes cleanly when the subscriber is unavailable', async () => {
    getWorkflowSnapshot.mockResolvedValue(processing)
    subscribe.mockRejectedValue(new Error('redis down'))

    await streamWorkflowEvents(req, res, next)

    expect(framesOf(res).map((frame) => frame.event)).toEqual(['snapshot', 'error'])
    expect(res.end).toHaveBeenCalled()
  })
})
