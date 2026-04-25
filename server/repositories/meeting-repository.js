import { query } from '../db/postgres.js'

const MEETING_COLUMNS = `
  id,
  title,
  description,
  starts_at,
  ends_at,
  timezone_name,
  location,
  status,
  department,
  created_by,
  created_at,
  updated_at
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
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export const createMeeting = async (
  {
    title,
    description = null,
    startsAt,
    endsAt,
    timezoneName = 'UTC',
    location = null,
    status = 'scheduled',
    department = null,
    createdBy,
  },
  client
) => {
  const executor = client ?? { query }
  const result = await executor.query(
    `
      INSERT INTO meetings (
        title, description, starts_at, ends_at, timezone_name,
        location, status, department, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING ${MEETING_COLUMNS}
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
      createdBy,
    ]
  )

  return mapMeeting(result.rows[0])
}

export const findMeetingById = async (id) => {
  const result = await query(
    `
      SELECT ${MEETING_COLUMNS}
      FROM meetings
      WHERE id = $1
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
      RETURNING ${MEETING_COLUMNS}
    `,
    params
  )

  return mapMeeting(result.rows[0])
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
    filters.push({ column: 'starts_at', op: '>=', value: from })
  }

  if (to) {
    filters.push({ column: 'starts_at', op: '<=', value: to })
  }

  if (status) {
    filters.push({ column: 'status', op: '=', value: status })
  }

  if (department) {
    filters.push({ column: 'department', op: '=', value: department })
  }

  if (q) {
    filters.push({
      sql: `to_tsvector('english', title || ' ' || COALESCE(description, '')) @@ plainto_tsquery('english', $?)`,
      value: q,
    })
  }

  const { whereSql, params } = buildWhereClause(filters)

  const countResult = await query(
    `
      SELECT COUNT(*)::int AS total
      FROM meetings
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
      FROM meetings
      ${whereSql}
      ORDER BY starts_at ASC, id ASC
      LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
    `,
    [...params, limit, offset]
  )

  return {
    rows: rowsResult.rows.map(mapMeeting),
    total,
  }
}
