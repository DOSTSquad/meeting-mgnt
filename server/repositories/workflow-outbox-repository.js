import { query, transaction } from '../db/postgres.js'

const executor = (db) => db ?? { query }

const OUTBOX_COLUMNS = `
  id,
  event_type,
  aggregate_type,
  aggregate_id,
  payload,
  status,
  attempts,
  available_at,
  leased_until,
  locked_by,
  last_error,
  dispatched_at,
  created_at,
  updated_at
`

const OUTBOX_COLUMNS_FOR_OUTBOX_ALIAS = `
  outbox.id,
  outbox.event_type,
  outbox.aggregate_type,
  outbox.aggregate_id,
  outbox.payload,
  outbox.status,
  outbox.attempts,
  outbox.available_at,
  outbox.leased_until,
  outbox.locked_by,
  outbox.last_error,
  outbox.dispatched_at,
  outbox.created_at,
  outbox.updated_at
`

const mapNullableDate = (value) => (value ? value.toISOString() : null)

const mapOutboxEvent = (row) => {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    eventType: row.event_type,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    payload: row.payload,
    status: row.status,
    attempts: Number(row.attempts),
    availableAt: row.available_at.toISOString(),
    leasedUntil: mapNullableDate(row.leased_until),
    lockedBy: row.locked_by,
    lastError: row.last_error,
    dispatchedAt: mapNullableDate(row.dispatched_at),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export const createWorkflowOutboxEvent = async (
  { id, eventType, aggregateType, aggregateId, payload },
  db
) => {
  const result = await executor(db).query(
    `
      INSERT INTO workflow_outbox (
        id,
        event_type,
        aggregate_type,
        aggregate_id,
        payload
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (event_type, aggregate_type, aggregate_id) DO UPDATE
      SET updated_at = workflow_outbox.updated_at
      RETURNING ${OUTBOX_COLUMNS}
    `,
    [id, eventType, aggregateType, aggregateId, JSON.stringify(payload)]
  )

  return mapOutboxEvent(result.rows[0])
}

export const claimWorkflowOutboxEvents = async ({ limit = 10, leaseSeconds = 60, workerId } = {}) =>
  transaction(async (client) => {
    const result = await client.query(
      `
        WITH claimable AS (
          SELECT id
          FROM workflow_outbox
          WHERE (
              status IN ('pending','failed')
              OR (status = 'processing' AND leased_until < NOW())
            )
            AND available_at <= NOW()
          ORDER BY created_at ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE workflow_outbox outbox
        SET status = 'processing',
            attempts = outbox.attempts + 1,
            leased_until = NOW() + ($2::text || ' seconds')::interval,
            locked_by = $3,
            updated_at = NOW()
        FROM claimable
        WHERE outbox.id = claimable.id
        RETURNING ${OUTBOX_COLUMNS_FOR_OUTBOX_ALIAS}
      `,
      [limit, leaseSeconds, workerId]
    )

    return result.rows.map(mapOutboxEvent)
  })

export const markWorkflowOutboxDispatched = async ({ id, workerId, attempts }) => {
  const result = await query(
    `
      UPDATE workflow_outbox
      SET status = 'dispatched',
          dispatched_at = NOW(),
          leased_until = NULL,
          locked_by = NULL,
          last_error = NULL,
          updated_at = NOW()
      WHERE id = $1
        AND locked_by = $2
        AND attempts = $3
        AND status = 'processing'
      RETURNING ${OUTBOX_COLUMNS}
    `,
    [id, workerId, attempts]
  )

  return mapOutboxEvent(result.rows[0])
}

export const markWorkflowOutboxFailed = async ({
  id,
  workerId,
  attempts,
  errorMessage,
  retryDelaySeconds = 30,
}) => {
  const result = await query(
    `
      UPDATE workflow_outbox
      SET status = 'failed',
          available_at = NOW() + ($2::text || ' seconds')::interval,
          leased_until = NULL,
          locked_by = NULL,
          last_error = $3,
          updated_at = NOW()
      WHERE id = $1
        AND locked_by = $4
        AND attempts = $5
        AND status = 'processing'
      RETURNING ${OUTBOX_COLUMNS}
    `,
    [id, retryDelaySeconds, errorMessage, workerId, attempts]
  )

  return mapOutboxEvent(result.rows[0])
}
