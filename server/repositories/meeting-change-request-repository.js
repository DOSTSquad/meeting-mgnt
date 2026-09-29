import { query } from '../db/postgres.js'

const mapRequest = (row) => ({
  id: row.id,
  meetingId: row.meeting_id,
  userId: row.user_id,
  message: row.message,
  createdAt: row.created_at.toISOString(),
  readAt: row.read_at?.toISOString() ?? null,
})

export const createChangeRequest = async (meetingId, userId, message, notification) => {
  const result = await query(
    `WITH request AS (
       INSERT INTO meeting_change_requests (meeting_id, user_id, message)
       VALUES ($1, $2, $3) RETURNING *
     ), notification AS (
       INSERT INTO notifications
         (recipient_user_id, type, entity_type, entity_id, title, detail, event_at, idempotency_key)
       SELECT $4, 'meeting_change_requested', 'meeting', meeting_id, $5, $6, created_at,
         'meeting_change_requested:' || id::text FROM request
       RETURNING id
     ) SELECT * FROM request`,
    [
      meetingId,
      userId,
      message,
      notification.recipientUserId,
      notification.title,
      notification.detail,
    ]
  )
  return mapRequest(result.rows[0])
}

export const listChangeRequests = async (meetingId, userId) => {
  const result = await query(
    `SELECT * FROM meeting_change_requests
     WHERE meeting_id = $1 AND user_id = $2 ORDER BY created_at DESC, id DESC`,
    [meetingId, userId]
  )
  return result.rows.map(mapRequest)
}

export const listMeetingChangeRequests = async (meetingId) => {
  const result = await query(
    `SELECT r.*, u.name AS sender_name FROM meeting_change_requests r
     JOIN users u ON u.id = r.user_id
     WHERE r.meeting_id = $1 ORDER BY r.created_at DESC, r.id DESC`,
    [meetingId]
  )
  return result.rows.map((row) => ({ ...mapRequest(row), senderName: row.sender_name }))
}

export const markChangeRequestRead = async (meetingId, requestId) => {
  const result = await query(
    `WITH request AS (
       UPDATE meeting_change_requests SET read_at = COALESCE(read_at, NOW())
       WHERE meeting_id = $1 AND id = $2 RETURNING *
     ), notification AS (
       UPDATE notifications n SET read_at = COALESCE(n.read_at, request.read_at)
       FROM request WHERE n.idempotency_key = 'meeting_change_requested:' || request.id::text
       RETURNING n.id
     ) SELECT * FROM request`,
    [meetingId, requestId]
  )
  return result.rows[0] ? mapRequest(result.rows[0]) : null
}
