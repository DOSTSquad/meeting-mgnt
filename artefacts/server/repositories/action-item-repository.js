import { query } from '../db/postgres.js'
import { getActionItemDueState, isOverdueActionItem } from '../utils/action-items.js'

const ACTION_ITEM_COLUMNS = `
  id,
  meeting_id,
  title,
  description,
  assignee_id,
  due_date,
  status,
  priority,
  source,
  source_ref,
  created_by,
  created_at,
  updated_at,
  completed_at
`

const mapActionItem = (row) => {
  if (!row) {
    return null
  }

  const dueDate = row.due_date ? row.due_date.toISOString() : null
  const isOverdue = isOverdueActionItem({ dueDate: row.due_date, status: row.status })

  return {
    id: row.id,
    meetingId: row.meeting_id,
    title: row.title,
    description: row.description ?? null,
    assigneeId: row.assignee_id ?? null,
    dueDate,
    status: row.status,
    isOverdue,
    dueState: getActionItemDueState({ dueDate: row.due_date, status: row.status }),
    priority: row.priority,
    source: row.source,
    sourceRef: row.source_ref ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
  }
}

export const listByMeeting = async (meetingId, { status, assigneeId } = {}) => {
  const filters = ['meeting_id = $1']
  const params = [meetingId]
  let paramIndex = 2

  if (status) {
    filters.push(`status = $${paramIndex}`)
    params.push(status)
    paramIndex += 1
  }

  if (assigneeId) {
    filters.push(`assignee_id = $${paramIndex}`)
    params.push(assigneeId)
    paramIndex += 1
  }

  const result = await query(
    `
      SELECT ${ACTION_ITEM_COLUMNS}
      FROM action_items
      WHERE ${filters.join(' AND ')}
      ORDER BY created_at DESC, id ASC
    `,
    params
  )

  return result.rows.map(mapActionItem)
}

export const listByAssignee = async (assigneeId, { status, priority } = {}) => {
  const filters = ['assignee_id = $1']
  const params = [assigneeId]
  let paramIndex = 2

  if (status) {
    filters.push(`status = $${paramIndex}`)
    params.push(status)
    paramIndex += 1
  }

  if (priority) {
    filters.push(`priority = $${paramIndex}`)
    params.push(priority)
    paramIndex += 1
  }

  const result = await query(
    `
      SELECT ${ACTION_ITEM_COLUMNS}
      FROM action_items
      WHERE ${filters.join(' AND ')}
      ORDER BY due_date ASC NULLS LAST, created_at DESC
    `,
    params
  )

  return result.rows.map(mapActionItem)
}

export const findById = async (id) => {
  const result = await query(
    `
      SELECT ${ACTION_ITEM_COLUMNS}
      FROM action_items
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  )

  return mapActionItem(result.rows[0] ?? null)
}

export const insert = async ({
  meetingId,
  title,
  description = null,
  assigneeId = null,
  dueDate = null,
  priority = 'medium',
  createdBy,
  source = 'manual',
  sourceRef = null,
}) => {
  const result = await query(
    `
      INSERT INTO action_items (
        meeting_id, title, description, assignee_id, due_date,
        priority, source, source_ref, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING ${ACTION_ITEM_COLUMNS}
    `,
    [meetingId, title, description, assigneeId, dueDate, priority, source, sourceRef, createdBy]
  )

  return mapActionItem(result.rows[0])
}

const UPDATE_FIELD_TO_COLUMN = {
  title: 'title',
  description: 'description',
  assigneeId: 'assignee_id',
  dueDate: 'due_date',
  status: 'status',
  priority: 'priority',
}

export const updateOne = async (id, updates) => {
  const current = await findById(id)

  if (!current) {
    return null
  }

  const setClauses = []
  const params = []
  let paramIndex = 1
  let nextStatus = current.status

  for (const [field, value] of Object.entries(updates)) {
    const column = UPDATE_FIELD_TO_COLUMN[field]

    if (!column || value === undefined) {
      continue
    }

    setClauses.push(`${column} = $${paramIndex}`)
    params.push(value)
    paramIndex += 1

    if (field === 'status') {
      nextStatus = value
    }
  }

  if (setClauses.length === 0) {
    return current
  }

  setClauses.push(`updated_at = NOW()`)

  if (nextStatus !== current.status) {
    if (nextStatus === 'completed') {
      setClauses.push(`completed_at = NOW()`)
    } else if (current.status === 'completed') {
      setClauses.push(`completed_at = NULL`)
    }
  }

  params.push(id)

  await query(
    `
      UPDATE action_items
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
    `,
    params
  )

  return findById(id)
}

export const remove = async (id) => {
  const result = await query(
    `
      DELETE FROM action_items
      WHERE id = $1
      RETURNING id
    `,
    [id]
  )

  return result.rowCount > 0
}
