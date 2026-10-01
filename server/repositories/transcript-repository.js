import { query } from '../db/postgres.js'

const executor = (db) => db ?? { query }

const TRANSCRIPT_COLUMNS = `
  id,
  meeting_id,
  source_file_id,
  recording_id,
  created_by,
  status,
  transcript_text,
  segments,
  duration_seconds,
  error_message,
  created_at,
  updated_at,
  started_at,
  completed_at
`

const mapNullableDate = (value) => (value ? value.toISOString() : null)

const mapTranscript = (row) => {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    meetingId: row.meeting_id,
    sourceFileId: row.source_file_id,
    recordingId: row.recording_id,
    createdBy: row.created_by,
    status: row.status,
    transcriptText: row.transcript_text,
    segments: row.segments,
    durationSeconds: row.duration_seconds,
    errorMessage: row.error_message,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    startedAt: mapNullableDate(row.started_at),
    completedAt: mapNullableDate(row.completed_at),
  }
}

export const findLatestTranscriptByRecordingId = async (recordingId, db) => {
  const result = await executor(db).query(
    `
      SELECT ${TRANSCRIPT_COLUMNS}
      FROM meeting_transcripts
      WHERE recording_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [recordingId]
  )

  return mapTranscript(result.rows[0])
}

export const findTranscriptById = async (id, db) => {
  const result = await executor(db).query(
    `
      SELECT ${TRANSCRIPT_COLUMNS}
      FROM meeting_transcripts
      WHERE id = $1
    `,
    [id]
  )

  return mapTranscript(result.rows[0])
}

// Guarded like completion. COALESCE keeps the first start, so a retried job's
// duration covers every attempt rather than only the last one.
export const markTranscriptStarted = async ({ id, recordingId }, db) => {
  const result = await executor(db).query(
    `
      UPDATE meeting_transcripts
      SET started_at = COALESCE(started_at, NOW()),
          updated_at = NOW()
      WHERE id = $1
        AND recording_id = $2
        AND status = 'processing'
      RETURNING ${TRANSCRIPT_COLUMNS}
    `,
    [id, recordingId]
  )

  return mapTranscript(result.rows[0])
}

// Guarded completion: only a transcript still in `processing` and still attached
// to the given recording moves. A null return means the job is stale.
export const completeTranscript = async (
  { id, recordingId, transcriptText, segments, durationSeconds },
  db
) => {
  const result = await executor(db).query(
    `
      UPDATE meeting_transcripts
      SET status = 'completed',
          transcript_text = $3,
          segments = $4::jsonb,
          duration_seconds = $5,
          error_message = NULL,
          completed_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
        AND recording_id = $2
        AND status = 'processing'
      RETURNING ${TRANSCRIPT_COLUMNS}
    `,
    [id, recordingId, transcriptText, JSON.stringify(segments), durationSeconds]
  )

  return mapTranscript(result.rows[0])
}

export const failTranscript = async ({ id, recordingId, errorMessage }, db) => {
  const result = await executor(db).query(
    `
      UPDATE meeting_transcripts
      SET status = 'failed',
          error_message = $3,
          updated_at = NOW()
      WHERE id = $1
        AND recording_id = $2
        AND status = 'processing'
      RETURNING ${TRANSCRIPT_COLUMNS}
    `,
    [id, recordingId, errorMessage]
  )

  return mapTranscript(result.rows[0])
}

export const createTranscript = async (
  {
    meetingId,
    recordingId,
    createdBy,
    status = 'processing',
    transcriptText = null,
    segments = [],
    durationSeconds = null,
    errorMessage = null,
    completedAt = null,
  },
  db
) => {
  const result = await executor(db).query(
    `
      INSERT INTO meeting_transcripts (
        meeting_id,
        recording_id,
        created_by,
        status,
        transcript_text,
        segments,
        duration_seconds,
        error_message,
        completed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
      RETURNING ${TRANSCRIPT_COLUMNS}
    `,
    [
      meetingId,
      recordingId,
      createdBy,
      status,
      transcriptText,
      JSON.stringify(segments),
      durationSeconds,
      errorMessage,
      completedAt,
    ]
  )

  return mapTranscript(result.rows[0])
}
