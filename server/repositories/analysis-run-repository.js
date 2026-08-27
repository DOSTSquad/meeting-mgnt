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
  summary,
  key_discussions,
  decisions,
  provider,
  model,
  prompt_version,
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
    summary: row.summary ?? null,
    keyDiscussions: row.key_discussions ?? [],
    decisions: row.decisions ?? [],
    provider: row.provider ?? null,
    model: row.model ?? null,
    promptVersion: row.prompt_version ?? null,
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

export const findAnalysisRunById = async (id, db) => {
  const result = await executor(db).query(
    `
      SELECT ${ANALYSIS_RUN_COLUMNS}
      FROM analysis_runs
      WHERE id = $1
    `,
    [id]
  )

  return mapAnalysisRun(result.rows[0])
}

// Guarded like every other workflow write: only a run still `queued` for this
// transcript starts. A null return means the job is stale, because the recording
// was replaced or another attempt already claimed it.
export const startAnalysisRun = async ({ id, transcriptId }, db) => {
  const result = await executor(db).query(
    `
      UPDATE analysis_runs
      SET status = 'processing',
          error_message = NULL,
          updated_at = NOW()
      WHERE id = $1
        AND transcript_id = $2
        AND status IN ('queued', 'processing')
      RETURNING ${ANALYSIS_RUN_COLUMNS}
    `,
    [id, transcriptId]
  )

  return mapAnalysisRun(result.rows[0])
}

export const completeAnalysisRun = async (
  { id, transcriptId, summary, keyDiscussions, decisions, provider, model, promptVersion },
  db
) => {
  const result = await executor(db).query(
    `
      UPDATE analysis_runs
      SET status = 'ready_for_review',
          summary = $3,
          key_discussions = $4::jsonb,
          decisions = $5::jsonb,
          provider = $6,
          model = $7,
          prompt_version = $8,
          error_message = NULL,
          completed_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
        AND transcript_id = $2
        AND status = 'processing'
      RETURNING ${ANALYSIS_RUN_COLUMNS}
    `,
    [
      id,
      transcriptId,
      summary,
      JSON.stringify(keyDiscussions),
      JSON.stringify(decisions),
      provider,
      model,
      promptVersion,
    ]
  )

  return mapAnalysisRun(result.rows[0])
}

export const failAnalysisRun = async ({ id, transcriptId, errorMessage }, db) => {
  const result = await executor(db).query(
    `
      UPDATE analysis_runs
      SET status = 'failed',
          error_message = $3,
          updated_at = NOW()
      WHERE id = $1
        AND transcript_id = $2
        AND status IN ('queued', 'processing')
      RETURNING ${ANALYSIS_RUN_COLUMNS}
    `,
    [id, transcriptId, errorMessage]
  )

  return mapAnalysisRun(result.rows[0])
}
