import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { parse } from 'dotenv'

import { closePool, query } from '../db/postgres.js'
import { runMigrations } from '../db/migrate.js'
import {
  confirm,
  create,
  getInviteeDetail,
  getOne,
  getPublicInvitation,
  replaceInvitees,
  replaceTimeOptions,
  submitAvailability,
  submitPublicAvailability,
  update,
} from '../controllers/meeting-request-controller.js'
import { createUser } from '../repositories/user-repository.js'
import {
  getDashboardData,
  getNotificationsData,
  getNotificationSummaryData,
} from '../services/dashboard-service.js'
import { deliverMeetingCalendar } from '../services/meeting-calendar-service.js'
import { createMeetingForUser } from '../services/meeting-service.js'
import {
  confirmRequestForUser,
  sendInvitationsForRequest,
} from '../services/meeting-request-service.js'
import {
  archiveOneNotification,
  archiveReadNotificationsForUser,
  readAllNotifications,
  readNotification,
} from '../services/notification-service.js'

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

const dateFromNow = (days, hours = 0) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000 + hours * 60 * 60 * 1000).toISOString()

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
          tag: 'Operations',
          description: 'Review delivery health',
          durationMinutes: 60,
          timezoneName: 'Australia/Brisbane',
          responseDeadline: dateFromNow(2),
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
              startsAt: dateFromNow(7),
              endsAt: dateFromNow(7, 1),
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
      canConfirm: true,
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
        body: { timeOptionId, location: 'Room 4.1' },
      })
    )
    expect(confirmResult.nextError).toBeUndefined()
    expect(confirmResult.res.statusCode).toBe(201)
    expect(confirmResult.res.body.meeting.title).toBe('Quarterly review')
    expect(confirmResult.res.body.meeting.tag).toBe('operations')
    expect(confirmResult.res.body.meetingRequest.status).toBe('confirmed')

    const participants = await query(
      'SELECT user_id FROM meeting_participants WHERE meeting_id = $1 ORDER BY user_id',
      [confirmResult.res.body.meeting.id]
    )
    expect(participants.rows.map((row) => row.user_id).sort()).toEqual(
      [creator.id, invitee.id].sort()
    )
  })

  it('updates request details before confirmation', async () => {
    if (!runDatabaseTests) {
      return
    }

    const createResult = await runHandler(
      create,
      buildRequest({
        user: { id: creator.id },
        body: {
          title: 'Initial planning',
          tag: 'Planning',
          durationMinutes: 60,
          timezoneName: 'Asia/Manila',
          responseDeadline: dateFromNow(1),
        },
      })
    )
    expect(createResult.nextError).toBeUndefined()
    const requestId = createResult.res.body.meetingRequest.id
    const updatedDeadline = dateFromNow(2)

    const updateResult = await runHandler(
      update,
      buildRequest({
        user: { id: creator.id },
        params: { requestId },
        body: {
          title: 'Updated planning',
          tag: 'Planning',
          description: 'Duration changed after going back',
          durationMinutes: 90,
          timezoneName: 'Australia/Brisbane',
          responseDeadline: updatedDeadline,
        },
      })
    )

    expect(updateResult.nextError).toBeUndefined()
    expect(updateResult.res.body.meetingRequest).toMatchObject({
      id: requestId,
      title: 'Updated planning',
      tag: 'Planning',
      description: 'Duration changed after going back',
      durationMinutes: 90,
      timezoneName: 'Australia/Brisbane',
    })
    expect(new Date(updateResult.res.body.meetingRequest.responseDeadline).toISOString()).toBe(
      new Date(updatedDeadline).toISOString()
    )
  })

  it('creates a public invitation token without storing the raw credential', async () => {
    if (!runDatabaseTests) {
      return
    }

    const createResult = await runHandler(
      create,
      buildRequest({
        user: { id: creator.id },
        body: {
          title: 'External availability request',
          tag: 'Operations',
          durationMinutes: 60,
          timezoneName: 'Australia/Brisbane',
          responseDeadline: dateFromNow(2),
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
          timeOptions: [{ startsAt: dateFromNow(7), endsAt: dateFromNow(7, 1) }],
        },
      })
    )
    const inviteesResult = await runHandler(
      replaceInvitees,
      buildRequest({
        user: { id: creator.id },
        params: { requestId },
        body: { invitees: [{ email: 'external-invitee@example.test', name: 'External Guest' }] },
      })
    )
    const invitationToken = []

    const result = await sendInvitationsForRequest(requestId, creator.id, async (invitation) => {
      invitationToken.push(invitation.invitationToken)
      return { messageId: 'test-message' }
    })

    expect(result).toEqual({ sentCount: 1 })
    expect(invitationToken[0]).toEqual(expect.any(String))

    const storedInvitee = await query(
      `
        SELECT invitation_token_hash, invitation_expires_at, email_sent_at
        FROM meeting_request_invitees
        WHERE id = $1
      `,
      [inviteesResult.res.body.invitees[0].id]
    )
    expect(storedInvitee.rows[0].invitation_token_hash).not.toBe(invitationToken[0])
    expect(storedInvitee.rows[0].invitation_expires_at).toBeInstanceOf(Date)
    expect(storedInvitee.rows[0].email_sent_at).toBeInstanceOf(Date)

    const publicResult = await runHandler(
      getPublicInvitation,
      buildRequest({ params: { token: invitationToken[0] } })
    )

    expect(publicResult.nextError).toBeUndefined()
    expect(publicResult.res.body).toMatchObject({
      meetingRequest: { id: requestId, title: 'External availability request' },
      invitee: { email: 'external-invitee@example.test', name: 'External Guest' },
      timeOptions: [{ id: optionsResult.res.body.timeOptions[0].id }],
      responses: [],
    })

    const availabilityResult = await runHandler(
      submitPublicAvailability,
      buildRequest({
        params: { token: invitationToken[0] },
        body: {
          responses: [
            { timeOptionId: optionsResult.res.body.timeOptions[0].id, isAvailable: true },
          ],
        },
      })
    )

    expect(availabilityResult.nextError).toBeUndefined()
    expect(availabilityResult.res.body.responses[0]).toMatchObject({
      timeOptionId: optionsResult.res.body.timeOptions[0].id,
      isAvailable: true,
    })

    const sendConfirmation = jest.fn().mockResolvedValue({ messageId: 'confirmation-message' })
    const confirmationResult = await confirmRequestForUser(
      requestId,
      { timeOptionId: optionsResult.res.body.timeOptions[0].id, location: 'Room 4.1' },
      creator.id,
      sendConfirmation
    )

    expect(confirmationResult.emailDelivery).toEqual({ sentCount: 2, failedCount: 0 })
    expect(sendConfirmation).toHaveBeenCalledTimes(2)
    expect(sendConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        invitee: expect.objectContaining({ email: 'external-invitee@example.test' }),
        organizer: expect.objectContaining({
          userId: creator.id,
          email: creator.email,
          role: 'organizer',
        }),
        meeting: expect.objectContaining({
          title: 'External availability request',
          location: 'Room 4.1',
        }),
      })
    )

    const sendCalendar = jest.fn().mockResolvedValue({ messageId: 'calendar-update' })
    const delivery = await deliverMeetingCalendar({
      meeting: confirmationResult.meeting,
      action: 'updated',
      sendCalendar,
    })

    expect(delivery).toEqual({ sentCount: 2, failedCount: 0 })
    expect(sendCalendar).toHaveBeenCalledTimes(2)
    expect(sendCalendar).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: expect.objectContaining({ email: creator.email }),
        organizer: expect.objectContaining({ email: creator.email }),
        action: 'updated',
      })
    )
    expect(sendCalendar).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: expect.objectContaining({ email: 'external-invitee@example.test' }),
        action: 'updated',
      })
    )
  })

  it('closes invitee voting after the response deadline while allowing host confirmation', async () => {
    if (!runDatabaseTests) {
      return
    }

    const createResult = await runHandler(
      create,
      buildRequest({
        user: { id: creator.id },
        body: {
          title: 'Deadline-driven confirmation',
          tag: 'Operations',
          durationMinutes: 60,
          timezoneName: 'Australia/Brisbane',
          responseDeadline: dateFromNow(1),
        },
      })
    )
    expect(createResult.nextError).toBeUndefined()
    const requestId = createResult.res.body.meetingRequest.id

    const optionsResult = await runHandler(
      replaceTimeOptions,
      buildRequest({
        user: { id: creator.id },
        params: { requestId },
        body: {
          timeOptions: [
            {
              startsAt: dateFromNow(7),
              endsAt: dateFromNow(7, 1),
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

    await query(
      "UPDATE meeting_requests SET response_deadline = NOW() - INTERVAL '1 minute' WHERE id = $1",
      [requestId]
    )

    const inviteeDashboard = await getDashboardData(invitee.id)
    expect(inviteeDashboard.pendingAvailabilityRequests).toHaveLength(0)

    const detailResult = await runHandler(
      getOne,
      buildRequest({ user: { id: creator.id }, params: { requestId } })
    )
    expect(detailResult.nextError).toBeUndefined()
    expect(detailResult.res.body.meetingRequest).toMatchObject({
      status: 'collecting_availability',
      responseDeadlinePassed: true,
      availabilityClosed: true,
      canConfirm: true,
    })

    const availabilityResult = await runHandler(
      submitAvailability,
      buildRequest({
        user: { id: invitee.id },
        params: { requestId, inviteeId },
        body: { responses: [{ timeOptionId, isAvailable: true }] },
      })
    )
    expect(availabilityResult.nextError.statusCode).toBe(409)
    expect(availabilityResult.nextError.message).toBe('Response deadline has passed')

    const confirmResult = await runHandler(
      confirm,
      buildRequest({
        user: { id: creator.id },
        params: { requestId },
        body: { timeOptionId, location: 'Room 8.1', tag: 'Operations' },
      })
    )
    expect(confirmResult.nextError).toBeUndefined()
    expect(confirmResult.res.statusCode).toBe(201)
    expect(confirmResult.res.body.meetingRequest.status).toBe('confirmed')
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
          tag: 'Operations',
          durationMinutes: 60,
          timezoneName: 'Australia/Brisbane',
          responseDeadline: dateFromNow(1),
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
              startsAt: dateFromNow(7),
              endsAt: dateFromNow(7, 1),
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
    const laterMeeting = await createMeetingForUser(
      {
        title: 'Later dashboard meeting',
        startsAt: dateFromNow(5),
        endsAt: dateFromNow(5, 1),
        timezoneName: 'UTC',
      },
      creator.id
    )
    const earlierMeeting = await createMeetingForUser(
      {
        title: 'Earlier dashboard meeting',
        startsAt: dateFromNow(2),
        endsAt: dateFromNow(2, 1),
        timezoneName: 'UTC',
      },
      creator.id
    )
    await query("UPDATE meetings SET created_at = NOW() - INTERVAL '2 days' WHERE id = ANY($1)", [
      [laterMeeting.id, earlierMeeting.id],
    ])
    await createMeetingForUser(
      {
        title: 'Newly created farther meeting',
        startsAt: dateFromNow(9),
        endsAt: dateFromNow(9, 1),
        timezoneName: 'UTC',
      },
      creator.id
    )

    const dashboard = await getDashboardData(creator.id)

    expect(dashboard.recentMeetings.map((meeting) => meeting.title)).toEqual([
      'Newly created farther meeting',
      'Earlier dashboard meeting',
      'Later dashboard meeting',
    ])
  })

  it('returns assignee fields for dashboard action item detail views', async () => {
    if (!runDatabaseTests) {
      return
    }

    const meeting = await createMeetingForUser(
      {
        title: 'Dashboard task meeting',
        startsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
        timezoneName: 'UTC',
      },
      creator.id
    )
    await query(
      `
        INSERT INTO action_items (
          meeting_id, title, description, assignee_id, due_date, priority, created_by
        )
        VALUES ($1, $2, $3, $4, NOW() + INTERVAL '3 days', $5, $6)
      `,
      [
        meeting.id,
        'Dashboard detail action item',
        'Needs an owner in the dashboard modal',
        creator.id,
        'high',
        creator.id,
      ]
    )

    const dashboard = await getDashboardData(creator.id)
    const actionItem = dashboard.myActionItems.find(
      (item) => item.title === 'Dashboard detail action item'
    )

    expect(actionItem).toMatchObject({
      assigneeId: creator.id,
      priority: 'high',
      status: 'todo',
      isOverdue: false,
      dueState: 'upcoming',
    })
    expect(actionItem).not.toHaveProperty('description')
    expect(actionItem).not.toHaveProperty('updatedAt')
    expect(actionItem).not.toHaveProperty('completedAt')
  })

  it('returns notification summary and cursor-paginated notification list', async () => {
    if (!runDatabaseTests) {
      return
    }

    await createMeetingForUser(
      {
        title: 'Notification oldest meeting',
        startsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
        timezoneName: 'UTC',
      },
      creator.id
    )
    await createMeetingForUser(
      {
        title: 'Notification middle meeting',
        startsAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
        timezoneName: 'UTC',
      },
      creator.id
    )
    await createMeetingForUser(
      {
        title: 'Notification latest meeting',
        startsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
        timezoneName: 'UTC',
      },
      creator.id
    )

    const summary = await getNotificationSummaryData(creator.id)
    expect(summary.unreadCount).toBeGreaterThanOrEqual(3)
    expect(summary.notifications).toHaveLength(Math.min(summary.unreadCount, 5))
    if (summary.unreadCount > 5) {
      expect(summary.nextCursor).toEqual(expect.any(String))
    } else {
      expect(summary.nextCursor).toBeNull()
    }

    const firstPage = await getNotificationsData(creator.id, { limit: 2 })
    expect(firstPage.notifications).toHaveLength(2)
    expect(firstPage.nextCursor).toBeTruthy()
    expect(firstPage.notifications[0]).toMatchObject({
      id: expect.any(String),
      entityType: 'meeting',
      isRead: false,
    })

    const secondPage = await getNotificationsData(creator.id, {
      limit: 2,
      cursor: firstPage.nextCursor,
    })
    expect(secondPage.notifications.length).toBeGreaterThanOrEqual(1)
    expect(secondPage.notifications[0].title).not.toBe(firstPage.notifications[0].title)

    const readOne = await readNotification(creator.id, firstPage.notifications[0].id)
    expect(readOne.notification.isRead).toBe(true)

    const afterReadOne = await getNotificationSummaryData(creator.id)
    expect(afterReadOne.unreadCount).toBe(summary.unreadCount - 1)
    expect(afterReadOne.notifications[0].isRead).toBe(false)

    await readAllNotifications(creator.id)

    const afterReadAll = await getNotificationSummaryData(creator.id)
    expect(afterReadAll.unreadCount).toBe(0)

    const archivedRead = await archiveReadNotificationsForUser(creator.id)
    expect(archivedRead.archivedCount).toBeGreaterThanOrEqual(3)

    const afterArchiveRead = await getNotificationsData(creator.id, { limit: 10 })
    expect(afterArchiveRead.notifications).toHaveLength(0)
  })

  it('archives a single notification and removes it from notification feeds', async () => {
    if (!runDatabaseTests) {
      return
    }

    await createMeetingForUser(
      {
        title: 'Notification archive target',
        startsAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
        timezoneName: 'UTC',
      },
      creator.id
    )

    const firstPage = await getNotificationsData(creator.id, { limit: 1 })
    const notification = firstPage.notifications[0]

    const archived = await archiveOneNotification(creator.id, notification.id)
    expect(archived.notification.archivedAt).toEqual(expect.any(String))
    expect(archived.notification.isRead).toBe(true)

    const afterArchive = await getNotificationsData(creator.id, { limit: 10 })
    expect(afterArchive.notifications.some((item) => item.id === notification.id)).toBe(false)
  })

  it('rejects time options that overlap with the creator existing meetings', async () => {
    if (!runDatabaseTests) {
      return
    }

    const blockedStart = dateFromNow(7)
    const blockedEnd = dateFromNow(7, 1)
    const candidateStart = new Date(new Date(blockedStart).getTime() - 30 * 60 * 1000).toISOString()
    const candidateEnd = new Date(new Date(blockedStart).getTime() + 30 * 60 * 1000).toISOString()

    await createMeetingForUser(
      {
        title: 'Blocked host calendar time',
        startsAt: blockedStart,
        endsAt: blockedEnd,
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
          tag: 'Operations',
          durationMinutes: 60,
          timezoneName: 'Australia/Brisbane',
          responseDeadline: dateFromNow(1),
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
              startsAt: candidateStart,
              endsAt: candidateEnd,
            },
          ],
        },
      })
    )

    expect(optionsResult.nextError.statusCode).toBe(409)
    expect(optionsResult.nextError.message).toMatch(/overlaps with existing meeting/)
  })

  it('rejects candidate time options before today', async () => {
    if (!runDatabaseTests) {
      return
    }

    const createResult = await runHandler(
      create,
      buildRequest({
        user: { id: creator.id },
        body: {
          title: 'Past time request',
          tag: 'Operations',
          durationMinutes: 60,
          timezoneName: 'UTC',
          responseDeadline: dateFromNow(1),
        },
      })
    )
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(9, 0, 0, 0)
    const yesterdayEnd = new Date(yesterday.getTime() + 60 * 60 * 1000)

    const optionsResult = await runHandler(
      replaceTimeOptions,
      buildRequest({
        user: { id: creator.id },
        params: { requestId: createResult.res.body.meetingRequest.id },
        body: {
          timeOptions: [
            {
              startsAt: yesterday.toISOString(),
              endsAt: yesterdayEnd.toISOString(),
            },
          ],
        },
      })
    )

    expect(optionsResult.nextError.statusCode).toBe(400)
    expect(optionsResult.nextError.message).toBe('startsAt must be in the future')
  })

  it('rejects response deadlines in the past', async () => {
    if (!runDatabaseTests) {
      return
    }

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    const createResult = await runHandler(
      create,
      buildRequest({
        user: { id: creator.id },
        body: {
          title: 'Past deadline request',
          tag: 'Operations',
          durationMinutes: 60,
          timezoneName: 'UTC',
          responseDeadline: yesterday.toISOString(),
        },
      })
    )

    expect(createResult.nextError.statusCode).toBe(400)
    expect(createResult.nextError.message).toBe('responseDeadline must be in the future')
  })

  it('requires a response deadline', async () => {
    if (!runDatabaseTests) {
      return
    }

    const createResult = await runHandler(
      create,
      buildRequest({
        user: { id: creator.id },
        body: {
          title: 'Missing deadline request',
          tag: 'Operations',
          durationMinutes: 60,
          timezoneName: 'UTC',
        },
      })
    )

    expect(createResult.nextError.statusCode).toBe(400)
    expect(createResult.nextError.message).toBe('responseDeadline is required')
  })
})
