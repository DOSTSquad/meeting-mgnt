import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, beforeAll, beforeEach, afterAll, it, expect } from '@jest/globals'
import { parse } from 'dotenv'

import { runMigrations } from '../db/migrate.js'
import { getErrorResponse } from '../app.js'
import { closePool, query } from '../db/postgres.js'
import { create as createMeetingHandler } from '../controllers/meeting-controller.js'
import { add as addParticipantsHandler } from '../controllers/participant-controller.js'
import {
  getForMeeting as getMinutesHandler,
  update as updateMinutesHandler,
} from '../controllers/minutes-controller.js'
import { listVersions, updateBodyWithVersion } from '../repositories/minutes-repository.js'
import { createUser } from '../repositories/user-repository.js'
import {
  DEFAULT_MINUTES_TEMPLATE,
  MINUTES_BODY_MAX_BYTES,
  MINUTES_BODY_TOO_LARGE_MESSAGE,
} from '../services/minutes-service.js'

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

describe('Minutes app request parsing', () => {
  it('returns the minutes-specific 413 message when JSON parsing rejects an oversized update', async () => {
    const response = getErrorResponse(
      { type: 'entity.too.large', status: 413, message: 'request entity too large' },
      { method: 'PUT', path: '/api/minutes/00000000-0000-0000-0000-000000000000' }
    )

    expect(response).toEqual({
      statusCode: 413,
      message: MINUTES_BODY_TOO_LARGE_MESSAGE,
    })
  })
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

const getMinutes = async (meetingId, userId) =>
  runHandler(
    getMinutesHandler,
    buildRequest({
      params: { meetingId },
      user: { id: userId },
    })
  )

dbDescribe('Minutes controller (DB-backed)', () => {
  it('returns default minutes for a fresh meeting', async () => {
    const { res, nextError } = await getMinutes(baseMeeting.id, organizerUser.id)

    expect(nextError).toBeUndefined()
    expect(res.body.minutes.meetingId).toBe(baseMeeting.id)
    expect(res.body.minutes.body).toBe(DEFAULT_MINUTES_TEMPLATE)
    expect(res.body.minutes.createdBy).toBe(organizerUser.id)
    expect(res.body.minutes.updatedBy).toBe(organizerUser.id)
  })

  it('returns 403 for a non-participant', async () => {
    const { nextError } = await getMinutes(baseMeeting.id, bobUser.id)

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(403)
  })

  it('returns 404 for an unknown meeting id', async () => {
    const { nextError } = await getMinutes('00000000-0000-0000-0000-000000000000', organizerUser.id)

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(404)
  })

  it('updates minutes and writes a new version', async () => {
    await addAttendee(baseMeeting.id, aliceUser.id, organizerUser.id)
    const minutes = (await getMinutes(baseMeeting.id, organizerUser.id)).res.body.minutes

    const { res, nextError } = await runHandler(
      updateMinutesHandler,
      buildRequest({
        params: { id: minutes.id },
        body: { body: '# Updated notes\n\n- decided' },
        user: { id: aliceUser.id },
      })
    )

    expect(nextError).toBeUndefined()
    expect(res.body.minutes.body).toBe('# Updated notes\n\n- decided')
    expect(res.body.minutes.updatedBy).toBe(aliceUser.id)

    const versions = await listVersions(minutes.id)
    expect(versions.map((version) => version.version)).toEqual([1, 2])
    expect(versions[1].body).toBe('# Updated notes\n\n- decided')
    expect(versions[1].editedBy).toBe(aliceUser.id)
  })

  it('enforces the 256 KB body cap', async () => {
    const minutes = (await getMinutes(baseMeeting.id, organizerUser.id)).res.body.minutes

    const { nextError } = await runHandler(
      updateMinutesHandler,
      buildRequest({
        params: { id: minutes.id },
        body: { body: 'a'.repeat(MINUTES_BODY_MAX_BYTES + 1) },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(413)
    expect(nextError.message).toMatch(/meeting file/)
  })

  it('rejects updates from non-participants', async () => {
    const minutes = (await getMinutes(baseMeeting.id, organizerUser.id)).res.body.minutes

    const { nextError } = await runHandler(
      updateMinutesHandler,
      buildRequest({
        params: { id: minutes.id },
        body: { body: 'not allowed' },
        user: { id: bobUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(403)
  })

  it('rejects writes when the meeting is archived but still allows reads', async () => {
    await query('UPDATE meetings SET status = $1 WHERE id = $2', ['archived', baseMeeting.id])
    const readResult = await getMinutes(baseMeeting.id, organizerUser.id)
    const minutes = readResult.res.body.minutes

    expect(readResult.nextError).toBeUndefined()

    const { nextError } = await runHandler(
      updateMinutesHandler,
      buildRequest({
        params: { id: minutes.id },
        body: { body: 'no changes' },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(403)
  })

  it('returns 404 for an unknown minutes id', async () => {
    const { nextError } = await runHandler(
      updateMinutesHandler,
      buildRequest({
        params: { id: '00000000-0000-0000-0000-000000000000' },
        body: { body: 'missing' },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(404)
  })
})

dbDescribe('Minutes repository versioning (DB-backed)', () => {
  it('creates v1 and increments versions independently per minutes row', async () => {
    const secondMeeting = await createMeetingViaController(organizerUser, {
      title: 'Second meeting',
      startsAt: '2026-05-02T09:00:00+10:00',
      endsAt: '2026-05-02T10:00:00+10:00',
    })

    const firstMinutes = (await getMinutes(baseMeeting.id, organizerUser.id)).res.body.minutes
    const secondMinutes = (await getMinutes(secondMeeting.id, organizerUser.id)).res.body.minutes

    expect((await listVersions(firstMinutes.id)).map((version) => version.version)).toEqual([1])
    expect((await listVersions(secondMinutes.id)).map((version) => version.version)).toEqual([1])

    await updateBodyWithVersion(firstMinutes.id, 'first edit', organizerUser.id)
    await updateBodyWithVersion(firstMinutes.id, 'second edit', organizerUser.id)
    await updateBodyWithVersion(secondMinutes.id, 'other edit', organizerUser.id)

    expect((await listVersions(firstMinutes.id)).map((version) => version.version)).toEqual([
      1, 2, 3,
    ])
    expect((await listVersions(secondMinutes.id)).map((version) => version.version)).toEqual([1, 2])
  })
})
