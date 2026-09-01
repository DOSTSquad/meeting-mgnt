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
  accepted_action_item_id,
  reviewed_by,
  reviewed_at,
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
    acceptedActionItemId: row.accepted_action_item_id,
    reviewedBy: row.reviewed_by,
    reviewedAt: mapNullableDate(row.reviewed_at),
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
          evidence, position, assignee_id, due_date
        )
        VALUES ($1, $2, $3, $4, $5, 'proposed', $6, $7::jsonb, $8, $9, $10)
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
        // Both stay null unless the provider named someone in this meeting and
        // gave a date that parsed. A guess here would put a task in someone's
        // list that was never theirs.
        suggestion.assigneeId ?? null,
        suggestion.dueDate ?? null,
      ]
    )

    created.push(mapSuggestion(result.rows[0]))
  }

  return created
}

export const findSuggestionById = async (id, db) => {
  const result = await executor(db).query(
    `
      SELECT ${SUGGESTION_COLUMNS}
      FROM analysis_action_item_suggestions
      WHERE id = $1
    `,
    [id]
  )

  return mapSuggestion(result.rows[0])
}

// Editing is only allowed while a suggestion is still a proposal. Once it has
// been accepted or rejected it is a record of what was decided, not a draft.
export const updateProposedSuggestion = async (
  { id, meetingId, title, description, assigneeId, dueDate, priority },
  db
) => {
  const result = await executor(db).query(
    `
      UPDATE analysis_action_item_suggestions
      SET title = COALESCE($3, title),
          description = CASE WHEN $4::boolean THEN $5 ELSE description END,
          assignee_id = CASE WHEN $6::boolean THEN $7 ELSE assignee_id END,
          due_date = CASE WHEN $8::boolean THEN $9 ELSE due_date END,
          priority = COALESCE($10, priority),
          updated_at = NOW()
      WHERE id = $1
        AND meeting_id = $2
        AND status = 'proposed'
      RETURNING ${SUGGESTION_COLUMNS}
    `,
    [
      id,
      meetingId,
      title ?? null,
      description !== undefined,
      description ?? null,
      assigneeId !== undefined,
      assigneeId ?? null,
      dueDate !== undefined,
      dueDate ?? null,
      priority ?? null,
    ]
  )

  return mapSuggestion(result.rows[0])
}

/**
 * Claims a suggestion for review.
 *
 * The `status = 'proposed'` guard is what makes acceptance exactly-once: a
 * duplicate request matches nothing and the caller must treat null as "already
 * reviewed" rather than retrying.
 */
export const markSuggestionReviewed = async (
  { id, meetingId, status, reviewedBy, acceptedActionItemId = null },
  db
) => {
  const result = await executor(db).query(
    `
      UPDATE analysis_action_item_suggestions
      SET status = $3,
          reviewed_by = $4,
          reviewed_at = NOW(),
          accepted_action_item_id = $5,
          updated_at = NOW()
      WHERE id = $1
        AND meeting_id = $2
        AND status = 'proposed'
      RETURNING ${SUGGESTION_COLUMNS}
    `,
    [id, meetingId, status, reviewedBy, acceptedActionItemId]
  )

  return mapSuggestion(result.rows[0])
}
