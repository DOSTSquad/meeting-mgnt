import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, beforeAll, beforeEach, afterAll, it, expect } from '@jest/globals'
import { parse } from 'dotenv'

import { runMigrations } from '../db/migrate.js'
import { closePool, query } from '../db/postgres.js'
import { create as createMeetingHandler, getOne as getMeetingHandler } from '../controllers/meeting-controller.js'
import {
  add as addParticipantsHandler,
  list as listParticipantsHandler,
  remove as removeParticipantHandler,
  update as updateParticipantHandler,
} from '../controllers/participant-controller.js'
import { createUser } from '../repositories/user-repository.js'

const TEST_SECRET = 'test-secret'
const serverDir = fileURLToPath(new URL('../', import.meta.url))
const repoRoot = path.resolve(serverDir, '..')
const envPath = existsSync(path.join(repoRoot, '.env'))
  ? path.join(repoRoot, '.env')
  : path.join(repoRoot, '.env.example')
const projectEnv = parse(readFileSync(envPath))
const runDatabaseTests = process.env.RUN_DB_TESTS === 'true' && Boolean(projectEnv.DATABASE_URL)

const createResponseRecorder = () => ({
  statusCode: 200,
  body: null,
  headers: {},
  ended: false,
  status(code) {
    this.statusCode = code
    return this
  },
  set(name, value) {
    this.headers[name] = value
    return this
  },
  json(payload) {
    this.body = payload
    return this
  },
  end() {
    this.ended = true
    return this
  },
})

const buildRequest = ({
  body = {},
  params = {},
  query: queryParams = {},
  user,
  baseUrl = '/api/meetings',
  reqPath = '/',
} = {}) => ({
  body,
  params,
  query: queryParams,
  user,
  protocol: 'http',
  baseUrl,
  path: reqPath,
  get(headerName) {
    if (headerName.toLowerCase() === 'host') {
      return 'localhost:3000'
    }

    return undefined
  },
})

const runHandler = async (handler, req) => {
  const res = createResponseRecorder()
  let nextError

  await handler(req, res, (error) => {
    nextError = error
  })

  return { res, nextError }
}

let organizerUser
let aliceUser
let bobUser
let baseMeeting

beforeAll(async () => {
  process.env.JWT_SECRET = TEST_SECRET
  process.env.JWT_EXPIRES_IN = '1h'
  process.env.DATABASE_URL = projectEnv.DATABASE_URL

  if (!runDatabaseTests) {
    return
  }

  await runMigrations()
})

const baseMeetingBody = (overrides = {}) => ({
  title: 'Sprint Planning',
  description: 'Plan the next sprint',
  startsAt: '2026-05-01T09:00:00+10:00',
  endsAt: '2026-05-01T10:00:00+10:00',
  timezoneName: 'Australia/Brisbane',
  location: 'Room A',
  status: 'scheduled',
  department: 'engineering',
  ...overrides,
})

const createMeetingViaController = async (user, overrides = {}) => {
  const req = buildRequest({
    body: baseMeetingBody(overrides),
    user: { id: user.id },
  })
  const { res, nextError } = await runHandler(createMeetingHandler, req)
  expect(nextError).toBeUndefined()
  expect(res.statusCode).toBe(201)
  return res.body.meeting
}

beforeEach(async () => {
  if (!runDatabaseTests) {
    return
  }

  await query('TRUNCATE TABLE meetings RESTART IDENTITY CASCADE')
  await query('TRUNCATE TABLE users RESTART IDENTITY CASCADE')

  organizerUser = await createUser({
    name: 'Org Anizer',
    email: 'organizer@example.com',
    passwordHash: 'fake-hash-not-used',
    role: 'staff',
    department: 'engineering',
  })

  aliceUser = await createUser({
    name: 'Alice Example',
    email: 'alice@example.com',
    passwordHash: 'fake-hash-not-used',
    role: 'staff',
    department: 'engineering',
  })

  bobUser = await createUser({
    name: 'Bob Example',
    email: 'bob@example.com',
    passwordHash: 'fake-hash-not-used',
    role: 'staff',
    department: 'engineering',
  })

  baseMeeting = await createMeetingViaController(organizerUser)
})

afterAll(async () => {
  if (!runDatabaseTests) {
    return
  }

  await closePool()
})

const dbDescribe = runDatabaseTests ? describe : describe.skip

dbDescribe('Participant controller (DB-backed)', () => {
  it('returns an empty list on a fresh meeting', async () => {
    const { res, nextError } = await runHandler(
      listParticipantsHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeUndefined()
    expect(res.body.participants).toHaveLength(1)
    expect(res.body.participants[0].userId).toBe(organizerUser.id)
    expect(res.body.participants[0].role).toBe('organizer')
  })

  it('adds participants with default role attendee and rsvp_status pending', async () => {
    const { res, nextError } = await runHandler(
      addParticipantsHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { userIds: [aliceUser.id, bobUser.id] },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeUndefined()
    expect(res.statusCode).toBe(201)
    expect(res.body.participants).toHaveLength(2)
    for (const participant of res.body.participants) {
      expect(participant.role).toBe('attendee')
      expect(participant.rsvpStatus).toBe('pending')
      expect(participant.addedBy).toBe(organizerUser.id)
    }
  })

  it('is idempotent: re-posting the same userIds does not duplicate or change roles', async () => {
    await runHandler(
      addParticipantsHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { userIds: [aliceUser.id, bobUser.id] },
        user: { id: organizerUser.id },
      })
    )

    const secondAdd = await runHandler(
      addParticipantsHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { userIds: [aliceUser.id, bobUser.id], role: 'organizer' },
        user: { id: organizerUser.id },
      })
    )

    expect(secondAdd.nextError).toBeUndefined()

    const listRes = await runHandler(
      listParticipantsHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        user: { id: organizerUser.id },
      })
    )

    expect(listRes.res.body.participants).toHaveLength(3)
    const organizer = listRes.res.body.participants.find((p) => p.userId === organizerUser.id)
    expect(organizer?.role).toBe('organizer')
    const attendees = listRes.res.body.participants.filter((p) => p.userId !== organizerUser.id)
    for (const participant of attendees) {
      expect(participant.role).toBe('attendee')
    }
  })

  it('assigns the provided role to new adds', async () => {
    const { res, nextError } = await runHandler(
      addParticipantsHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { userIds: [aliceUser.id], role: 'organizer' },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeUndefined()
    expect(res.body.participants[0].role).toBe('organizer')
  })

  it('returns 400 when a userId does not exist', async () => {
    const unknownId = '00000000-0000-0000-0000-000000000001'
    const { nextError } = await runHandler(
      addParticipantsHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { userIds: [aliceUser.id, unknownId] },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(400)
    expect(nextError.message).toMatch(/Unknown userIds/)
  })

  it('returns 404 for an unknown meeting id', async () => {
    const { nextError } = await runHandler(
      addParticipantsHandler,
      buildRequest({
        params: { meetingId: '00000000-0000-0000-0000-000000000000' },
        body: { userIds: [aliceUser.id] },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(404)
  })

  it('returns 403 when caller is neither meeting creator nor an organizer', async () => {
    const { nextError } = await runHandler(
      addParticipantsHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { userIds: [aliceUser.id] },
        user: { id: bobUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(403)
  })

  it('updates a participant role via PATCH', async () => {
    await runHandler(
      addParticipantsHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { userIds: [aliceUser.id] },
        user: { id: organizerUser.id },
      })
    )

    const { res, nextError } = await runHandler(
      updateParticipantHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id, userId: aliceUser.id },
        body: { role: 'optional' },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeUndefined()
    expect(res.body.participant.role).toBe('optional')
  })

  it('updates a participant rsvpStatus via PATCH', async () => {
    await runHandler(
      addParticipantsHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { userIds: [aliceUser.id] },
        user: { id: organizerUser.id },
      })
    )

    const { res, nextError } = await runHandler(
      updateParticipantHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id, userId: aliceUser.id },
        body: { rsvpStatus: 'accepted' },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeUndefined()
    expect(res.body.participant.rsvpStatus).toBe('accepted')
  })

  it('returns 400 when PATCH has no updates supplied', async () => {
    await runHandler(
      addParticipantsHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { userIds: [aliceUser.id] },
        user: { id: organizerUser.id },
      })
    )

    const { nextError } = await runHandler(
      updateParticipantHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id, userId: aliceUser.id },
        body: {},
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(400)
    expect(nextError.message).toMatch(/No updates supplied/)
  })

  it('removes a participant via DELETE', async () => {
    await runHandler(
      addParticipantsHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { userIds: [aliceUser.id] },
        user: { id: organizerUser.id },
      })
    )

    const deleteRes = await runHandler(
      removeParticipantHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id, userId: aliceUser.id },
        user: { id: organizerUser.id },
      })
    )

    expect(deleteRes.nextError).toBeUndefined()
    expect(deleteRes.res.statusCode).toBe(204)
    expect(deleteRes.res.ended).toBe(true)

    const listRes = await runHandler(
      listParticipantsHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        user: { id: organizerUser.id },
      })
    )

    expect(listRes.res.body.participants).toHaveLength(1)
    expect(listRes.res.body.participants[0].userId).toBe(organizerUser.id)
    expect(listRes.res.body.participants[0].role).toBe('organizer')
  })

  it('cannot demote or remove the last organizer', async () => {
    await runHandler(
      addParticipantsHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { userIds: [organizerUser.id], role: 'organizer' },
        user: { id: organizerUser.id },
      })
    )

    const demote = await runHandler(
      updateParticipantHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id, userId: organizerUser.id },
        body: { role: 'attendee' },
        user: { id: organizerUser.id },
      })
    )

    expect(demote.nextError).toBeDefined()
    expect(demote.nextError.statusCode).toBe(400)
    expect(demote.nextError.message).toMatch(/last organizer/)

    const removeRes = await runHandler(
      removeParticipantHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id, userId: organizerUser.id },
        user: { id: organizerUser.id },
      })
    )

    expect(removeRes.nextError).toBeDefined()
    expect(removeRes.nextError.statusCode).toBe(400)
    expect(removeRes.nextError.message).toMatch(/last organizer/)
  })

  it('GET /api/meetings/:id includes participants array', async () => {
    await runHandler(
      addParticipantsHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { userIds: [aliceUser.id] },
        user: { id: organizerUser.id },
      })
    )

    const { res, nextError } = await runHandler(
      getMeetingHandler,
      buildRequest({
        params: { id: baseMeeting.id },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeUndefined()
    expect(Array.isArray(res.body.meeting.participants)).toBe(true)
    expect(res.body.meeting.participants).toHaveLength(2)
    const userIds = res.body.meeting.participants.map((participant) => participant.userId)
    expect(userIds).toContain(organizerUser.id)
    expect(userIds).toContain(aliceUser.id)
  })
})
