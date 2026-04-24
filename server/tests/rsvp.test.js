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
  updateOwnRsvp,
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

  // Add aliceUser as a participant (attendee) for most tests
  await runHandler(
    addParticipantsHandler,
    buildRequest({
      params: { meetingId: baseMeeting.id },
      body: { userIds: [aliceUser.id], role: 'attendee' },
      user: { id: organizerUser.id },
    })
  )
})

afterAll(async () => {
  if (!runDatabaseTests) {
    return
  }

  await closePool()
})

const dbDescribe = runDatabaseTests ? describe : describe.skip

dbDescribe('RSVP controller (DB-backed)', () => {
  it('participant can set their RSVP to accepted', async () => {
    const { res, nextError } = await runHandler(
      updateOwnRsvp,
      buildRequest({
        params: { id: baseMeeting.id },
        body: { rsvpStatus: 'accepted' },
        user: { id: aliceUser.id },
      })
    )

    expect(nextError).toBeUndefined()
    expect(res.statusCode).toBe(200)
    expect(res.body.participant.rsvpStatus).toBe('accepted')
    expect(res.body.participant.userId).toBe(aliceUser.id)
  })

  it('participant can switch from accepted to declined', async () => {
    // First set to accepted
    await runHandler(
      updateOwnRsvp,
      buildRequest({
        params: { id: baseMeeting.id },
        body: { rsvpStatus: 'accepted' },
        user: { id: aliceUser.id },
      })
    )

    // Then switch to declined
    const { res, nextError } = await runHandler(
      updateOwnRsvp,
      buildRequest({
        params: { id: baseMeeting.id },
        body: { rsvpStatus: 'declined' },
        user: { id: aliceUser.id },
      })
    )

    expect(nextError).toBeUndefined()
    expect(res.statusCode).toBe(200)
    expect(res.body.participant.rsvpStatus).toBe('declined')
  })

  it('non-participant gets 403', async () => {
    const { nextError } = await runHandler(
      updateOwnRsvp,
      buildRequest({
        params: { id: baseMeeting.id },
        body: { rsvpStatus: 'accepted' },
        user: { id: bobUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(403)
    expect(nextError.message).toMatch(/not a participant/)
  })

  it('unknown meeting id returns 404', async () => {
    const { nextError } = await runHandler(
      updateOwnRsvp,
      buildRequest({
        params: { id: '00000000-0000-0000-0000-000000000000' },
        body: { rsvpStatus: 'accepted' },
        user: { id: aliceUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(404)
  })

  it('rsvpStatus: pending returns 400 (self-reset blocked)', async () => {
    const { nextError } = await runHandler(
      updateOwnRsvp,
      buildRequest({
        params: { id: baseMeeting.id },
        body: { rsvpStatus: 'pending' },
        user: { id: aliceUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(400)
    expect(nextError.message).toMatch(/Invalid rsvpStatus/)
  })

  it('rsvpStatus: maybe returns 400 (invalid value)', async () => {
    const { nextError } = await runHandler(
      updateOwnRsvp,
      buildRequest({
        params: { id: baseMeeting.id },
        body: { rsvpStatus: 'maybe' },
        user: { id: aliceUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(400)
    expect(nextError.message).toMatch(/Invalid rsvpStatus/)
  })

  it('missing rsvpStatus returns 400', async () => {
    const { nextError } = await runHandler(
      updateOwnRsvp,
      buildRequest({
        params: { id: baseMeeting.id },
        body: {},
        user: { id: aliceUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(400)
    expect(nextError.message).toMatch(/rsvpStatus is required/)
  })

  it('GET meeting returns rsvpCounts reflecting participant responses', async () => {
    // Create a third participant
    const carolUser = await createUser({
      name: 'Carol Example',
      email: 'carol@example.com',
      passwordHash: 'fake-hash-not-used',
      role: 'staff',
      department: 'engineering',
    })

    // Add bob and carol as participants
    await runHandler(
      addParticipantsHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { userIds: [bobUser.id, carolUser.id], role: 'attendee' },
        user: { id: organizerUser.id },
      })
    )

    // alice: accepted, bob: accepted, carol: declined
    await runHandler(
      updateOwnRsvp,
      buildRequest({
        params: { id: baseMeeting.id },
        body: { rsvpStatus: 'accepted' },
        user: { id: aliceUser.id },
      })
    )

    await runHandler(
      updateOwnRsvp,
      buildRequest({
        params: { id: baseMeeting.id },
        body: { rsvpStatus: 'accepted' },
        user: { id: bobUser.id },
      })
    )

    await runHandler(
      updateOwnRsvp,
      buildRequest({
        params: { id: baseMeeting.id },
        body: { rsvpStatus: 'declined' },
        user: { id: carolUser.id },
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
    expect(res.body.meeting.rsvpCounts).toEqual({ accepted: 2, declined: 1, pending: 0 })
  })
})
