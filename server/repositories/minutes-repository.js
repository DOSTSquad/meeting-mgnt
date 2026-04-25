import { query, withTransaction } from '../db/postgres.js'

const MINUTES_COLUMNS = `
  id,
  meeting_id,
  body,
  created_by,
  updated_by,
  created_at,
  updated_at
`

const mapMinutes = (row) => {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    meetingId: row.meeting_id,
    body: row.body,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

const runQuery = (executor, text, params) => executor.query(text, params)

export const findByMeetingId = async (meetingId) => {
  const result = await query(
    `
      SELECT ${MINUTES_COLUMNS}
      FROM minutes
      WHERE meeting_id = $1
      LIMIT 1
    `,
    [meetingId]
  )

  return mapMinutes(result.rows[0] ?? null)
}

export const findById = async (id) => {
  const result = await query(
    `
      SELECT ${MINUTES_COLUMNS}
      FROM minutes
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  )

  return mapMinutes(result.rows[0] ?? null)
}

const insertWithFirstVersionUsing = async (executor, { meetingId, body, createdBy }) => {
  const insertMinutes = await runQuery(
    executor,
    `
      INSERT INTO minutes (meeting_id, body, created_by, updated_by)
      VALUES ($1, $2, $3, $3)
      RETURNING ${MINUTES_COLUMNS}
    `,
    [meetingId, body, createdBy]
  )

  const minutesRow = insertMinutes.rows[0]

  await runQuery(
    executor,
    `
      INSERT INTO minutes_versions (minutes_id, version, body, edited_by)
      VALUES ($1, 1, $2, $3)
    `,
    [minutesRow.id, body, createdBy]
  )

  return mapMinutes(minutesRow)
}

export const insertWithFirstVersion = async (input, client) => {
  if (client) {
    return insertWithFirstVersionUsing(client, input)
  }

  return withTransaction((tx) => insertWithFirstVersionUsing(tx, input))
}

export const updateBodyWithVersion = async (id, body, editedBy) => {
  return withTransaction(async (client) => {
    const updateResult = await client.query(
      `
        UPDATE minutes
        SET body = $1,
            updated_by = $2,
            updated_at = NOW()
        WHERE id = $3
        RETURNING ${MINUTES_COLUMNS}
      `,
      [body, editedBy, id]
    )

    if (updateResult.rowCount === 0) {
      return null
    }

    await client.query(
      `
        INSERT INTO minutes_versions (minutes_id, version, body, edited_by)
        SELECT $1,
               COALESCE(MAX(version), 0) + 1,
               $2,
               $3
        FROM minutes_versions
        WHERE minutes_id = $1
      `,
      [id, body, editedBy]
    )

    return mapMinutes(updateResult.rows[0])
  })
}

export const countVersions = async (minutesId) => {
  const result = await query(
    `
      SELECT COUNT(*)::int AS count
      FROM minutes_versions
      WHERE minutes_id = $1
    `,
    [minutesId]
  )

  return result.rows[0]?.count ?? 0
}
