import { query } from '../db/postgres.js'

const MEETING_COLUMNS = `
  m.id,
  m.title,
  m.description,
  m.starts_at,
  m.ends_at,
  m.timezone_name,
  m.location,
  m.status,
  m.department,
  m.facilitator,
  m.recorder,
  m.key_discussions,
  m.meeting_minutes,
  m.decisions,
  m.tag_id,
  t.name AS tag_name,
  m.created_by,
  m.created_at,
  m.updated_at
`

const mapMeeting = (row) => {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    timezoneName: row.timezone_name,
    location: row.location,
    status: row.status,
    department: row.department,
    facilitator: row.facilitator,
    recorder: row.recorder,
    keyDiscussions: row.key_discussions,
    meetingMinutes: row.meeting_minutes,
    decisions: row.decisions,
    tagId: row.tag_id ?? null,
    tag: row.tag_name ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export const createMeeting = async ({
  title,
  description = null,
  startsAt,
  endsAt,
  timezoneName = 'UTC',
  location = null,
  status = 'scheduled',
  department = null,
  facilitator = null,
  recorder = null,
  keyDiscussions = null,
  meetingMinutes = null,
  decisions = null,
  tagId = null,
  createdBy,
}) => {
  const result = await query(
    `
      INSERT INTO meetings (
        title, description, starts_at, ends_at, timezone_name,
        location, status, department, facilitator, recorder, key_discussions, meeting_minutes, decisions, tag_id, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `,
    [
      title.trim(),
      description,
      startsAt,
      endsAt,
      timezoneName,
      location,
      status,
      department,
      facilitator,
      recorder,
      keyDiscussions,
      meetingMinutes,
      decisions,
      tagId,
      createdBy,
    ]
  )

  return findMeetingById(result.rows[0].id)
}

export const findMeetingById = async (id) => {
  const result = await query(
    `
      SELECT ${MEETING_COLUMNS}
      FROM meetings m
      LEFT JOIN tags t ON t.id = m.tag_id
      WHERE m.id = $1
      LIMIT 1
    `,
    [id]
  )

  return mapMeeting(result.rows[0])
}

const FIELD_TO_COLUMN = {
  title: 'title',
  description: 'description',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
  timezoneName: 'timezone_name',
  location: 'location',
  status: 'status',
  department: 'department',
  facilitator: 'facilitator',
  recorder: 'recorder',
  keyDiscussions: 'key_discussions',
  meetingMinutes: 'meeting_minutes',
  decisions: 'decisions',
  tagId: 'tag_id',
}

export const updateMeeting = async (id, updates) => {
  const setClauses = []
  const params = []
  let paramIndex = 1

  for (const [field, value] of Object.entries(updates)) {
    const column = FIELD_TO_COLUMN[field]

    if (!column) {
      continue
    }

    setClauses.push(`${column} = $${paramIndex}`)
    params.push(typeof value === 'string' && field === 'title' ? value.trim() : value)
    paramIndex += 1
  }

  if (setClauses.length === 0) {
    return findMeetingById(id)
  }

  setClauses.push(`updated_at = NOW()`)
  params.push(id)

  const result = await query(
    `
      UPDATE meetings
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id
    `,
    params
  )

  return findMeetingById(result.rows[0]?.id)
}

export const deleteMeeting = async (id) => {
  const result = await query(
    `
      DELETE FROM meetings
      WHERE id = $1
      RETURNING id
    `,
    [id]
  )

  return result.rowCount > 0
}

const buildWhereClause = (filters) => {
  if (filters.length === 0) {
    return { whereSql: '', params: [] }
  }

  const params = []
  const clauses = filters.map((filter) => {
    params.push(filter.value)
    const placeholder = `$${params.length}`

    if (filter.sql) {
      return filter.sql.replace('$?', placeholder)
    }

    return `${filter.column} ${filter.op} ${placeholder}`
  })

  return {
    whereSql: `WHERE ${clauses.join(' AND ')}`,
    params,
  }
}

export const listMeetings = async ({
  page = 1,
  limit = 20,
  from,
  to,
  status,
  department,
  q,
} = {}) => {
  const filters = []

  if (from) {
    filters.push({ column: 'm.starts_at', op: '>=', value: from })
  }

  if (to) {
    filters.push({ column: 'm.starts_at', op: '<=', value: to })
  }

  if (status) {
    filters.push({ column: 'm.status', op: '=', value: status })
  }

  if (department) {
    filters.push({ column: 'm.department', op: '=', value: department })
  }

  if (q) {
    filters.push({
      sql: `to_tsvector('english', m.title || ' ' || COALESCE(m.description, '')) @@ plainto_tsquery('english', $?)`,
      value: q,
    })
  }

  const { whereSql, params } = buildWhereClause(filters)

  const countResult = await query(
    `
      SELECT COUNT(*)::int AS total
      FROM meetings m
      ${whereSql}
    `,
    params
  )

  const total = countResult.rows[0]?.total ?? 0
  const offset = (page - 1) * limit
  const limitParamIndex = params.length + 1
  const offsetParamIndex = params.length + 2

  const rowsResult = await query(
    `
      SELECT ${MEETING_COLUMNS}
      FROM meetings m
      LEFT JOIN tags t ON t.id = m.tag_id
      ${whereSql}
      ORDER BY m.starts_at ASC, m.id ASC
      LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
    `,
    [...params, limit, offset]
  )

  return {
    rows: rowsResult.rows.map(mapMeeting),
    total,
  }
}
