import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, beforeAll, beforeEach, afterAll, it, expect, jest } from '@jest/globals'
import { parse } from 'dotenv'

import { runMigrations } from '../db/migrate.js'
import { closePool, query } from '../db/postgres.js'
import { create, getOne, list, remove, update } from '../controllers/meeting-controller.js'
import { getForMeeting, updateForMeeting } from '../controllers/minute-controller.js'
import { buildLinkHeader } from '../middleware/pagination.js'
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
  app,
  baseUrl = '/api/meetings',
  reqPath = '/',
} = {}) => ({
  body,
  params,
  query: queryParams,
  user,
  app,
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

let testUser
let outsiderUser

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

  testUser = await createUser({
    name: 'Test Organizer',
    email: 'organizer@example.com',
    passwordHash: 'fake-hash-not-used',
    role: 'staff',
    department: 'engineering',
  })

  outsiderUser = await createUser({
    name: 'Meeting Outsider',
    email: 'meeting-outsider@example.com',
    passwordHash: 'fake-hash-not-used',
    role: 'staff',
    department: 'engineering',
  })
})

afterAll(async () => {
  if (!runDatabaseTests) {
    return
  }

  await closePool()
})

const dbDescribe = runDatabaseTests ? describe : describe.skip

const baseCreateBody = (overrides = {}) => ({
  title: 'Sprint Planning',
  description: 'Plan the next sprint',
  startsAt: '2026-05-01T09:00:00+10:00',
  endsAt: '2026-05-01T10:00:00+10:00',
  timezoneName: 'Australia/Brisbane',
  location: 'Room A',
  status: 'scheduled',
  ...overrides,
})

const createMeetingViaController = async (overrides = {}, app) => {
  const req = buildRequest({
    body: baseCreateBody(overrides),
    user: { id: testUser.id },
    app,
  })
  const { res, nextError } = await runHandler(create, req)
  expect(nextError).toBeUndefined()
  expect(res.statusCode).toBe(201)
  return res.body.meeting
}

dbDescribe('Meeting controller (DB-backed)', () => {
  it('creates a meeting and normalises datetimes to UTC while preserving timezoneName', async () => {
    const meeting = await createMeetingViaController()

    expect(meeting.id).toEqual(expect.any(String))
    expect(meeting.title).toBe('Sprint Planning')
    expect(meeting.timezoneName).toBe('Australia/Brisbane')
    expect(meeting.createdBy).toBe(testUser.id)
    expect(meeting.status).toBe('scheduled')
    expect(meeting.fileCount).toBe(0)

    expect(new Date(meeting.startsAt).toISOString()).toBe(
      new Date('2026-05-01T09:00:00+10:00').toISOString()
    )
    expect(new Date(meeting.endsAt).toISOString()).toBe(
      new Date('2026-05-01T10:00:00+10:00').toISOString()
    )
  })

  it('delivers a sequence-zero calendar event after direct creation', async () => {
    const deliverMeetingCalendar = jest.fn().mockResolvedValue({ sentCount: 1, failedCount: 0 })
    const meeting = await createMeetingViaController({}, { locals: { deliverMeetingCalendar } })

    expect(meeting.calendarSequence).toBe(0)
    expect(deliverMeetingCalendar).toHaveBeenCalledWith({ meeting, action: 'created' })
  })

  it('keeps a created meeting when calendar delivery fails', async () => {
    const deliveryError = Object.assign(new Error('provider unavailable'), {
      code: 'EMAIL_PROVIDER_ERROR',
    })
    const deliverMeetingCalendar = jest.fn().mockRejectedValue(deliveryError)
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const meeting = await createMeetingViaController({}, { locals: { deliverMeetingCalendar } })

      expect(meeting.id).toEqual(expect.any(String))
      expect(consoleError).toHaveBeenCalledWith('Meeting calendar delivery failed', {
        meetingId: meeting.id,
        action: 'created',
        code: 'EMAIL_PROVIDER_ERROR',
        message: 'provider unavailable',
      })
    } finally {
      consoleError.mockRestore()
    }
  })

  it('rejects creation when endsAt is not after startsAt', async () => {
    const req = buildRequest({
      body: baseCreateBody({
        startsAt: '2026-05-01T10:00:00+10:00',
        endsAt: '2026-05-01T10:00:00+10:00',
      }),
      user: { id: testUser.id },
    })
    const { nextError } = await runHandler(create, req)

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(400)
    expect(nextError.message).toMatch(/endsAt/)
  })

  it('rejects creation with an invalid IANA timezone name', async () => {
    const req = buildRequest({
      body: baseCreateBody({ timezoneName: 'Mars/Olympus' }),
      user: { id: testUser.id },
    })
    const { nextError } = await runHandler(create, req)

    expect(nextError).toBeDefined()
    expect(nextError.statusCode).toBe(400)
    expect(nextError.message).toMatch(/timezoneName/)
  })

  it('returns a meeting by id and 404 when missing', async () => {
    const created = await createMeetingViaController()

    const found = await runHandler(
      getOne,
      buildRequest({ params: { id: created.id }, user: { id: testUser.id } })
    )

    expect(found.nextError).toBeUndefined()
    expect(found.res.body.meeting.id).toBe(created.id)

    const missing = await runHandler(
      getOne,
      buildRequest({
        params: { id: '00000000-0000-0000-0000-000000000000' },
        user: { id: testUser.id },
      })
    )

    expect(missing.nextError).toBeDefined()
    expect(missing.nextError.statusCode).toBe(404)
  })

  it('rejects meeting detail access when caller is not a participant', async () => {
    const created = await createMeetingViaController()

    const result = await runHandler(
      getOne,
      buildRequest({ params: { id: created.id }, user: { id: outsiderUser.id } })
    )

    expect(result.nextError).toBeDefined()
    expect(result.nextError.statusCode).toBe(403)
    expect(result.nextError.message).toMatch(/Only meeting participants/)
  })

  it('includes meeting file summaries in list and detail responses', async () => {
    const created = await createMeetingViaController()
    await query(
      `
        INSERT INTO meeting_files
          (meeting_id, uploaded_by, file_name, mime_type, size_bytes, object_key)
        VALUES
          ($1, $2, 'agenda.pdf', 'application/pdf', 1024, $3),
          ($1, $2, 'minutes.md', 'text/markdown', 2048, $4)
      `,
      [
        created.id,
        testUser.id,
        `meetings/${created.id}/agenda.pdf`,
        `meetings/${created.id}/minutes.md`,
      ]
    )

    const found = await runHandler(
      getOne,
      buildRequest({ params: { id: created.id }, user: { id: testUser.id } })
    )
    expect(found.nextError).toBeUndefined()
    expect(found.res.body.meeting.fileCount).toBe(2)
    expect(found.res.body.meeting.fileNames).toEqual(['agenda.pdf', 'minutes.md'])

    const listed = await runHandler(list, buildRequest({ user: { id: testUser.id } }))
    expect(listed.nextError).toBeUndefined()
    expect(listed.res.body.meetings).toHaveLength(1)
    expect(listed.res.body.meetings[0].fileCount).toBe(2)
    expect(listed.res.body.meetings[0].fileNames).toEqual(['agenda.pdf', 'minutes.md'])
  })

  it('includes participant summaries in list and detail responses', async () => {
    const created = await createMeetingViaController()
    const attendeeNames = ['Attendee Alpha', 'Attendee Beta', 'Attendee Gamma', 'Attendee Omega']
    const attendees = []

    for (const [index, name] of attendeeNames.entries()) {
      attendees.push(
        await createUser({
          name,
          email: `attendee-${index}@example.com`,
          passwordHash: 'fake-hash-not-used',
          role: 'staff',
          department: 'engineering',
        })
      )
    }

    await query(
      `
        INSERT INTO meeting_participants (meeting_id, user_id, role, added_by)
        SELECT $1, UNNEST($2::uuid[]), 'attendee', $3
      `,
      [created.id, attendees.map((attendee) => attendee.id), testUser.id]
    )

    const found = await runHandler(
      getOne,
      buildRequest({ params: { id: created.id }, user: { id: testUser.id } })
    )
    expect(found.nextError).toBeUndefined()
    expect(found.res.body.meeting.participantCount).toBe(5)
    expect(found.res.body.meeting.participantNames).toEqual([
      'Attendee Alpha',
      'Attendee Beta',
      'Attendee Gamma',
    ])

    const listed = await runHandler(list, buildRequest({ user: { id: testUser.id } }))
    expect(listed.nextError).toBeUndefined()
    expect(listed.res.body.meetings[0].participantCount).toBe(5)
    expect(listed.res.body.meetings[0].participantNames).toEqual([
      'Attendee Alpha',
      'Attendee Beta',
      'Attendee Gamma',
    ])
  })

  it('lists meetings filtered by status, from, and to', async () => {
    await createMeetingViaController({
      title: 'Past completed',
      startsAt: '2026-04-01T09:00:00+10:00',
      endsAt: '2026-04-01T10:00:00+10:00',
      status: 'completed',
    })

    await createMeetingViaController({
      title: 'Upcoming planning',
      startsAt: '2026-05-01T09:00:00+10:00',
      endsAt: '2026-05-01T10:00:00+10:00',
      status: 'scheduled',
    })

    await createMeetingViaController({
      title: 'Marketing chat',
      startsAt: '2026-05-02T09:00:00+10:00',
      endsAt: '2026-05-02T10:00:00+10:00',
      status: 'scheduled',
    })

    const byStatus = await runHandler(
      list,
      buildRequest({ query: { status: 'completed' }, user: { id: testUser.id } })
    )
    expect(byStatus.res.body.meetings.map((m) => m.title)).toEqual(['Past completed'])

    const byFrom = await runHandler(
      list,
      buildRequest({
        query: { from: new Date('2026-04-15T00:00:00Z').toISOString() },
        user: { id: testUser.id },
      })
    )
    expect(byFrom.res.body.meetings.map((m) => m.title)).toEqual([
      'Upcoming planning',
      'Marketing chat',
    ])

    const byTo = await runHandler(
      list,
      buildRequest({
        query: { to: new Date('2026-04-15T00:00:00Z').toISOString() },
        user: { id: testUser.id },
      })
    )
    expect(byTo.res.body.meetings.map((m) => m.title)).toEqual(['Past completed'])
  })

  it('emits pagination headers and preserves filter query params in link URLs', async () => {
    for (let i = 0; i < 3; i += 1) {
      const day = String(i + 1).padStart(2, '0')
      await createMeetingViaController({
        title: `Meeting ${i + 1}`,
        startsAt: `2026-06-${day}T09:00:00+10:00`,
        endsAt: `2026-06-${day}T10:00:00+10:00`,
        status: 'scheduled',
      })
    }

    const page1 = await runHandler(
      list,
      buildRequest({
        query: { page: 1, limit: 2, status: 'scheduled' },
        user: { id: testUser.id },
      })
    )

    expect(page1.res.headers['X-Total-Count']).toBe('3')
    expect(page1.res.body.meetings).toHaveLength(2)

    const page1Link = page1.res.headers['Link']
    expect(page1Link).toContain('rel="first"')
    expect(page1Link).toContain('rel="last"')
    expect(page1Link).toContain('rel="next"')
    expect(page1Link).not.toContain('rel="prev"')
    expect(page1Link).toContain('status=scheduled')
    expect(page1Link).toContain('limit=2')

    const page2 = await runHandler(
      list,
      buildRequest({
        query: { page: 2, limit: 2, status: 'scheduled' },
        user: { id: testUser.id },
      })
    )

    expect(page2.res.body.meetings).toHaveLength(1)
    const page2Link = page2.res.headers['Link']
    expect(page2Link).toContain('rel="first"')
    expect(page2Link).toContain('rel="last"')
    expect(page2Link).toContain('rel="prev"')
    expect(page2Link).not.toContain('rel="next"')
    expect(page2Link).toContain('status=scheduled')
  })

  it('updates only the provided fields and bumps updated_at', async () => {
    const created = await createMeetingViaController()

    const result = await runHandler(
      update,
      buildRequest({
        params: { id: created.id },
        body: { title: 'Renamed planning', status: 'completed' },
        user: { id: testUser.id },
      })
    )

    expect(result.nextError).toBeUndefined()
    expect(result.res.body.meeting.title).toBe('Renamed planning')
    expect(result.res.body.meeting.status).toBe('completed')
    expect(result.res.body.meeting.description).toBe(created.description)
    expect(new Date(result.res.body.meeting.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(created.updatedAt).getTime()
    )
  })

  it('filters by full-text q against title and description', async () => {
    await createMeetingViaController({
      title: 'Quarterly budget review',
      description: 'Finance team walkthrough',
    })
    await createMeetingViaController({
      title: 'Engineering sprint planning',
      description: 'Plan the next two-week cycle',
    })
    await createMeetingViaController({
      title: 'Customer onboarding sync',
      description: 'Discuss budget allocations for new accounts',
    })

    const matchTitle = await runHandler(
      list,
      buildRequest({ query: { q: 'planning' }, user: { id: testUser.id } })
    )

    expect(matchTitle.nextError).toBeUndefined()
    expect(matchTitle.res.body.meetings).toHaveLength(1)
    expect(matchTitle.res.body.meetings[0].title).toBe('Engineering sprint planning')

    const matchBoth = await runHandler(
      list,
      buildRequest({ query: { q: 'budget' }, user: { id: testUser.id } })
    )

    expect(matchBoth.nextError).toBeUndefined()
    expect(matchBoth.res.body.meetings).toHaveLength(2)

    const noMatch = await runHandler(
      list,
      buildRequest({ query: { q: 'unicorn' }, user: { id: testUser.id } })
    )

    expect(noMatch.nextError).toBeUndefined()
    expect(noMatch.res.body.meetings).toEqual([])
  })

  it('filters q with full-text search against uploaded file names', async () => {
    const matchingMeeting = await createMeetingViaController({
      title: 'Policy working group',
      description: 'Department process updates',
    })
    await createMeetingViaController({
      title: 'Finance handover',
      description: 'Quarterly reports',
    })

    await query(
      `
        INSERT INTO meeting_files
          (meeting_id, uploaded_by, file_name, mime_type, size_bytes, object_key)
        VALUES
          ($1, $2, 'cabinet-brief-final.pdf', 'application/pdf', 1024, $3)
      `,
      [matchingMeeting.id, testUser.id, `meetings/${matchingMeeting.id}/cabinet-brief-final.pdf`]
    )

    const result = await runHandler(
      list,
      buildRequest({ query: { q: 'brief-final' }, user: { id: testUser.id } })
    )

    expect(result.nextError).toBeUndefined()
    expect(result.res.body.meetings).toHaveLength(1)
    expect(result.res.body.meetings[0].title).toBe('Policy working group')
    expect(result.res.body.meetings[0].fileNames).toEqual(['cabinet-brief-final.pdf'])

    const multiTokenResult = await runHandler(
      list,
      buildRequest({ query: { q: 'cabinet final' }, user: { id: testUser.id } })
    )

    expect(multiTokenResult.nextError).toBeUndefined()
    expect(multiTokenResult.res.body.meetings).toHaveLength(1)
    expect(multiTokenResult.res.body.meetings[0].title).toBe('Policy working group')
  })

  it('applies english-language stemming for q (plan matches planning)', async () => {
    await createMeetingViaController({ title: 'Engineering sprint planning' })

    const result = await runHandler(
      list,
      buildRequest({ query: { q: 'plan' }, user: { id: testUser.id } })
    )

    expect(result.nextError).toBeUndefined()
    expect(result.res.body.meetings).toHaveLength(1)
  })

  it('combines q with status filters', async () => {
    await createMeetingViaController({
      title: 'Finance budget review',
      status: 'completed',
    })
    await createMeetingViaController({
      title: 'Engineering budget review',
      status: 'scheduled',
    })

    const result = await runHandler(
      list,
      buildRequest({
        query: { q: 'budget', status: 'scheduled' },
        user: { id: testUser.id },
      })
    )

    expect(result.nextError).toBeUndefined()
    expect(result.res.body.meetings).toHaveLength(1)
    expect(result.res.body.meetings[0].title).toBe('Engineering budget review')
  })

  it('rejects q longer than 200 characters with 400', async () => {
    const result = await runHandler(
      list,
      buildRequest({ query: { q: 'a'.repeat(201) }, user: { id: testUser.id } })
    )

    expect(result.nextError).toBeDefined()
    expect(result.nextError.statusCode).toBe(400)
  })

  it('walks the full status workflow: scheduled → completed → archived', async () => {
    const created = await createMeetingViaController()

    const steps = ['completed', 'archived']

    for (const target of steps) {
      const result = await runHandler(
        update,
        buildRequest({
          params: { id: created.id },
          body: { status: target },
          user: { id: testUser.id },
        })
      )

      expect(result.nextError).toBeUndefined()
      expect(result.res.body.meeting.status).toBe(target)
    }
  })

  it('increments calendar sequence only for material calendar updates', async () => {
    const created = await createMeetingViaController()
    const deliverMeetingCalendar = jest.fn().mockResolvedValue({ sentCount: 1, failedCount: 0 })
    const app = { locals: { deliverMeetingCalendar } }

    const titleUpdate = await runHandler(
      update,
      buildRequest({
        params: { id: created.id },
        body: { title: 'Updated Sprint Planning' },
        user: { id: testUser.id },
        app,
      })
    )

    expect(titleUpdate.nextError).toBeUndefined()
    expect(titleUpdate.res.body.meeting.calendarSequence).toBe(1)
    expect(deliverMeetingCalendar).toHaveBeenLastCalledWith({
      meeting: titleUpdate.res.body.meeting,
      action: 'updated',
    })

    deliverMeetingCalendar.mockClear()
    const sameTitleUpdate = await runHandler(
      update,
      buildRequest({
        params: { id: created.id },
        body: { title: 'Updated Sprint Planning' },
        user: { id: testUser.id },
        app,
      })
    )

    expect(sameTitleUpdate.nextError).toBeUndefined()
    expect(sameTitleUpdate.res.body.meeting.calendarSequence).toBe(1)
    expect(deliverMeetingCalendar).not.toHaveBeenCalled()
  })

  it('rejects meeting updates from non-organizers', async () => {
    const created = await createMeetingViaController()
    const result = await runHandler(
      update,
      buildRequest({
        params: { id: created.id },
        body: { title: 'Unauthorized update' },
        user: { id: outsiderUser.id },
      })
    )

    expect(result.nextError).toEqual(
      expect.objectContaining({
        statusCode: 403,
        message: 'Only meeting organizers can update this meeting',
      })
    )
  })

  it('allows cancelling from scheduled and then archiving', async () => {
    const created = await createMeetingViaController()
    const deliverMeetingCalendar = jest.fn().mockResolvedValue({ sentCount: 1, failedCount: 0 })
    const app = { locals: { deliverMeetingCalendar } }

    const cancelRes = await runHandler(
      update,
      buildRequest({
        params: { id: created.id },
        body: { status: 'cancelled' },
        user: { id: testUser.id },
        app,
      })
    )

    expect(cancelRes.nextError).toBeUndefined()
    expect(cancelRes.res.body.meeting.status).toBe('cancelled')
    expect(cancelRes.res.body.meeting.calendarSequence).toBe(1)
    expect(deliverMeetingCalendar).toHaveBeenLastCalledWith({
      meeting: cancelRes.res.body.meeting,
      action: 'cancelled',
    })

    deliverMeetingCalendar.mockClear()

    const archiveRes = await runHandler(
      update,
      buildRequest({
        params: { id: created.id },
        body: { status: 'archived' },
        user: { id: testUser.id },
        app,
      })
    )

    expect(archiveRes.nextError).toBeUndefined()
    expect(archiveRes.res.body.meeting.status).toBe('archived')
    expect(archiveRes.res.body.meeting.calendarSequence).toBe(1)
    expect(deliverMeetingCalendar).not.toHaveBeenCalled()
  })

  it('rejects invalid status transitions with 400', async () => {
    const created = await createMeetingViaController()

    const cases = [
      { from: 'scheduled', to: 'archived' },
      { from: 'completed', to: 'scheduled' },
    ]

    for (const { from, to } of cases) {
      if (from !== 'scheduled') {
        await query('UPDATE meetings SET status = $1 WHERE id = $2', [from, created.id])
      }

      const result = await runHandler(
        update,
        buildRequest({
          params: { id: created.id },
          body: { status: to },
          user: { id: testUser.id },
        })
      )

      expect(result.nextError).toBeDefined()
      expect(result.nextError.statusCode).toBe(400)
      expect(result.nextError.message).toMatch(/Invalid status transition/)
    }
  })

  it('treats same-status updates as a no-op (200)', async () => {
    const created = await createMeetingViaController()

    const result = await runHandler(
      update,
      buildRequest({
        params: { id: created.id },
        body: { status: 'scheduled' },
        user: { id: testUser.id },
      })
    )

    expect(result.nextError).toBeUndefined()
    expect(result.res.body.meeting.status).toBe('scheduled')
  })

  it('treats archived as terminal — any transition out is rejected', async () => {
    const created = await createMeetingViaController()

    await query('UPDATE meetings SET status = $1 WHERE id = $2', ['archived', created.id])

    const result = await runHandler(
      update,
      buildRequest({
        params: { id: created.id },
        body: { status: 'scheduled' },
        user: { id: testUser.id },
      })
    )

    expect(result.nextError).toBeDefined()
    expect(result.nextError.statusCode).toBe(400)
  })

  it('deletes a meeting and returns 404 on subsequent fetch', async () => {
    const created = await createMeetingViaController()

    const deleteRes = await runHandler(
      remove,
      buildRequest({ params: { id: created.id }, user: { id: testUser.id } })
    )

    expect(deleteRes.nextError).toBeUndefined()
    expect(deleteRes.res.statusCode).toBe(204)
    expect(deleteRes.res.ended).toBe(true)

    const fetchRes = await runHandler(
      getOne,
      buildRequest({ params: { id: created.id }, user: { id: testUser.id } })
    )

    expect(fetchRes.nextError).toBeDefined()
    expect(fetchRes.nextError.statusCode).toBe(404)
  })

  it('eagerly creates minutes for a meeting and updates moved minutes fields', async () => {
    const created = await createMeetingViaController()

    const getResult = await runHandler(
      getForMeeting,
      buildRequest({
        params: { meetingId: created.id },
        user: { id: testUser.id },
      })
    )

    expect(getResult.nextError).toBeUndefined()
    expect(getResult.res.body.minutes.meetingId).toBe(created.id)
    expect(getResult.res.body.minutes.content).toBe('')

    const updateResult = await runHandler(
      updateForMeeting,
      buildRequest({
        params: {
          meetingId: created.id,
          minutesId: getResult.res.body.minutes.id,
        },
        body: {
          content: 'Reviewed delivery risk.',
          keyDiscussions: 'Timeline risk',
          decisions: 'Keep current milestone scope.',
          facilitatorId: testUser.id,
          recorderId: testUser.id,
        },
        user: { id: testUser.id },
      })
    )

    expect(updateResult.nextError).toBeUndefined()
    expect(updateResult.res.body.minutes.content).toBe('Reviewed delivery risk.')
    expect(updateResult.res.body.minutes.keyDiscussions).toBe('Timeline risk')
    expect(updateResult.res.body.minutes.decisions).toBe('Keep current milestone scope.')
    expect(updateResult.res.body.minutes.facilitatorId).toBe(testUser.id)
    expect(updateResult.res.body.minutes.recorderId).toBe(testUser.id)
    expect(updateResult.res.body.minutes.version).toBe(2)
  })

  it('returns 404 when updating an unknown minutes id for a meeting', async () => {
    const created = await createMeetingViaController()

    const result = await runHandler(
      updateForMeeting,
      buildRequest({
        params: {
          meetingId: created.id,
          minutesId: '00000000-0000-0000-0000-000000000000',
        },
        body: { content: 'Updated content' },
        user: { id: testUser.id },
      })
    )

    expect(result.nextError).toBeDefined()
    expect(result.nextError.statusCode).toBe(404)
    expect(result.nextError.message).toBe('Minutes not found')
  })
})

describe('buildLinkHeader', () => {
  const baseReq = (queryParams = {}) => ({
    protocol: 'http',
    baseUrl: '/api/meetings',
    path: '/',
    query: queryParams,
    get(headerName) {
      if (headerName.toLowerCase() === 'host') {
        return 'localhost:3000'
      }

      return undefined
    },
  })

  it('always includes first and last; omits prev on page 1 and next on the last page', async () => {
    const onlyPage = buildLinkHeader({
      req: baseReq({ page: 1, limit: 10 }),
      page: 1,
      limit: 10,
      total: 0,
    })
    expect(onlyPage).toContain('rel="first"')
    expect(onlyPage).toContain('rel="last"')
    expect(onlyPage).not.toContain('rel="prev"')
    expect(onlyPage).not.toContain('rel="next"')

    const lastPage = buildLinkHeader({
      req: baseReq({ page: 2, limit: 10 }),
      page: 2,
      limit: 10,
      total: 20,
    })
    expect(lastPage).toContain('rel="prev"')
    expect(lastPage).not.toContain('rel="next"')
  })

  it('preserves existing filter query params in the generated URLs', () => {
    const link = buildLinkHeader({
      req: baseReq({ page: 1, limit: 5, status: 'scheduled' }),
      page: 1,
      limit: 5,
      total: 12,
    })

    expect(link).toContain('status=scheduled')
    expect(link).toContain('limit=5')
  })
})
