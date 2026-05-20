import { query, transaction } from '../db/postgres.js'
import { decorateMeetingRequest } from '../utils/meeting-requests.js'

const REQUEST_COLUMNS = `
  id,
  title,
  description,
  duration_minutes,
  timezone_name,
  response_deadline,
  status,
  created_by,
  confirmed_meeting_id,
  created_at,
  updated_at
`

const mapRequest = (row) => {
  if (!row) {
    return null
  }

  return decorateMeetingRequest({
    id: row.id,
    title: row.title,
    description: row.description,
    durationMinutes: row.duration_minutes,
    timezoneName: row.timezone_name,
    responseDeadline: row.response_deadline ? row.response_deadline.toISOString() : null,
    status: row.status,
    createdBy: row.created_by,
    confirmedMeetingId: row.confirmed_meeting_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  })
}

const mapTimeOption = (row) => ({
  id: row.id,
  meetingRequestId: row.meeting_request_id,
  startsAt: row.starts_at.toISOString(),
  endsAt: row.ends_at.toISOString(),
  sortOrder: row.sort_order,
  isSelected: row.is_selected,
  availableCount: Number(row.available_count ?? 0),
  unavailableCount: Number(row.unavailable_count ?? 0),
  notRespondedCount: Number(row.not_responded_count ?? 0),
  createdAt: row.created_at.toISOString(),
})

const mapInvitee = (row) => ({
  id: row.id,
  meetingRequestId: row.meeting_request_id,
  userId: row.user_id,
  email: row.email,
  name: row.name,
  responseStatus: row.response_status,
  invitedAt: row.invited_at.toISOString(),
  respondedAt: row.responded_at ? row.responded_at.toISOString() : null,
})

const mapResponse = (row) => ({
  id: row.id,
  timeOptionId: row.time_option_id,
  inviteeId: row.invitee_id,
  isAvailable: row.is_available,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
})

export const createMeetingRequest = async ({
  title,
  description = null,
  durationMinutes,
  timezoneName,
  responseDeadline = null,
  createdBy,
}) => {
  const result = await query(
    `
      INSERT INTO meeting_requests (
        title, description, duration_minutes, timezone_name, response_deadline, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING ${REQUEST_COLUMNS}
    `,
    [title.trim(), description, durationMinutes, timezoneName, responseDeadline, createdBy]
  )

  return mapRequest(result.rows[0])
}

export const findMeetingRequestById = async (requestId) => {
  const result = await query(
    `
      SELECT ${REQUEST_COLUMNS}
      FROM meeting_requests
      WHERE id = $1
      LIMIT 1
    `,
    [requestId]
  )

  return mapRequest(result.rows[0])
}

export const updateMeetingRequest = async (requestId, updates) => {
  const fieldToColumn = {
    status: 'status',
    confirmedMeetingId: 'confirmed_meeting_id',
  }
  const setClauses = []
  const params = []
  let paramIndex = 1

  for (const [field, value] of Object.entries(updates)) {
    const column = fieldToColumn[field]
    if (!column || value === undefined) {
      continue
    }

    setClauses.push(`${column} = $${paramIndex}`)
    params.push(value)
    paramIndex += 1
  }

  if (setClauses.length === 0) {
    return findMeetingRequestById(requestId)
  }

  setClauses.push('updated_at = NOW()')
  params.push(requestId)

  const result = await query(
    `
      UPDATE meeting_requests
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING ${REQUEST_COLUMNS}
    `,
    params
  )

  return mapRequest(result.rows[0])
}

export const replaceTimeOptions = async (requestId, timeOptions) =>
  transaction(async (client) => {
    await client.query('DELETE FROM meeting_time_options WHERE meeting_request_id = $1', [
      requestId,
    ])

    if (timeOptions.length === 0) {
      return []
    }

    const params = [requestId]
    const values = []
    let paramIndex = 2

    for (const [index, option] of timeOptions.entries()) {
      values.push(`($1, $${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2})`)
      params.push(option.startsAt, option.endsAt, option.sortOrder ?? index)
      paramIndex += 3
    }

    const result = await client.query(
      `
        INSERT INTO meeting_time_options (meeting_request_id, starts_at, ends_at, sort_order)
        VALUES ${values.join(', ')}
        RETURNING
          id, meeting_request_id, starts_at, ends_at, sort_order, is_selected, created_at,
          0::int AS available_count,
          0::int AS unavailable_count,
          0::int AS not_responded_count
      `,
      params
    )

    await client.query(
      `
        UPDATE meeting_requests
        SET status = 'collecting_availability', updated_at = NOW()
        WHERE id = $1 AND status = 'draft'
      `,
      [requestId]
    )

    return result.rows.map(mapTimeOption)
  })

export const findUserMeetingConflict = async (userId, startsAt, endsAt) => {
  const result = await query(
    `
      SELECT m.id, m.title, m.starts_at, m.ends_at
      FROM meetings m
      WHERE m.status NOT IN ('cancelled', 'archived')
        AND m.starts_at < $3
        AND m.ends_at > $2
        AND (
          m.created_by = $1
          OR EXISTS (
            SELECT 1
            FROM meeting_participants mp
            WHERE mp.meeting_id = m.id
              AND mp.user_id = $1
          )
        )
      ORDER BY m.starts_at ASC
      LIMIT 1
    `,
    [userId, startsAt, endsAt]
  )

  const row = result.rows[0]
  if (!row) {
    return null
  }

  return {
    id: row.id,
    title: row.title,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
  }
}

export const listTimeOptions = async (requestId) => {
  const result = await query(
    `
      SELECT
        mto.id,
        mto.meeting_request_id,
        mto.starts_at,
        mto.ends_at,
        mto.sort_order,
        mto.is_selected,
        mto.created_at,
        COUNT(mtor.id) FILTER (WHERE mtor.is_available = true)::int AS available_count,
        COUNT(mtor.id) FILTER (WHERE mtor.is_available = false)::int AS unavailable_count,
        (
          SELECT COUNT(*)::int
          FROM meeting_request_invitees mri
          WHERE mri.meeting_request_id = mto.meeting_request_id
        ) - COUNT(mtor.id)::int AS not_responded_count
      FROM meeting_time_options mto
      LEFT JOIN meeting_time_option_responses mtor ON mtor.time_option_id = mto.id
      WHERE mto.meeting_request_id = $1
      GROUP BY mto.id
      ORDER BY mto.sort_order ASC, mto.starts_at ASC, mto.id ASC
    `,
    [requestId]
  )

  return result.rows.map(mapTimeOption)
}

export const replaceInvitees = async (requestId, invitees) =>
  transaction(async (client) => {
    await client.query('DELETE FROM meeting_request_invitees WHERE meeting_request_id = $1', [
      requestId,
    ])

    if (invitees.length === 0) {
      return []
    }

    const params = [requestId]
    const values = []
    let paramIndex = 2

    for (const invitee of invitees) {
      values.push(`($1, $${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2})`)
      params.push(invitee.userId ?? null, invitee.email, invitee.name ?? null)
      paramIndex += 3
    }

    const result = await client.query(
      `
        INSERT INTO meeting_request_invitees (meeting_request_id, user_id, email, name)
        VALUES ${values.join(', ')}
        RETURNING id, meeting_request_id, user_id, email, name, response_status, invited_at, responded_at
      `,
      params
    )

    await client.query(
      `
        UPDATE meeting_requests
        SET status = 'collecting_availability', updated_at = NOW()
        WHERE id = $1 AND status = 'draft'
      `,
      [requestId]
    )

    return result.rows.map(mapInvitee)
  })

export const listInvitees = async (requestId) => {
  const result = await query(
    `
      SELECT id, meeting_request_id, user_id, email, name, response_status, invited_at, responded_at
      FROM meeting_request_invitees
      WHERE meeting_request_id = $1
      ORDER BY invited_at ASC, id ASC
    `,
    [requestId]
  )

  return result.rows.map(mapInvitee)
}

export const findInvitee = async (requestId, inviteeId) => {
  const result = await query(
    `
      SELECT id, meeting_request_id, user_id, email, name, response_status, invited_at, responded_at
      FROM meeting_request_invitees
      WHERE meeting_request_id = $1 AND id = $2
      LIMIT 1
    `,
    [requestId, inviteeId]
  )

  return result.rows[0] ? mapInvitee(result.rows[0]) : null
}

export const listInviteeResponses = async (inviteeId) => {
  const result = await query(
    `
      SELECT id, time_option_id, invitee_id, is_available, created_at, updated_at
      FROM meeting_time_option_responses
      WHERE invitee_id = $1
      ORDER BY created_at ASC, id ASC
    `,
    [inviteeId]
  )

  return result.rows.map(mapResponse)
}

export const replaceInviteeResponses = async (requestId, inviteeId, responses) =>
  transaction(async (client) => {
    await client.query(
      `
        DELETE FROM meeting_time_option_responses
        WHERE invitee_id = $1
      `,
      [inviteeId]
    )

    if (responses.length > 0) {
      const params = [inviteeId]
      const values = []
      let paramIndex = 2

      for (const response of responses) {
        values.push(`($${paramIndex}, $1, $${paramIndex + 1})`)
        params.push(response.timeOptionId, response.isAvailable)
        paramIndex += 2
      }

      await client.query(
        `
          INSERT INTO meeting_time_option_responses (time_option_id, invitee_id, is_available)
          VALUES ${values.join(', ')}
        `,
        params
      )
    }

    await client.query(
      `
        UPDATE meeting_request_invitees
        SET response_status = 'submitted', responded_at = NOW()
        WHERE id = $1
      `,
      [inviteeId]
    )

    const pendingResult = await client.query(
      `
        SELECT COUNT(*)::int AS pending_count
        FROM meeting_request_invitees
        WHERE meeting_request_id = $1 AND response_status = 'pending'
      `,
      [requestId]
    )

    if (pendingResult.rows[0]?.pending_count === 0) {
      await client.query(
        `
          UPDATE meeting_requests
          SET status = 'ready_to_confirm', updated_at = NOW()
          WHERE id = $1 AND status = 'collecting_availability'
        `,
        [requestId]
      )
    }

    const result = await client.query(
      `
        SELECT id, time_option_id, invitee_id, is_available, created_at, updated_at
        FROM meeting_time_option_responses
        WHERE invitee_id = $1
        ORDER BY created_at ASC, id ASC
      `,
      [inviteeId]
    )

    return result.rows.map(mapResponse)
  })

export const optionBelongsToRequest = async (requestId, timeOptionId) => {
  const result = await query(
    `
      SELECT id
      FROM meeting_time_options
      WHERE id = $1 AND meeting_request_id = $2
      LIMIT 1
    `,
    [timeOptionId, requestId]
  )

  return result.rowCount > 0
}

export const confirmMeetingRequest = async ({
  requestId,
  timeOptionId,
  meetingId,
  status = 'confirmed',
}) => {
  if (timeOptionId) {
    await query(
      `
        UPDATE meeting_time_options
        SET is_selected = (id = $2)
        WHERE meeting_request_id = $1
      `,
      [requestId, timeOptionId]
    )
  } else {
    await query(
      `
        UPDATE meeting_time_options
        SET is_selected = false
        WHERE meeting_request_id = $1
      `,
      [requestId]
    )
  }

  return updateMeetingRequest(requestId, {
    status,
    confirmedMeetingId: meetingId,
  })
}
