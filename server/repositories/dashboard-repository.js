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
      ORDER BY starts_at DESC
      LIMIT $2
    `,
    [userId, limit]
  )

  return result.rows.map(mapMeetingRow)
}

export const listPendingRsvpMeetingsForUser = async (userId, limit = 5) => {
  const result = await query(
    `
      SELECT
        m.id,
        m.title,
        m.starts_at,
        m.ends_at,
        m.timezone_name,
        m.location,
        m.status,
        COUNT(*) FILTER (WHERE all_mp.rsvp_status = 'accepted')::int AS accepted_count,
        COUNT(*) FILTER (WHERE all_mp.rsvp_status = 'declined')::int AS declined_count,
        COUNT(*) FILTER (WHERE all_mp.rsvp_status = 'pending')::int AS pending_count,
        COUNT(*)::int AS total_count
      FROM meeting_participants my_mp
      JOIN meetings m ON m.id = my_mp.meeting_id
      JOIN meeting_participants all_mp ON all_mp.meeting_id = m.id
      WHERE my_mp.user_id = $1
        AND my_mp.rsvp_status = 'pending'
      GROUP BY m.id
      ORDER BY m.starts_at ASC
      LIMIT $2
    `,
    [userId, limit]
  )

  return result.rows.map((row) => ({
    ...mapMeetingRow(row),
    rsvpCounts: {
      accepted: row.accepted_count,
      declined: row.declined_count,
      pending: row.pending_count,
      total: row.total_count,
    },
  }))
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
          'rsvp_pending'::text AS type,
          m.id AS meeting_id,
          NULL::uuid AS action_item_id,
          m.title AS title,
          m.starts_at AS event_at,
          'Please vote on your meeting availability.'::text AS detail
        FROM meeting_participants mp
        JOIN meetings m ON m.id = mp.meeting_id
        WHERE mp.user_id = $1
          AND mp.rsvp_status = 'pending'

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
