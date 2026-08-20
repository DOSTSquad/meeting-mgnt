import { query } from '../db/postgres.js'

const executor = (db) => db ?? { query }

const RECORDING_COLUMNS = `
  id,
  meeting_id,
  uploaded_by,
  file_name,
  mime_type,
  size_bytes,
  bucket_name,
  object_key,
  duration_seconds,
  recorded_at,
  status,
  error_message,
  archived_at,
  created_at
`

const mapNullableDate = (value) => (value ? value.toISOString() : null)

const mapRecording = (row) => {
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
    bucketName: row.bucket_name,
    objectKey: row.object_key,
    durationSeconds: row.duration_seconds,
    recordedAt: mapNullableDate(row.recorded_at),
    status: row.status,
    errorMessage: row.error_message,
    archivedAt: mapNullableDate(row.archived_at),
    createdAt: row.created_at.toISOString(),
  }
}

export const findActiveRecordingByMeetingId = async (meetingId) => {
  const result = await query(
    `
      SELECT ${RECORDING_COLUMNS}
      FROM meeting_recordings
      WHERE meeting_id = $1
        AND archived_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [meetingId]
  )

  return mapRecording(result.rows[0])
}

export const createRecording = async (
  {
    id,
    meetingId,
    uploadedBy,
    fileName,
    mimeType,
    sizeBytes,
    bucketName,
    objectKey,
    status = 'uploaded',
  },
  db
) => {
  const result = await executor(db).query(
    `
      INSERT INTO meeting_recordings (
        id,
        meeting_id,
        uploaded_by,
        file_name,
        mime_type,
        size_bytes,
        bucket_name,
        object_key,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING ${RECORDING_COLUMNS}
    `,
    [id, meetingId, uploadedBy, fileName, mimeType, sizeBytes, bucketName, objectKey, status]
  )

  return mapRecording(result.rows[0])
}

export const archiveRecording = async (id, db) => {
  const result = await executor(db).query(
    `
      UPDATE meeting_recordings
      SET archived_at = NOW()
      WHERE id = $1
        AND archived_at IS NULL
      RETURNING ${RECORDING_COLUMNS}
    `,
    [id]
  )

  return mapRecording(result.rows[0])
}

export const updateRecordingStatus = async ({ id, status, errorMessage = null }) => {
  const result = await query(
    `
      UPDATE meeting_recordings
      SET status = $2,
          error_message = $3
      WHERE id = $1
      RETURNING ${RECORDING_COLUMNS}
    `,
    [id, status, errorMessage]
  )

  return mapRecording(result.rows[0])
}
