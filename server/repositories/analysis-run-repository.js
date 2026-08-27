import { query } from '../db/postgres.js'

const executor = (db) => db ?? { query }

const ANALYSIS_RUN_COLUMNS = `
  id,
  meeting_id,
  recording_id,
  transcript_id,
  created_by,
  status,
  error_message,
  created_at,
  updated_at,
  completed_at
`

const mapNullableDate = (value) => (value ? value.toISOString() : null)

const mapAnalysisRun = (row) => {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    meetingId: row.meeting_id,
    recordingId: row.recording_id,
    transcriptId: row.transcript_id,
    createdBy: row.created_by,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    completedAt: mapNullableDate(row.completed_at),
  }
}

export const findLatestAnalysisRunByRecordingId = async (recordingId) => {
  const result = await query(
    `
      SELECT ${ANALYSIS_RUN_COLUMNS}
      FROM analysis_runs
      WHERE recording_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [recordingId]
  )

  return mapAnalysisRun(result.rows[0])
}

export const createAnalysisRun = async (
  { id, meetingId, recordingId, transcriptId, createdBy, status = 'queued' },
  db
) => {
  const result = await executor(db).query(
    `
      INSERT INTO analysis_runs (
        id,
        meeting_id,
        recording_id,
        transcript_id,
        created_by,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING ${ANALYSIS_RUN_COLUMNS}
    `,
    [id, meetingId, recordingId, transcriptId, createdBy, status]
  )

  return mapAnalysisRun(result.rows[0])
}

// A transcript that failed permanently can never produce an analysis, so its
// pending runs move to `failed` in the same transaction. Returns every run it
// moved; an empty array means there was nothing left waiting.
export const failPendingAnalysisRunsForTranscript = async ({ transcriptId, errorMessage }, db) => {
  const result = await executor(db).query(
    `
      UPDATE analysis_runs
      SET status = 'failed',
          error_message = $2,
          updated_at = NOW()
      WHERE transcript_id = $1
        AND status IN ('queued', 'processing')
      RETURNING ${ANALYSIS_RUN_COLUMNS}
    `,
    [transcriptId, errorMessage]
  )

  return result.rows.map(mapAnalysisRun)
}
