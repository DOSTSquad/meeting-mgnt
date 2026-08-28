import { query } from '../db/postgres.js'

const executor = (db) => db ?? { query }

const SUGGESTION_COLUMNS = `
  id,
  analysis_run_id,
  meeting_id,
  title,
  description,
  assignee_id,
  due_date,
  priority,
  status,
  source_ref,
  evidence,
  position,
  created_at,
  updated_at
`

const mapNullableDate = (value) => (value ? value.toISOString() : null)

const mapSuggestion = (row) => {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    analysisRunId: row.analysis_run_id,
    meetingId: row.meeting_id,
    title: row.title,
    description: row.description,
    assigneeId: row.assignee_id,
    dueDate: mapNullableDate(row.due_date),
    priority: row.priority,
    status: row.status,
    sourceRef: row.source_ref,
    evidence: row.evidence ?? [],
    position: row.position,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export const listSuggestionsForAnalysisRun = async (analysisRunId, db) => {
  const result = await executor(db).query(
    `
      SELECT ${SUGGESTION_COLUMNS}
      FROM analysis_action_item_suggestions
      WHERE analysis_run_id = $1
      ORDER BY position, id
    `,
    [analysisRunId]
  )

  return result.rows.map(mapSuggestion)
}

/**
 * Replaces the suggestions for a run.
 *
 * A retry re-runs the adapter, so the previous attempt's suggestions must go
 * rather than accumulate. Suggestions are always written in the same transaction
 * as the run reaching `ready_for_review`, so a reviewer can never see a run
 * offered for review with the wrong attempt's items attached.
 *
 * Everything starts `proposed`: nothing here creates official action items.
 */
export const replaceSuggestionsForAnalysisRun = async (
  { analysisRunId, meetingId, suggestions },
  db
) => {
  const client = executor(db)

  await client.query('DELETE FROM analysis_action_item_suggestions WHERE analysis_run_id = $1', [
    analysisRunId,
  ])

  const created = []

  for (const [position, suggestion] of suggestions.entries()) {
    const result = await client.query(
      `
        INSERT INTO analysis_action_item_suggestions (
          analysis_run_id, meeting_id, title, description, priority, status, source_ref,
          evidence, position
        )
        VALUES ($1, $2, $3, $4, $5, 'proposed', $6, $7::jsonb, $8)
        RETURNING ${SUGGESTION_COLUMNS}
      `,
      [
        analysisRunId,
        meetingId,
        suggestion.title,
        suggestion.description ?? null,
        suggestion.priority,
        suggestion.sourceRef ?? null,
        JSON.stringify(suggestion.evidence ?? []),
        position,
      ]
    )

    created.push(mapSuggestion(result.rows[0]))
  }

  return created
}
