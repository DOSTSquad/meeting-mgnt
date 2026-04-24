import { query } from '../db/postgres.js'

const FILE_COLUMNS = `
  id,
  meeting_id,
  uploaded_by,
  file_name,
  mime_type,
  size_bytes,
  object_key,
  description,
  created_at
`

const mapFile = (row) => {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    meetingId: row.meeting_id,
    uploadedBy: row.uploaded_by,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    objectKey: row.object_key,
    description: row.description ?? null,
    createdAt: row.created_at.toISOString(),
  }
}

export const createFile = async ({ id, meetingId, uploadedBy, fileName, mimeType, sizeBytes, objectKey, description }) => {
  const result = await query(
    `
      INSERT INTO meeting_files
        (id, meeting_id, uploaded_by, file_name, mime_type, size_bytes, object_key, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING ${FILE_COLUMNS}
    `,
    [id, meetingId, uploadedBy, fileName, mimeType, sizeBytes, objectKey, description ?? null]
  )

  return mapFile(result.rows[0])
}

export const findFileById = async (id) => {
  const result = await query(
    `SELECT ${FILE_COLUMNS} FROM meeting_files WHERE id = $1 LIMIT 1`,
    [id]
  )

  return mapFile(result.rows[0] ?? null)
}

export const listFilesByMeeting = async (meetingId) => {
  const result = await query(
    `
      SELECT ${FILE_COLUMNS}
      FROM meeting_files
      WHERE meeting_id = $1
      ORDER BY created_at DESC
    `,
    [meetingId]
  )

  return result.rows.map(mapFile)
}

export const deleteFile = async (id) => {
  const result = await query(
    `DELETE FROM meeting_files WHERE id = $1 RETURNING id`,
    [id]
  )

  return result.rowCount > 0
}
