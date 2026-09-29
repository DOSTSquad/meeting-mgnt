import '../load-env.js'
import { randomUUID } from 'node:crypto'
import { afterAll, expect, it } from '@jest/globals'
import { query, closePool } from '../db/postgres.js'
import {
  submitMeetingChangeRequest,
  getParticipantChangeRequests,
  getMeetingChangeRequests,
  markMeetingChangeRequestRead,
} from '../services/meeting-change-request-service.js'

afterAll(closePool)

const databaseTest = process.env.RUN_DB_TESTS === 'true' ? it : it.skip

databaseTest(
  'persists attendee messages for the owner and cascades removal without touching other data',
  async () => {
    const ownerId = randomUUID()
    const attendeeId = randomUUID()
    const meetingId = randomUUID()
    try {
      await query(
        `INSERT INTO users (id, name, email, password_hash) VALUES
       ($1, 'Change request test owner', $2, 'unused-test-hash'),
       ($3, 'Change request test attendee', $4, 'unused-test-hash')`,
        [ownerId, `${ownerId}@example.invalid`, attendeeId, `${attendeeId}@example.invalid`]
      )
      await query(
        `INSERT INTO meetings (id, title, starts_at, ends_at, created_by, owner_id)
       VALUES ($1, 'Change request persistence test', NOW(), NOW() + INTERVAL '1 hour', $2, $2)`,
        [meetingId, ownerId]
      )
      await query(`INSERT INTO meeting_participants (meeting_id, user_id) VALUES ($1, $2)`, [
        meetingId,
        attendeeId,
      ])
      const first = await submitMeetingChangeRequest(
        meetingId,
        attendeeId,
        '  Please move the time  '
      )
      const second = await submitMeetingChangeRequest(
        meetingId,
        attendeeId,
        'Please update the location'
      )
      const messages = await getParticipantChangeRequests(meetingId, attendeeId, ownerId)
      expect(messages).toEqual([second, first])
      expect(await getMeetingChangeRequests(meetingId, ownerId)).toEqual(
        [second, first].map((request) => ({
          ...request,
          senderName: 'Change request test attendee',
        }))
      )
      expect(first.message).toBe('Please move the time')
      expect(first.readAt).toBeNull()
      const notifications = await query(
        'SELECT * FROM notifications WHERE entity_id = $1 ORDER BY event_at DESC, id DESC',
        [meetingId]
      )
      expect(notifications.rows).toHaveLength(2)
      expect(
        notifications.rows.every(
          (item) =>
            item.recipient_user_id === ownerId &&
            item.type === 'meeting_change_requested' &&
            item.entity_type === 'meeting'
        )
      ).toBe(true)
      expect(
        notifications.rows.some(
          (item) => item.detail === 'Change request test attendee: Please move the time'
        )
      ).toBe(true)

      const read = await markMeetingChangeRequestRead(meetingId, first.id, ownerId)
      expect(read.readAt).toEqual(expect.any(String))
      const notificationReadState = await query(
        'SELECT read_at FROM notifications WHERE recipient_user_id = $1 AND idempotency_key = $2',
        [ownerId, `meeting_change_requested:${first.id}`]
      )
      expect(notificationReadState.rows[0].read_at.toISOString()).toBe(read.readAt)

      expect((await markMeetingChangeRequestRead(meetingId, first.id, ownerId)).readAt).toBe(
        read.readAt
      )
      const refreshed = await getMeetingChangeRequests(meetingId, ownerId)
      expect(refreshed.map((item) => item.id)).toEqual([second.id, first.id])
      expect(refreshed.filter((item) => !item.readAt)).toHaveLength(1)
      await markMeetingChangeRequestRead(meetingId, second.id, ownerId)
      expect(
        (await getMeetingChangeRequests(meetingId, ownerId)).filter((item) => !item.readAt)
      ).toHaveLength(0)

      await expect(
        getParticipantChangeRequests(meetingId, attendeeId, attendeeId)
      ).rejects.toMatchObject({ statusCode: 403 })
      await query('DELETE FROM meeting_participants WHERE meeting_id = $1 AND user_id = $2', [
        meetingId,
        attendeeId,
      ])
      expect(
        (await query('SELECT id FROM meeting_change_requests WHERE meeting_id = $1', [meetingId]))
          .rows
      ).toHaveLength(0)
    } finally {
      await query('DELETE FROM meetings WHERE id = $1', [meetingId])
      await query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[ownerId, attendeeId]])
    }
  }
)
