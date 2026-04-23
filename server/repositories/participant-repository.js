import { query } from '../db/postgres.js'

const PARTICIPANT_COLUMNS = `
  mp.meeting_id,
  mp.user_id,
  u.name,
  u.email,
  mp.role,
  mp.rsvp_status,
  mp.added_by,
  mp.added_at
`

const mapParticipant = (row) => {
  if (!row) {
    return null
  }

  return {
    meetingId: row.meeting_id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    role: row.role,
    rsvpStatus: row.rsvp_status,
    addedBy: row.added_by,
    addedAt: row.added_at.toISOString(),
  }
}

export const listByMeeting = async (meetingId) => {
  const result = await query(
    `
      SELECT ${PARTICIPANT_COLUMNS}
      FROM meeting_participants mp
      JOIN users u ON u.id = mp.user_id
      WHERE mp.meeting_id = $1
      ORDER BY mp.added_at ASC, mp.user_id ASC
    `,
    [meetingId]
  )

  return result.rows.map(mapParticipant)
}

export const findOne = async (meetingId, userId) => {
  const result = await query(
    `
      SELECT ${PARTICIPANT_COLUMNS}
      FROM meeting_participants mp
      JOIN users u ON u.id = mp.user_id
      WHERE mp.meeting_id = $1 AND mp.user_id = $2
      LIMIT 1
    `,
    [meetingId, userId]
  )

  return mapParticipant(result.rows[0])
}

export const bulkUpsert = async ({ meetingId, userIds, role = 'attendee', addedBy }) => {
  if (!userIds || userIds.length === 0) {
    return []
  }

  const valuePlaceholders = []
  const params = [meetingId, role, addedBy]
  let paramIndex = params.length + 1

  for (const userId of userIds) {
    valuePlaceholders.push(`($1, $${paramIndex}, $2, $3)`)
    params.push(userId)
    paramIndex += 1
  }

  await query(
    `
      INSERT INTO meeting_participants (meeting_id, user_id, role, added_by)
      VALUES ${valuePlaceholders.join(', ')}
      ON CONFLICT (meeting_id, user_id) DO NOTHING
    `,
    params
  )

  const result = await query(
    `
      SELECT ${PARTICIPANT_COLUMNS}
      FROM meeting_participants mp
      JOIN users u ON u.id = mp.user_id
      WHERE mp.meeting_id = $1 AND mp.user_id = ANY($2)
      ORDER BY mp.added_at ASC, mp.user_id ASC
    `,
    [meetingId, userIds]
  )

  return result.rows.map(mapParticipant)
}

const UPDATE_FIELD_TO_COLUMN = {
  role: 'role',
  rsvpStatus: 'rsvp_status',
}

export const updateOne = async (meetingId, userId, updates) => {
  const setClauses = []
  const params = []
  let paramIndex = 1

  for (const [field, value] of Object.entries(updates)) {
    const column = UPDATE_FIELD_TO_COLUMN[field]

    if (!column || value === undefined) {
      continue
    }

    setClauses.push(`${column} = $${paramIndex}`)
    params.push(value)
    paramIndex += 1
  }

  if (setClauses.length === 0) {
    return findOne(meetingId, userId)
  }

  params.push(meetingId, userId)
  const meetingParamIndex = paramIndex
  const userParamIndex = paramIndex + 1

  await query(
    `
      UPDATE meeting_participants
      SET ${setClauses.join(', ')}
      WHERE meeting_id = $${meetingParamIndex} AND user_id = $${userParamIndex}
    `,
    params
  )

  return findOne(meetingId, userId)
}

export const remove = async (meetingId, userId) => {
  const result = await query(
    `
      DELETE FROM meeting_participants
      WHERE meeting_id = $1 AND user_id = $2
      RETURNING user_id
    `,
    [meetingId, userId]
  )

  return result.rowCount > 0
}

export const countOrganizers = async (meetingId) => {
  const result = await query(
    `
      SELECT COUNT(*)::int AS count
      FROM meeting_participants
      WHERE meeting_id = $1 AND role = 'organizer'
    `,
    [meetingId]
  )

  return result.rows[0]?.count ?? 0
}
