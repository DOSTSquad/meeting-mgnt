import { query } from '../db/postgres.js'

const MINUTE_COLUMNS = `
  minutes.id,
  minutes.meeting_id,
  minutes.summary_id,
  minutes.prepared_by,
  minutes.approved_by,
  minutes.facilitator_id,
  minutes.recorder_id,
  minutes.content,
  minutes.key_discussions,
  minutes.decisions,
  minutes.status,
  minutes.version,
  minutes.approved_at,
  minutes.published_at,
  minutes.created_at,
  minutes.updated_at,
  prepared_user.name AS prepared_by_name,
  approved_user.name AS approved_by_name,
  facilitator_user.name AS facilitator_name,
  recorder_user.name AS recorder_name
`

const MINUTE_JOINS = `
  LEFT JOIN users prepared_user ON prepared_user.id = minutes.prepared_by
  LEFT JOIN users approved_user ON approved_user.id = minutes.approved_by
  LEFT JOIN users facilitator_user ON facilitator_user.id = minutes.facilitator_id
  LEFT JOIN users recorder_user ON recorder_user.id = minutes.recorder_id
`

const mapNullableDate = (value) => (value ? value.toISOString() : null)

const mapUserRef = (id, name) => (id ? { id, name: name ?? null } : null)

const mapMinute = (row) => {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    meetingId: row.meeting_id,
    summaryId: row.summary_id,
    preparedBy: row.prepared_by,
    preparedByUser: mapUserRef(row.prepared_by, row.prepared_by_name),
    approvedBy: row.approved_by,
    approvedByUser: mapUserRef(row.approved_by, row.approved_by_name),
    facilitatorId: row.facilitator_id,
    facilitator: mapUserRef(row.facilitator_id, row.facilitator_name),
    recorderId: row.recorder_id,
    recorder: mapUserRef(row.recorder_id, row.recorder_name),
    content: row.content,
    keyDiscussions: row.key_discussions,
    decisions: row.decisions,
    status: row.status,
    version: row.version,
    approvedAt: mapNullableDate(row.approved_at),
    publishedAt: mapNullableDate(row.published_at),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

const getTableColumns = async (tableName) => {
  const result = await query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
    `,
    [tableName]
  )

  return new Set(result.rows.map((row) => row.column_name))
}

const findMinuteById = async (id) => {
  const result = await query(
    `
      SELECT ${MINUTE_COLUMNS}
      FROM minutes
      ${MINUTE_JOINS}
      WHERE minutes.id = $1
      LIMIT 1
    `,
    [id]
  )

  return mapMinute(result.rows[0])
}

export const findMinuteByMeetingId = async (meetingId) => {
  const result = await query(
    `
      SELECT ${MINUTE_COLUMNS}
      FROM minutes
      ${MINUTE_JOINS}
      WHERE minutes.meeting_id = $1
      LIMIT 1
    `,
    [meetingId]
  )

  return mapMinute(result.rows[0])
}

export const createDraftMinute = async ({ meetingId, preparedBy }) => {
  const minutesColumns = await getTableColumns('minutes')
  const minuteRecord = {
    meeting_id: meetingId,
    prepared_by: preparedBy,
    content: '',
    body: '',
    created_by: preparedBy,
    updated_by: preparedBy,
  }
  const minuteColumnOrder = [
    'meeting_id',
    'prepared_by',
    'content',
    'body',
    'created_by',
    'updated_by',
  ]
  const activeColumns = minuteColumnOrder.filter((column) => minutesColumns.has(column))
  const placeholders = activeColumns.map((_, index) => `$${index + 1}`).join(', ')
  const values = activeColumns.map((column) => minuteRecord[column])

  const result = await query(
    `
      INSERT INTO minutes (${activeColumns.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT (meeting_id) DO NOTHING
      RETURNING id
    `,
    values
  )

  if (result.rows[0]?.id) {
    return findMinuteById(result.rows[0].id)
  }

  return findMinuteByMeetingId(meetingId)
}

const UPDATE_FIELD_TO_COLUMN = {
  content: 'content',
  keyDiscussions: 'key_discussions',
  decisions: 'decisions',
  facilitatorId: 'facilitator_id',
  recorderId: 'recorder_id',
  status: 'status',
}

export const updateMinute = async ({ meetingId, minuteId, updates, updatedBy }) => {
  const minutesColumns = await getTableColumns('minutes')
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

    if (field === 'content' && minutesColumns.has('body')) {
      setClauses.push(`body = $${paramIndex}`)
      params.push(value)
      paramIndex += 1
    }
  }

  if (minutesColumns.has('updated_by')) {
    setClauses.push(`updated_by = $${paramIndex}`)
    params.push(updatedBy)
    paramIndex += 1
  }

  setClauses.push('version = version + 1')
  setClauses.push('updated_at = NOW()')
  params.push(minuteId, meetingId)
  const minuteIdParamIndex = paramIndex
  const meetingIdParamIndex = paramIndex + 1

  const result = await query(
    `
      UPDATE minutes
      SET ${setClauses.join(', ')}
      WHERE id = $${minuteIdParamIndex}
        AND meeting_id = $${meetingIdParamIndex}
      RETURNING id
    `,
    params
  )

  if (!result.rows[0]?.id) {
    return null
  }

  return findMinuteById(result.rows[0].id)
}
