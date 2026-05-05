import { query } from '../db/postgres.js'

const mapMeetingRow = (row) => ({
  id: row.id,
  title: row.title,
  startsAt: row.starts_at.toISOString(),
  endsAt: row.ends_at.toISOString(),
  timezoneName: row.timezone_name,
  location: row.location,
  status: row.status,
})

const mapMeetingRequestRow = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  durationMinutes: row.duration_minutes,
  timezoneName: row.timezone_name,
  responseDeadline: row.response_deadline ? row.response_deadline.toISOString() : null,
  status: row.status,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  inviteeCounts: {
    submitted: row.submitted_count,
    pending: row.pending_count,
    total: row.invitee_count,
  },
  timeOptionCount: row.time_option_count,
})

const mapPendingAvailabilityRequestRow = (row) => ({
  id: row.id,
  inviteeId: row.invitee_id,
  title: row.title,
  description: row.description,
  durationMinutes: row.duration_minutes,
  timezoneName: row.timezone_name,
  responseDeadline: row.response_deadline ? row.response_deadline.toISOString() : null,
  status: row.status,
  responseStatus: row.response_status,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  creator: {
    id: row.created_by,
    name: row.creator_name,
    email: row.creator_email,
  },
  inviteeCounts: {
    submitted: row.submitted_count,
    pending: row.pending_count,
    total: row.invitee_count,
  },
  timeOptionCount: row.time_option_count,
})

const baseMeetingAccessCte = `
  WITH accessible_meetings AS (
    SELECT m.id, m.title, m.starts_at, m.ends_at, m.timezone_name, m.location, m.status
    FROM meetings m
    WHERE m.created_by = $1

    UNION

    SELECT m.id, m.title, m.starts_at, m.ends_at, m.timezone_name, m.location, m.status
    FROM meetings m
    JOIN meeting_participants mp ON mp.meeting_id = m.id
    WHERE mp.user_id = $1
  )
`

export const listRecentMeetingsForUser = async (userId, limit = 5) => {
  const result = await query(
    `
      ${baseMeetingAccessCte}
      SELECT id, title, starts_at, ends_at, timezone_name, location, status
      FROM accessible_meetings
      WHERE starts_at >= NOW()
        AND status NOT IN ('cancelled', 'archived')
      ORDER BY starts_at ASC
      LIMIT $2
    `,
    [userId, limit]
  )

  return result.rows.map(mapMeetingRow)
}

export const listMyActionItems = async (userId, limit = 10) => {
  const result = await query(
    `
      SELECT
        ai.id,
        ai.meeting_id,
        m.title AS meeting_title,
        ai.title,
        ai.status,
        ai.priority,
        ai.due_date,
        ai.created_at
      FROM action_items ai
      LEFT JOIN meetings m ON m.id = ai.meeting_id
      WHERE ai.assignee_id = $1
        AND ai.status NOT IN ('completed', 'cancelled')
      ORDER BY ai.due_date ASC NULLS LAST, ai.created_at DESC
      LIMIT $2
    `,
    [userId, limit]
  )

  return result.rows.map((row) => ({
    id: row.id,
    meetingId: row.meeting_id,
    meetingTitle: row.meeting_title,
    title: row.title,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date ? row.due_date.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  }))
}

export const listPendingMeetingRequestsForUser = async (userId, limit = 5) => {
  const result = await query(
    `
      SELECT
        mr.id,
        mr.title,
        mr.description,
        mr.duration_minutes,
        mr.timezone_name,
        mr.response_deadline,
        mr.status,
        mr.created_at,
        mr.updated_at,
        COUNT(DISTINCT mto.id)::int AS time_option_count,
        COUNT(DISTINCT mri.id)::int AS invitee_count,
        COUNT(DISTINCT mri.id) FILTER (WHERE mri.response_status = 'submitted')::int AS submitted_count,
        COUNT(DISTINCT mri.id) FILTER (WHERE mri.response_status = 'pending')::int AS pending_count
      FROM meeting_requests mr
      LEFT JOIN meeting_time_options mto ON mto.meeting_request_id = mr.id
      LEFT JOIN meeting_request_invitees mri ON mri.meeting_request_id = mr.id
      WHERE mr.created_by = $1
        AND mr.status NOT IN ('confirmed', 'cancelled')
      GROUP BY mr.id
      ORDER BY mr.updated_at DESC
      LIMIT $2
    `,
    [userId, limit]
  )

  return result.rows.map(mapMeetingRequestRow)
}

export const listPendingAvailabilityRequestsForUser = async (userId, limit = 5) => {
  const result = await query(
    `
      SELECT
        mr.id,
        mri.id AS invitee_id,
        mr.title,
        mr.description,
        mr.duration_minutes,
        mr.timezone_name,
        mr.response_deadline,
        mr.status,
        mr.created_by,
        mr.created_at,
        mr.updated_at,
        mri.response_status,
        u.name AS creator_name,
        u.email AS creator_email,
        COUNT(DISTINCT mto.id)::int AS time_option_count,
        COUNT(DISTINCT all_invitees.id)::int AS invitee_count,
        COUNT(DISTINCT all_invitees.id) FILTER (WHERE all_invitees.response_status = 'submitted')::int AS submitted_count,
        COUNT(DISTINCT all_invitees.id) FILTER (WHERE all_invitees.response_status = 'pending')::int AS pending_count
      FROM meeting_request_invitees mri
      JOIN meeting_requests mr ON mr.id = mri.meeting_request_id
      JOIN users u ON u.id = mr.created_by
      LEFT JOIN meeting_time_options mto ON mto.meeting_request_id = mr.id
      LEFT JOIN meeting_request_invitees all_invitees ON all_invitees.meeting_request_id = mr.id
      WHERE mri.user_id = $1
        AND mri.response_status = 'pending'
        AND mr.status NOT IN ('confirmed', 'cancelled')
      GROUP BY mr.id, mri.id, u.id
      ORDER BY mr.response_deadline ASC NULLS LAST, mr.updated_at DESC
      LIMIT $2
    `,
    [userId, limit]
  )

  return result.rows.map(mapPendingAvailabilityRequestRow)
}

export const listNotificationItemsForUser = async (userId, limit = 20) => {
  const result = await query(
    `
      WITH items AS (
        SELECT
          'meeting_created'::text AS type,
          m.id AS meeting_id,
          NULL::uuid AS action_item_id,
          m.title AS title,
          m.created_at AS event_at,
          'A new meeting has been created.'::text AS detail
        FROM meetings m
        WHERE m.created_by = $1
           OR EXISTS (
             SELECT 1
             FROM meeting_participants mp
             WHERE mp.meeting_id = m.id
               AND mp.user_id = $1
           )

        UNION ALL

        SELECT
          'task_assigned'::text AS type,
          ai.meeting_id,
          ai.id AS action_item_id,
          ai.title,
          ai.updated_at AS event_at,
          'A task has been assigned to you.'::text AS detail
        FROM action_items ai
        WHERE ai.assignee_id = $1
          AND ai.updated_at >= ai.created_at

        UNION ALL

        SELECT
          'action_due'::text AS type,
          ai.meeting_id,
          ai.id AS action_item_id,
          ai.title,
          ai.due_date AS event_at,
          'An assigned action item is due soon.'::text AS detail
        FROM action_items ai
        WHERE ai.assignee_id = $1
          AND ai.status NOT IN ('completed', 'cancelled')
          AND ai.due_date IS NOT NULL
      )
      SELECT type, meeting_id, action_item_id, title, event_at, detail
      FROM items
      ORDER BY event_at DESC NULLS LAST
      LIMIT $2
    `,
    [userId, limit]
  )

  return result.rows.map((row) => ({
    type: row.type,
    meetingId: row.meeting_id,
    actionItemId: row.action_item_id,
    title: row.title,
    eventAt: row.event_at ? row.event_at.toISOString() : null,
    detail: row.detail,
  }))
}
