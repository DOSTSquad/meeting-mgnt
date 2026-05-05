import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'
import { parse } from 'dotenv'

import { closePool, query } from '../db/postgres.js'
import { runMigrations } from '../db/migrate.js'
import {
  confirm,
  create,
  getInviteeDetail,
  getOne,
  replaceInvitees,
  replaceTimeOptions,
  submitAvailability,
} from '../controllers/meeting-request-controller.js'
import { createUser } from '../repositories/user-repository.js'
import { getDashboardData } from '../services/dashboard-service.js'
import { createMeetingForUser } from '../services/meeting-service.js'

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
  status(code) {
    this.statusCode = code
    return this
  },
  json(payload) {
    this.body = payload
    return this
  },
})

const buildRequest = ({ body = {}, params = {}, user } = {}) => ({
  body,
  params,
  user,
})

const runHandler = async (handler, req) => {
  const res = createResponseRecorder()
  let nextError

  await handler(req, res, (error) => {
    nextError = error
  })

  return { res, nextError }
}

const createTestUser = async (suffix) =>
  createUser({
    name: `Meeting Request ${suffix}`,
    email: `meeting-request-${suffix}-${Date.now()}@example.test`,
    passwordHash: 'hashed-password',
  })

describe('meeting request flow', () => {
  let creator
  let invitee
  let outsider

  beforeAll(async () => {
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

    creator = await createTestUser('creator')
    invitee = await createTestUser('invitee')
    outsider = await createTestUser('outsider')
  })

  afterAll(async () => {
    await closePool()
  })

  it('creates a request, records binary availability, and confirms a meeting', async () => {
    if (!runDatabaseTests) {
      return
    }

    const createResult = await runHandler(
      create,
      buildRequest({
        user: { id: creator.id },
        body: {
          title: 'Quarterly review',
          description: 'Review delivery health',
          durationMinutes: 60,
          timezoneName: 'Australia/Brisbane',
          responseDeadline: '2026-05-08T17:00:00+10:00',
        },
      })
    )
    expect(createResult.nextError).toBeUndefined()
    expect(createResult.res.statusCode).toBe(201)
    const requestId = createResult.res.body.meetingRequest.id

    const optionsResult = await runHandler(
      replaceTimeOptions,
      buildRequest({
        user: { id: creator.id },
        params: { requestId },
        body: {
          timeOptions: [
            {
              startsAt: '2026-05-12T09:00:00+10:00',
              endsAt: '2026-05-12T10:00:00+10:00',
            },
          ],
        },
      })
    )
    expect(optionsResult.nextError).toBeUndefined()
    const timeOptionId = optionsResult.res.body.timeOptions[0].id

    const inviteesResult = await runHandler(
      replaceInvitees,
      buildRequest({
        user: { id: creator.id },
        params: { requestId },
        body: { invitees: [{ email: invitee.email }] },
      })
    )
    expect(inviteesResult.nextError).toBeUndefined()
    const inviteeId = inviteesResult.res.body.invitees[0].id

    const pendingDashboard = await getDashboardData(creator.id)
    expect(pendingDashboard.pendingMeetingRequests).toHaveLength(1)
    expect(pendingDashboard.pendingMeetingRequests[0]).toMatchObject({
      id: requestId,
      title: 'Quarterly review',
      status: 'collecting_availability',
      inviteeCounts: {
        submitted: 0,
        pending: 1,
        total: 1,
      },
      timeOptionCount: 1,
    })

    const inviteeDashboard = await getDashboardData(invitee.id)
    expect(inviteeDashboard.pendingAvailabilityRequests).toHaveLength(1)
    expect(inviteeDashboard.pendingAvailabilityRequests[0]).toMatchObject({
      id: requestId,
      inviteeId,
      title: 'Quarterly review',
      responseStatus: 'pending',
      timeOptionCount: 1,
      inviteeCounts: {
        submitted: 0,
        pending: 1,
        total: 1,
      },
    })

    const inviteeDetailResult = await runHandler(
      getInviteeDetail,
      buildRequest({ user: { id: invitee.id }, params: { requestId, inviteeId } })
    )
    expect(inviteeDetailResult.nextError).toBeUndefined()
    expect(inviteeDetailResult.res.body.invitee.id).toBe(inviteeId)
    expect(inviteeDetailResult.res.body.timeOptions[0]).toMatchObject({
      id: timeOptionId,
      availableCount: 0,
      notRespondedCount: 1,
    })
    expect(inviteeDetailResult.res.body.responses).toEqual([])

    const outsiderDetailResult = await runHandler(
      getInviteeDetail,
      buildRequest({ user: { id: outsider.id }, params: { requestId, inviteeId } })
    )
    expect(outsiderDetailResult.nextError.statusCode).toBe(403)

    const availabilityResult = await runHandler(
      submitAvailability,
      buildRequest({
        user: { id: invitee.id },
        params: { requestId, inviteeId },
        body: { responses: [{ timeOptionId, isAvailable: true }] },
      })
    )
    expect(availabilityResult.nextError).toBeUndefined()
    expect(availabilityResult.res.body.responses[0].isAvailable).toBe(true)

    const completedInviteeDashboard = await getDashboardData(invitee.id)
    expect(completedInviteeDashboard.pendingAvailabilityRequests).toHaveLength(0)

    const detailResult = await runHandler(
      getOne,
      buildRequest({ user: { id: creator.id }, params: { requestId } })
    )
    expect(detailResult.res.body.timeOptions[0].availableCount).toBe(1)
    expect(detailResult.res.body.timeOptions[0].notRespondedCount).toBe(0)

    const confirmResult = await runHandler(
      confirm,
      buildRequest({
        user: { id: creator.id },
        params: { requestId },
        body: { timeOptionId, location: 'Room 4.1', tag: 'Operations' },
      })
    )
    expect(confirmResult.nextError).toBeUndefined()
    expect(confirmResult.res.statusCode).toBe(201)
    expect(confirmResult.res.body.meeting.title).toBe('Quarterly review')
    expect(confirmResult.res.body.meetingRequest.status).toBe('confirmed')

    const participants = await query(
      'SELECT user_id FROM meeting_participants WHERE meeting_id = $1 ORDER BY user_id',
      [confirmResult.res.body.meeting.id]
    )
    expect(participants.rows.map((row) => row.user_id).sort()).toEqual(
      [creator.id, invitee.id].sort()
    )
  })

  it('rejects non-boolean availability values', async () => {
    if (!runDatabaseTests) {
      return
    }

    const createResult = await runHandler(
      create,
      buildRequest({
        user: { id: creator.id },
        body: {
          title: 'Binary availability only',
          durationMinutes: 60,
          timezoneName: 'Australia/Brisbane',
        },
      })
    )
    const requestId = createResult.res.body.meetingRequest.id

    const optionsResult = await runHandler(
      replaceTimeOptions,
      buildRequest({
        user: { id: creator.id },
        params: { requestId },
        body: {
          timeOptions: [
            {
              startsAt: '2026-05-12T09:00:00+10:00',
              endsAt: '2026-05-12T10:00:00+10:00',
            },
          ],
        },
      })
    )
    const timeOptionId = optionsResult.res.body.timeOptions[0].id

    const inviteesResult = await runHandler(
      replaceInvitees,
      buildRequest({
        user: { id: creator.id },
        params: { requestId },
        body: { invitees: [{ email: invitee.email }] },
      })
    )
    const inviteeId = inviteesResult.res.body.invitees[0].id

    const availabilityResult = await runHandler(
      submitAvailability,
      buildRequest({
        user: { id: invitee.id },
        params: { requestId, inviteeId },
        body: { responses: [{ timeOptionId, isAvailable: 'maybe' }] },
      })
    )

    expect(availabilityResult.nextError.statusCode).toBe(400)
    expect(availabilityResult.nextError.message).toMatch(/isAvailable must be boolean/)
  })

  it('returns upcoming dashboard meetings by earliest start time', async () => {
    if (!runDatabaseTests) {
      return
    }

    const dateFromNow = (days, hours = 0) =>
      new Date(Date.now() + days * 24 * 60 * 60 * 1000 + hours * 60 * 60 * 1000).toISOString()

    await createMeetingForUser(
      {
        title: 'Past dashboard meeting',
        startsAt: dateFromNow(-2),
        endsAt: dateFromNow(-2, 1),
        timezoneName: 'UTC',
      },
      creator.id
    )
    await createMeetingForUser(
      {
        title: 'Later dashboard meeting',
        startsAt: dateFromNow(5),
        endsAt: dateFromNow(5, 1),
        timezoneName: 'UTC',
      },
      creator.id
    )
    await createMeetingForUser(
      {
        title: 'Earlier dashboard meeting',
        startsAt: dateFromNow(2),
        endsAt: dateFromNow(2, 1),
        timezoneName: 'UTC',
      },
      creator.id
    )

    const dashboard = await getDashboardData(creator.id)

    expect(dashboard.recentMeetings.map((meeting) => meeting.title)).toEqual([
      'Earlier dashboard meeting',
      'Later dashboard meeting',
    ])
  })

  it('rejects time options that overlap with the creator existing meetings', async () => {
    if (!runDatabaseTests) {
      return
    }

    await createMeetingForUser(
      {
        title: 'Blocked host calendar time',
        startsAt: '2026-05-12T09:30:00+10:00',
        endsAt: '2026-05-12T10:30:00+10:00',
        timezoneName: 'Australia/Brisbane',
      },
      creator.id
    )

    const createResult = await runHandler(
      create,
      buildRequest({
        user: { id: creator.id },
        body: {
          title: 'Should avoid host conflicts',
          durationMinutes: 60,
          timezoneName: 'Australia/Brisbane',
        },
      })
    )
    const requestId = createResult.res.body.meetingRequest.id

    const optionsResult = await runHandler(
      replaceTimeOptions,
      buildRequest({
        user: { id: creator.id },
        params: { requestId },
        body: {
          timeOptions: [
            {
              startsAt: '2026-05-12T09:00:00+10:00',
              endsAt: '2026-05-12T10:00:00+10:00',
            },
          ],
        },
      })
    )

    expect(optionsResult.nextError.statusCode).toBe(409)
    expect(optionsResult.nextError.message).toMatch(/overlaps with existing meeting/)
  })
})
