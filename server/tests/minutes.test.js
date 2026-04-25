import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, beforeAll, beforeEach, afterAll, it, expect } from '@jest/globals'
import { parse } from 'dotenv'

import { runMigrations } from '../db/migrate.js'
import { closePool, query } from '../db/postgres.js'
import { create as createMeetingHandler, update as updateMeetingHandler } from '../controllers/meeting-controller.js'
import { add as addParticipantsHandler } from '../controllers/participant-controller.js'
import {
  getForMeeting as getMinutesHandler,
  update as updateMinutesHandler,
} from '../controllers/minutes-controller.js'
import { createUser } from '../repositories/user-repository.js'
import { DEFAULT_TEMPLATE_BODY } from '../services/minutes-service.js'

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

const addAttendee = async (meetingId, userId, callerId) => {
  const { nextError } = await runHandler(
    addParticipantsHandler,
    buildRequest({
      params: { meetingId },
      body: { userIds: [userId] },
      user: { id: callerId },
    })
  )

  expect(nextError).toBeUndefined()
}

const fetchMinutes = async (meetingId, callerId) => {
  const { res, nextError } = await runHandler(
    getMinutesHandler,
    buildRequest({
      params: { meetingId },
      user: { id: callerId },
    })
  )

  expect(nextError).toBeUndefined()
  expect(res.statusCode).toBe(200)
  return res.body.minutes
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

dbDescribe('Minutes controller (DB-backed)', () => {
  it('returns the default template for a freshly created meeting (organizer)', async () => {
    const { res, nextError } = await runHandler(
      getMinutesHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeUndefined()
    expect(res.statusCode).toBe(200)
    expect(res.body.minutes.body).toBe(DEFAULT_TEMPLATE_BODY)
    expect(res.body.minutes.createdBy).toBe(organizerUser.id)
    expect(res.body.minutes.meetingId).toBe(baseMeeting.id)
  })

  it('allows a participant to GET minutes', async () => {
    await addAttendee(baseMeeting.id, aliceUser.id, organizerUser.id)

    const { res, nextError } = await runHandler(
      getMinutesHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        user: { id: aliceUser.id },
      })
    )

    expect(nextError).toBeUndefined()
    expect(res.statusCode).toBe(200)
    expect(res.body.minutes.body).toBe(DEFAULT_TEMPLATE_BODY)
  })

  it('returns 403 to a non-participant on GET', async () => {
    const { nextError } = await runHandler(
      getMinutesHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        user: { id: bobUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(403)
    expect(nextError.message).toMatch(/Only meeting participants/)
  })

  it('returns 404 when GETting minutes for an unknown meeting', async () => {
    const unknownId = '00000000-0000-0000-0000-000000000099'

    const { nextError } = await runHandler(
      getMinutesHandler,
      buildRequest({
        params: { meetingId: unknownId },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(404)
  })

  it('updates the body via PUT and returns the updated row', async () => {
    const minutes = await fetchMinutes(baseMeeting.id, organizerUser.id)

    const { res, nextError } = await runHandler(
      updateMinutesHandler,
      buildRequest({
        params: { id: minutes.id },
        body: { body: '# New' },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeUndefined()
    expect(res.statusCode).toBe(200)
    expect(res.body.minutes.body).toBe('# New')
    expect(res.body.minutes.updatedBy).toBe(organizerUser.id)
  })

  it('writes a new minutes_versions row on each PUT (versions 1 then 2)', async () => {
    const minutes = await fetchMinutes(baseMeeting.id, organizerUser.id)

    const updateRes = await runHandler(
      updateMinutesHandler,
      buildRequest({
        params: { id: minutes.id },
        body: { body: '# Round 2' },
        user: { id: organizerUser.id },
      })
    )

    expect(updateRes.nextError).toBeUndefined()

    const versions = await query(
      'SELECT version FROM minutes_versions WHERE minutes_id = $1 ORDER BY version DESC',
      [minutes.id]
    )

    expect(versions.rows.map((r) => r.version)).toEqual([2, 1])
  })

  it('rejects PUT with a body over 256 KB (413)', async () => {
    const minutes = await fetchMinutes(baseMeeting.id, organizerUser.id)
    const oversized = 'a'.repeat(257 * 1024)

    const { nextError } = await runHandler(
      updateMinutesHandler,
      buildRequest({
        params: { id: minutes.id },
        body: { body: oversized },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(413)
    expect(nextError.message).toMatch(/256 KB/)
  })

  it('returns 403 when a non-participant tries to PUT', async () => {
    const minutes = await fetchMinutes(baseMeeting.id, organizerUser.id)

    const { nextError } = await runHandler(
      updateMinutesHandler,
      buildRequest({
        params: { id: minutes.id },
        body: { body: '# Sneaky' },
        user: { id: bobUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(403)
    expect(nextError.message).toMatch(/Only meeting participants/)
  })

  it('returns 403 when PUTting minutes for an archived meeting', async () => {
    const minutes = await fetchMinutes(baseMeeting.id, organizerUser.id)

    for (const target of ['in_progress', 'completed', 'archived']) {
      const stepRes = await runHandler(
        updateMeetingHandler,
        buildRequest({
          params: { id: baseMeeting.id },
          body: { status: target },
          user: { id: organizerUser.id },
        })
      )

      expect(stepRes.nextError).toBeUndefined()
      expect(stepRes.res.body.meeting.status).toBe(target)
    }

    const { nextError } = await runHandler(
      updateMinutesHandler,
      buildRequest({
        params: { id: minutes.id },
        body: { body: '# After archive' },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(403)
    expect(nextError.message).toMatch(/archived/)
  })

  it('returns 404 when PUTting an unknown minutes id', async () => {
    const unknownId = '00000000-0000-0000-0000-000000000099'

    const { nextError } = await runHandler(
      updateMinutesHandler,
      buildRequest({
        params: { id: unknownId },
        body: { body: '# nope' },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(404)
  })

  it('rejects a PUT whose body field is not a string', async () => {
    const minutes = await fetchMinutes(baseMeeting.id, organizerUser.id)

    const { nextError } = await runHandler(
      updateMinutesHandler,
      buildRequest({
        params: { id: minutes.id },
        body: { body: 123 },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(400)
    expect(nextError.message).toMatch(/body must be a string/)
  })
})
