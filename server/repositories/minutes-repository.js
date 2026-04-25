import { getPool, query } from '../db/postgres.js'

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
    createdBy: row.created_by ?? null,
    updatedBy: row.updated_by ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export const mapMinutesRow = mapMinutes

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

  return mapMinutes(result.rows[0])
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

  return mapMinutes(result.rows[0])
}

export const createInitialMinutes = async ({ meetingId, body, userId }, client = { query }) => {
  const minutesResult = await client.query(
    `
      INSERT INTO minutes (meeting_id, body, created_by, updated_by)
      VALUES ($1, $2, $3, $3)
      RETURNING ${MINUTES_COLUMNS}
    `,
    [meetingId, body, userId]
  )

  const minutes = mapMinutes(minutesResult.rows[0])

  await client.query(
    `
      INSERT INTO minutes_versions (minutes_id, version, body, edited_by)
      VALUES ($1, 1, $2, $3)
    `,
    [minutes.id, body, userId]
  )

  return minutes
}

export const updateBodyWithVersion = async (id, body, editedBy) => {
  const pool = getPool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const currentResult = await client.query(
      `
        SELECT ${MINUTES_COLUMNS}
        FROM minutes
        WHERE id = $1
        FOR UPDATE
      `,
      [id]
    )

    if (currentResult.rowCount === 0) {
      await client.query('ROLLBACK')
      return null
    }

    const versionResult = await client.query(
      `
        SELECT COALESCE(MAX(version), 0) + 1 AS next_version
        FROM minutes_versions
        WHERE minutes_id = $1
      `,
      [id]
    )
    const nextVersion = versionResult.rows[0].next_version

    const updatedResult = await client.query(
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

    await client.query(
      `
        INSERT INTO minutes_versions (minutes_id, version, body, edited_by)
        VALUES ($1, $2, $3, $4)
      `,
      [id, nextVersion, body, editedBy]
    )

    await client.query('COMMIT')

    return mapMinutes(updatedResult.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export const listVersions = async (minutesId) => {
  const result = await query(
    `
      SELECT id, minutes_id, version, body, edited_by, edited_at
      FROM minutes_versions
      WHERE minutes_id = $1
      ORDER BY version ASC
    `,
    [minutesId]
  )

  return result.rows.map((row) => ({
    id: row.id,
    minutesId: row.minutes_id,
    version: row.version,
    body: row.body,
    editedBy: row.edited_by ?? null,
    editedAt: row.edited_at.toISOString(),
  }))
}
