import { query } from '../db/postgres.js'
import { getActionItemDueState, isOverdueActionItem } from '../utils/action-items.js'
import { getMeetingRequestDerivedState } from '../utils/meeting-requests.js'

const mapMeetingRow = (row) => ({
  id: row.id,
  title: row.title,
  startsAt: row.starts_at.toISOString(),
  endsAt: row.ends_at.toISOString(),
  timezoneName: row.timezone_name,
  location: row.location,
  status: row.status,
})

const mapMeetingRequestBaseRow = (row, extraFields = {}) => {
  const meetingRequest = {
    id: row.id,
    ...extraFields,
    title: row.title,
    description: row.description,
    durationMinutes: row.duration_minutes,
    timezoneName: row.timezone_name,
    responseDeadline: row.response_deadline ? row.response_deadline.toISOString() : null,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }

  return {
    ...meetingRequest,
    ...getMeetingRequestDerivedState(meetingRequest),
  }
}

const mapInviteeCounts = (row) => ({
  submitted: row.submitted_count,
  pending: row.pending_count,
  total: row.invitee_count,
})

const mapMeetingRequestRow = (row) => ({
  ...mapMeetingRequestBaseRow(row),
  inviteeCounts: mapInviteeCounts(row),
  timeOptionCount: row.time_option_count,
})

const mapPendingAvailabilityRequestRow = (row) => {
  const meetingRequest = mapMeetingRequestBaseRow(row, {
    inviteeId: row.invitee_id,
    responseStatus: row.response_status,
  })

  return {
    ...meetingRequest,
    creator: {
      id: row.created_by,
      name: row.creator_name,
      email: row.creator_email,
    },
    inviteeCounts: mapInviteeCounts(row),
    timeOptionCount: row.time_option_count,
  }
}

const baseMeetingAccessCte = `
  WITH accessible_meetings AS (
    SELECT
      m.id,
      m.title,
      m.starts_at,
      m.ends_at,
      m.timezone_name,
      m.location,
      m.status,
      m.created_at
    FROM meetings m
    WHERE m.created_by = $1

    UNION

    SELECT
      m.id,
      m.title,
      m.starts_at,
      m.ends_at,
      m.timezone_name,
      m.location,
      m.status,
      m.created_at
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
      ORDER BY
        CASE WHEN created_at >= NOW() - INTERVAL '1 day' THEN 0 ELSE 1 END,
        CASE WHEN created_at >= NOW() - INTERVAL '1 day' THEN created_at END DESC,
        starts_at ASC
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
        ai.assignee_id,
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

  return result.rows.map((row) => {
    const dueDate = row.due_date ? row.due_date.toISOString() : null

    return {
      id: row.id,
      meetingId: row.meeting_id,
      meetingTitle: row.meeting_title,
      title: row.title,
      assigneeId: row.assignee_id,
      status: row.status,
      isOverdue: isOverdueActionItem({ dueDate: row.due_date, status: row.status }),
      dueState: getActionItemDueState({ dueDate: row.due_date, status: row.status }),
      priority: row.priority,
      dueDate,
      createdAt: row.created_at.toISOString(),
    }
  })
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
        AND (mr.response_deadline IS NULL OR mr.response_deadline > NOW())
      GROUP BY mr.id, mri.id, u.id
      ORDER BY mr.response_deadline ASC NULLS LAST, mr.updated_at DESC
      LIMIT $2
    `,
    [userId, limit]
  )

  return result.rows.map(mapPendingAvailabilityRequestRow)
}
