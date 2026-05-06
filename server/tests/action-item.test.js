import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, beforeAll, beforeEach, afterAll, it, expect } from '@jest/globals'
import { parse } from 'dotenv'

import { runMigrations } from '../db/migrate.js'
import { closePool, query } from '../db/postgres.js'
import { create as createMeetingHandler } from '../controllers/meeting-controller.js'
import { add as addParticipantsHandler } from '../controllers/participant-controller.js'
import {
  create as createActionItemHandler,
  getOne as getActionItemHandler,
  list as listActionItemsHandler,
  remove as removeActionItemHandler,
  update as updateActionItemHandler,
} from '../controllers/action-item-controller.js'
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

dbDescribe('Action item controller (DB-backed)', () => {
  it('creates an action item as organizer with defaults', async () => {
    const { res, nextError } = await runHandler(
      createActionItemHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { title: 'Write proposal' },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeUndefined()
    expect(res.statusCode).toBe(201)
    expect(res.body.actionItem.title).toBe('Write proposal')
    expect(res.body.actionItem.status).toBe('todo')
    expect(res.body.actionItem.priority).toBe('medium')
    expect(res.body.actionItem.source).toBe('manual')
    expect(res.body.actionItem.completedAt).toBeNull()
    expect(res.body.actionItem.createdBy).toBe(organizerUser.id)
  })

  it('lists action items for a meeting including newly created items', async () => {
    await runHandler(
      createActionItemHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { title: 'Write proposal' },
        user: { id: organizerUser.id },
      })
    )

    const { res, nextError } = await runHandler(
      listActionItemsHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeUndefined()
    expect(res.body.actionItems).toHaveLength(1)
    expect(res.body.actionItems[0].title).toBe('Write proposal')
  })

  it('returns one action item detail for meeting participants', async () => {
    const created = await runHandler(
      createActionItemHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { title: 'Inspect details', description: 'Full detail body' },
        user: { id: organizerUser.id },
      })
    )

    const { res, nextError } = await runHandler(
      getActionItemHandler,
      buildRequest({
        params: { id: created.res.body.actionItem.id },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeUndefined()
    expect(res.body.actionItem).toMatchObject({
      id: created.res.body.actionItem.id,
      title: 'Inspect details',
      description: 'Full detail body',
    })
  })

  it('allows the assignee to view detail even when not a meeting participant', async () => {
    const created = await runHandler(
      createActionItemHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { title: 'Assigned detail view' },
        user: { id: organizerUser.id },
      })
    )
    await query('UPDATE action_items SET assignee_id = $1 WHERE id = $2', [
      bobUser.id,
      created.res.body.actionItem.id,
    ])

    const { res, nextError } = await runHandler(
      getActionItemHandler,
      buildRequest({
        params: { id: created.res.body.actionItem.id },
        user: { id: bobUser.id },
      })
    )

    expect(nextError).toBeUndefined()
    expect(res.body.actionItem.assigneeId).toBe(bobUser.id)
  })

  it('prevents outsiders from viewing action item detail', async () => {
    const created = await runHandler(
      createActionItemHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { title: 'Private task' },
        user: { id: organizerUser.id },
      })
    )

    const { nextError } = await runHandler(
      getActionItemHandler,
      buildRequest({
        params: { id: created.res.body.actionItem.id },
        user: { id: bobUser.id },
      })
    )

    expect(nextError?.statusCode).toBe(403)
  })

  it('filters list results by status', async () => {
    const created = await runHandler(
      createActionItemHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { title: 'To complete' },
        user: { id: organizerUser.id },
      })
    )

    await runHandler(
      createActionItemHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { title: 'Stays todo' },
        user: { id: organizerUser.id },
      })
    )

    await runHandler(
      updateActionItemHandler,
      buildRequest({
        params: { id: created.res.body.actionItem.id },
        body: { status: 'completed' },
        user: { id: organizerUser.id },
      })
    )

    const { res, nextError } = await runHandler(
      listActionItemsHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        query: { status: 'completed' },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeUndefined()
    expect(res.body.actionItems).toHaveLength(1)
    expect(res.body.actionItems[0].title).toBe('To complete')
    expect(res.body.actionItems[0].status).toBe('completed')
  })

  it('returns 403 when a non-participant tries to create', async () => {
    const { nextError } = await runHandler(
      createActionItemHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { title: 'Sneaky' },
        user: { id: bobUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(403)
    expect(nextError.message).toMatch(/Only meeting participants/)
  })

  it('returns 400 when assigneeId is unknown', async () => {
    const unknownId = '00000000-0000-0000-0000-000000000001'
    const { nextError } = await runHandler(
      createActionItemHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { title: 'Assign', assigneeId: unknownId },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(400)
    expect(nextError.message).toMatch(/Unknown assigneeId/)
  })

  it('allows a plain participant (attendee) to create', async () => {
    await addAttendee(baseMeeting.id, aliceUser.id, organizerUser.id)

    const { res, nextError } = await runHandler(
      createActionItemHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { title: 'From attendee' },
        user: { id: aliceUser.id },
      })
    )

    expect(nextError).toBeUndefined()
    expect(res.statusCode).toBe(201)
    expect(res.body.actionItem.createdBy).toBe(aliceUser.id)
  })

  it('updates title and priority', async () => {
    const created = await runHandler(
      createActionItemHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { title: 'Original' },
        user: { id: organizerUser.id },
      })
    )

    const { res, nextError } = await runHandler(
      updateActionItemHandler,
      buildRequest({
        params: { id: created.res.body.actionItem.id },
        body: { title: 'Updated', priority: 'high' },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeUndefined()
    expect(res.body.actionItem.title).toBe('Updated')
    expect(res.body.actionItem.priority).toBe('high')
  })

  it('stamps completedAt when status transitions to completed', async () => {
    const created = await runHandler(
      createActionItemHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { title: 'Finish me' },
        user: { id: organizerUser.id },
      })
    )

    expect(created.res.body.actionItem.completedAt).toBeNull()

    const { res, nextError } = await runHandler(
      updateActionItemHandler,
      buildRequest({
        params: { id: created.res.body.actionItem.id },
        body: { status: 'completed' },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeUndefined()
    expect(res.body.actionItem.status).toBe('completed')
    expect(res.body.actionItem.completedAt).not.toBeNull()
  })

  it('clears completedAt when status transitions away from completed', async () => {
    const created = await runHandler(
      createActionItemHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { title: 'Toggle' },
        user: { id: organizerUser.id },
      })
    )

    await runHandler(
      updateActionItemHandler,
      buildRequest({
        params: { id: created.res.body.actionItem.id },
        body: { status: 'completed' },
        user: { id: organizerUser.id },
      })
    )

    const { res, nextError } = await runHandler(
      updateActionItemHandler,
      buildRequest({
        params: { id: created.res.body.actionItem.id },
        body: { status: 'in_progress' },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeUndefined()
    expect(res.body.actionItem.status).toBe('in_progress')
    expect(res.body.actionItem.completedAt).toBeNull()
  })

  it('allows the assignee to update status even when not a meeting participant', async () => {
    const created = await runHandler(
      createActionItemHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { title: 'Assigned outside participant list' },
        user: { id: organizerUser.id },
      })
    )

    await query('UPDATE action_items SET assignee_id = $1 WHERE id = $2', [
      bobUser.id,
      created.res.body.actionItem.id,
    ])

    const { res, nextError } = await runHandler(
      updateActionItemHandler,
      buildRequest({
        params: { id: created.res.body.actionItem.id },
        body: { status: 'in_progress' },
        user: { id: bobUser.id },
      })
    )

    expect(nextError).toBeUndefined()
    expect(res.body.actionItem.status).toBe('in_progress')
  })

  it('prevents a non-participant assignee from editing fields other than status', async () => {
    const created = await runHandler(
      createActionItemHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { title: 'Status only for assignee' },
        user: { id: organizerUser.id },
      })
    )

    await query('UPDATE action_items SET assignee_id = $1 WHERE id = $2', [
      bobUser.id,
      created.res.body.actionItem.id,
    ])

    const { nextError } = await runHandler(
      updateActionItemHandler,
      buildRequest({
        params: { id: created.res.body.actionItem.id },
        body: { title: 'Should not update' },
        user: { id: bobUser.id },
      })
    )

    expect(nextError?.statusCode).toBe(403)
  })

  it('returns 400 when update supplies no fields', async () => {
    const created = await runHandler(
      createActionItemHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { title: 'Needs change' },
        user: { id: organizerUser.id },
      })
    )

    const { nextError } = await runHandler(
      updateActionItemHandler,
      buildRequest({
        params: { id: created.res.body.actionItem.id },
        body: {},
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(400)
    expect(nextError.message).toMatch(/No updates supplied/)
  })

  it('deletes an action item and subsequent list is empty', async () => {
    const created = await runHandler(
      createActionItemHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        body: { title: 'Going away' },
        user: { id: organizerUser.id },
      })
    )

    const deleteRes = await runHandler(
      removeActionItemHandler,
      buildRequest({
        params: { id: created.res.body.actionItem.id },
        user: { id: organizerUser.id },
      })
    )

    expect(deleteRes.nextError).toBeUndefined()
    expect(deleteRes.res.statusCode).toBe(204)
    expect(deleteRes.res.ended).toBe(true)

    const listRes = await runHandler(
      listActionItemsHandler,
      buildRequest({
        params: { meetingId: baseMeeting.id },
        user: { id: organizerUser.id },
      })
    )

    expect(listRes.res.body.actionItems).toEqual([])
  })

  it('returns 404 when deleting an unknown action item', async () => {
    const unknownId = '00000000-0000-0000-0000-000000000099'
    const { nextError } = await runHandler(
      removeActionItemHandler,
      buildRequest({
        params: { id: unknownId },
        user: { id: organizerUser.id },
      })
    )

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(404)
  })
})
