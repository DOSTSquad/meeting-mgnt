import { afterAll, beforeAll, beforeEach, expect, it, jest } from '@jest/globals'
import express from 'express'

const meetingId = '11111111-1111-4111-8111-111111111111'
const ownerId = '22222222-2222-4222-8222-222222222222'
const attendeeId = '33333333-3333-4333-8333-333333333333'
const otherId = '44444444-4444-4444-8444-444444444444'
const findMeetingById = jest.fn()
const findOne = jest.fn()
const createChangeRequest = jest.fn()
const listChangeRequests = jest.fn()
const listMeetingChangeRequests = jest.fn()
const getUserForToken = jest.fn()
const markChangeRequestRead = jest.fn()

jest.unstable_mockModule('../repositories/meeting-repository.js', () => ({ findMeetingById }))
jest.unstable_mockModule('../repositories/participant-repository.js', () => ({ findOne }))
jest.unstable_mockModule('../repositories/meeting-change-request-repository.js', () => ({
  createChangeRequest,
  listChangeRequests,
  listMeetingChangeRequests,
  markChangeRequestRead,
}))
jest.unstable_mockModule('../services/auth-service.js', () => ({ getUserForToken }))

const { default: router } = await import('../routes/meeting-change-request-routes.js')
const { requireAuth } = await import('../middleware/auth-middleware.js')
let server
let baseUrl

beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use('/api/meetings/:meetingId/change-requests', requireAuth, router)
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode || 500).json({ error: error.message })
  })
  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', (error) => (error ? reject(error) : resolve()))
  })
  baseUrl = `http://127.0.0.1:${server.address().port}/api/meetings`
})

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve))
})

beforeEach(() => {
  jest.resetAllMocks()
  findMeetingById.mockResolvedValue({ id: meetingId, ownerId, title: 'Planning' })
  findOne.mockImplementation(async (_meetingId, userId) =>
    userId === attendeeId ? { userId, role: 'attendee', name: 'Attendee' } : null
  )
  getUserForToken.mockImplementation(async (id) => ({ id, role: 'staff' }))
  createChangeRequest.mockImplementation(async (meetingId, userId, message) => ({
    id: 'request-1',
    meetingId,
    userId,
    message,
    createdAt: '2026-09-24T10:00:00Z',
  }))
  listChangeRequests.mockResolvedValue([])
  listMeetingChangeRequests.mockResolvedValue([])
})

const request = async ({
  method = 'POST',
  callerId = attendeeId,
  id = meetingId,
  userId = attendeeId,
  requestId = otherId,
  body = { message: 'Please change the time' },
} = {}) => {
  const response = await fetch(
    `${baseUrl}/${id}/change-requests${method === 'PATCH' ? `/${requestId}/read` : method === 'GET' && userId ? `/${userId}` : ''}`,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(callerId ? { Authorization: `Bearer ${callerId}` } : {}),
      },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    }
  )
  return { status: response.status, body: await response.json() }
}

it('saves a trimmed attendee message under the authenticated sender, ignoring a spoofed sender', async () => {
  const result = await request({ body: { message: '  Move the meeting  ', userId: ownerId } })
  expect(result.status).toBe(201)
  expect(result.body.changeRequest).toMatchObject({
    userId: attendeeId,
    message: 'Move the meeting',
  })
  expect(createChangeRequest).toHaveBeenCalledWith(meetingId, attendeeId, 'Move the meeting', {
    recipientUserId: ownerId,
    title: 'Planning',
    detail: 'Attendee: Move the meeting',
  })
})

it('allows optional attendees to submit', async () => {
  findOne.mockResolvedValue({ userId: attendeeId, role: 'optional' })
  expect((await request()).status).toBe(201)
})

it.each([undefined, '', '   ', 123, {}, 'x'.repeat(2001)])(
  'rejects invalid message %p',
  async (message) => {
    expect((await request({ body: { message } })).status).toBe(400)
    expect(createChangeRequest).not.toHaveBeenCalled()
  }
)

it.each(['POST', 'GET'])('requires authentication for %s', async (method) => {
  expect((await request({ method, callerId: null })).status).toBe(401)
})

it.each(['POST', 'GET'])('validates meeting UUID for %s', async (method) => {
  expect((await request({ method, id: 'invalid' })).status).toBe(400)
})

it('validates participant UUID on reads', async () => {
  expect((await request({ method: 'GET', callerId: ownerId, userId: 'invalid' })).status).toBe(400)
})

it.each(['POST', 'GET'])('returns 404 for missing meeting on %s', async (method) => {
  findMeetingById.mockResolvedValue(null)
  expect((await request({ method })).status).toBe(404)
})

it.each([ownerId, otherId])('rejects submission by owner or outsider %s', async (callerId) => {
  expect((await request({ callerId })).status).toBe(403)
  expect(createChangeRequest).not.toHaveBeenCalled()
})

it('rejects submission by an organizer', async () => {
  findOne.mockResolvedValue({ userId: attendeeId, role: 'organizer' })
  expect((await request()).status).toBe(403)
})

it('returns persisted messages to the owner', async () => {
  const messages = [{ id: 'request-1', userId: attendeeId, message: 'Please change the time' }]
  listChangeRequests.mockResolvedValue(messages)
  expect(await request({ method: 'GET', callerId: ownerId })).toEqual({
    status: 200,
    body: { changeRequests: messages },
  })
  expect(listChangeRequests).toHaveBeenCalledWith(meetingId, attendeeId)
})

it('returns an empty list when the attendee has no requests', async () => {
  expect((await request({ method: 'GET', callerId: ownerId })).body).toEqual({ changeRequests: [] })
})

it.each([
  [attendeeId, 'staff'],
  [otherId, 'staff'],
  [otherId, 'admin'],
  [otherId, 'organizer'],
])('denies reads by non-owner %s with role %s', async (callerId, role) => {
  getUserForToken.mockResolvedValue({ id: callerId, role })
  expect((await request({ method: 'GET', callerId })).status).toBe(403)
  expect(listChangeRequests).not.toHaveBeenCalled()
})

it('returns 404 to the owner for a missing participant', async () => {
  expect((await request({ method: 'GET', callerId: ownerId, userId: otherId })).status).toBe(404)
})

it('returns the meeting inbox with sender names to its owner', async () => {
  const messages = [
    { id: 'request-1', userId: attendeeId, senderName: 'Attendee', message: 'Change the time' },
  ]
  listMeetingChangeRequests.mockResolvedValue(messages)
  expect(await request({ method: 'GET', callerId: ownerId, userId: null })).toEqual({
    status: 200,
    body: { changeRequests: messages },
  })
  expect(listMeetingChangeRequests).toHaveBeenCalledWith(meetingId)
})
it('returns an empty inbox for the owner before any requests', async () => {
  expect(await request({ method: 'GET', callerId: ownerId, userId: null })).toEqual({
    status: 200,
    body: { changeRequests: [] },
  })
})
it.each([
  [attendeeId, 'staff'],
  [otherId, 'staff'],
  [otherId, 'admin'],
  [otherId, 'organizer'],
])('denies inbox to non-owner %s with role %s', async (callerId, role) => {
  getUserForToken.mockResolvedValue({ id: callerId, role })
  expect((await request({ method: 'GET', callerId, userId: null })).status).toBe(403)
  expect(listMeetingChangeRequests).not.toHaveBeenCalled()
})
it('requires authentication for the inbox', async () => {
  expect((await request({ method: 'GET', callerId: null, userId: null })).status).toBe(401)
})
it('validates the inbox meeting ID', async () => {
  expect((await request({ method: 'GET', id: 'invalid', userId: null })).status).toBe(400)
})
it('returns 404 for a missing inbox meeting', async () => {
  findMeetingById.mockResolvedValue(null)
  expect((await request({ method: 'GET', userId: null })).status).toBe(404)
})

it('lets only the owner mark a request read', async () => {
  markChangeRequestRead.mockResolvedValue({ id: otherId, readAt: '2026-09-25T10:00:00Z' })
  const result = await request({ method: 'PATCH', callerId: ownerId })
  expect(result.status).toBe(200)
  expect(result.body.changeRequest.readAt).toBe('2026-09-25T10:00:00Z')
  expect(markChangeRequestRead).toHaveBeenCalledWith(meetingId, otherId)
})
it.each([
  [attendeeId, 'staff'],
  [otherId, 'staff'],
  [otherId, 'admin'],
])('denies mark read for %s (%s)', async (callerId, role) => {
  getUserForToken.mockResolvedValue({ id: callerId, role })
  expect((await request({ method: 'PATCH', callerId })).status).toBe(403)
  expect(markChangeRequestRead).not.toHaveBeenCalled()
})
it('requires authentication to mark read', async () => {
  expect((await request({ method: 'PATCH', callerId: null })).status).toBe(401)
})
it.each([{ id: 'invalid' }, { requestId: 'invalid' }])(
  'validates mark read IDs %p',
  async (fields) => {
    expect((await request({ method: 'PATCH', callerId: ownerId, ...fields })).status).toBe(400)
  }
)
it('returns 404 for a missing meeting when marking read', async () => {
  findMeetingById.mockResolvedValue(null)
  expect((await request({ method: 'PATCH', callerId: ownerId })).status).toBe(404)
})
it('returns 404 for a missing request or one belonging to another meeting', async () => {
  markChangeRequestRead.mockResolvedValue(null)
  expect((await request({ method: 'PATCH', callerId: ownerId })).status).toBe(404)
})
