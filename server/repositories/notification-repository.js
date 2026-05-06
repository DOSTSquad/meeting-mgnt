import { query } from '../db/postgres.js'

const mapNotification = (row) => {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    recipientUserId: row.recipient_user_id,
    type: row.type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    title: row.title,
    detail: row.detail,
    eventAt: row.event_at.toISOString(),
    readAt: row.read_at ? row.read_at.toISOString() : null,
    isRead: Boolean(row.read_at),
    archivedAt: row.archived_at ? row.archived_at.toISOString() : null,
    idempotencyKey: row.idempotency_key ?? null,
    createdAt: row.created_at.toISOString(),
  }
}

const encodeCursor = (row) => {
  if (!row?.event_at || !row?.id) {
    return null
  }

  return Buffer.from(
    JSON.stringify({
      eventAt: row.event_at.toISOString(),
      id: row.id,
      isRead: Boolean(row.read_at),
    })
  ).toString('base64url')
}

export const decodeNotificationCursor = (cursor) => {
  if (!cursor) {
    return null
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (!parsed.eventAt || !parsed.id) {
      return null
    }

    return {
      eventAt: parsed.eventAt,
      id: parsed.id,
      isRead: Boolean(parsed.isRead),
    }
  } catch {
    return null
  }
}

export const createNotification = async ({
  recipientUserId,
  type,
  entityType,
  entityId,
  title,
  detail,
  eventAt = new Date(),
  idempotencyKey = null,
}) => {
  const result = await query(
    `
      INSERT INTO notifications (
        recipient_user_id, type, entity_type, entity_id, title, detail, event_at, idempotency_key
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (recipient_user_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL
        DO NOTHING
      RETURNING *
    `,
    [recipientUserId, type, entityType, entityId, title, detail, eventAt, idempotencyKey]
  )

  return mapNotification(result.rows[0])
}

export const createNotifications = async (notifications) => {
  const created = []

  for (const notification of notifications) {
    const row = await createNotification(notification)
    if (row) {
      created.push(row)
    }
  }

  return created
}

export const listNotificationsForUser = async (userId, { limit = 20, cursor } = {}) => {
  const decodedCursor = decodeNotificationCursor(cursor)
  const cursorFilter = decodedCursor
    ? `
        AND (
          (read_at IS NOT NULL)::boolean > $3::boolean
          OR (
            (read_at IS NOT NULL)::boolean = $3::boolean
            AND (event_at, id) < ($4::timestamptz, $5::uuid)
          )
        )
      `
    : ''
  const requestedLimit = Number(limit)
  const pageSize = Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : 20
  const params = decodedCursor
    ? [userId, pageSize + 1, decodedCursor.isRead, decodedCursor.eventAt, decodedCursor.id]
    : [userId, pageSize + 1]

  const result = await query(
    `
      SELECT *
      FROM notifications
      WHERE recipient_user_id = $1
        AND archived_at IS NULL
        ${cursorFilter}
      ORDER BY (read_at IS NOT NULL)::boolean ASC, event_at DESC, id DESC
      LIMIT $2
    `,
    params
  )

  const rows = result.rows.slice(0, pageSize)

  return {
    notifications: rows.map(mapNotification),
    nextCursor: result.rows.length > pageSize ? encodeCursor(rows.at(-1)) : null,
  }
}

export const getNotificationSummaryForUser = async (userId, latestLimit = 5) => {
  const requestedLimit = Number(latestLimit)
  const pageSize = Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : 5
  const [countResult, latestResult] = await Promise.all([
    query(
      `
        SELECT COUNT(*)::int AS unread_count
        FROM notifications
        WHERE recipient_user_id = $1
          AND read_at IS NULL
          AND archived_at IS NULL
      `,
      [userId]
    ),
    query(
      `
        SELECT *
        FROM notifications
        WHERE recipient_user_id = $1
          AND archived_at IS NULL
        ORDER BY (read_at IS NOT NULL)::boolean ASC, event_at DESC, id DESC
        LIMIT $2
      `,
      [userId, pageSize + 1]
    ),
  ])

  const rows = latestResult.rows.slice(0, pageSize)

  return {
    unreadCount: countResult.rows[0]?.unread_count ?? 0,
    latest: rows.map(mapNotification),
    nextCursor: latestResult.rows.length > pageSize ? encodeCursor(rows.at(-1)) : null,
  }
}

export const markNotificationRead = async (userId, id) => {
  const result = await query(
    `
      UPDATE notifications
      SET read_at = COALESCE(read_at, NOW())
      WHERE recipient_user_id = $1
        AND id = $2
        AND archived_at IS NULL
      RETURNING *
    `,
    [userId, id]
  )

  return mapNotification(result.rows[0])
}

export const markNotificationsRead = async (userId, ids) => {
  const result = await query(
    `
      UPDATE notifications
      SET read_at = COALESCE(read_at, NOW())
      WHERE recipient_user_id = $1
        AND id = ANY($2::uuid[])
        AND archived_at IS NULL
      RETURNING id
    `,
    [userId, ids]
  )

  return result.rowCount
}

export const markAllNotificationsRead = async (userId) => {
  const result = await query(
    `
      UPDATE notifications
      SET read_at = COALESCE(read_at, NOW())
      WHERE recipient_user_id = $1
        AND read_at IS NULL
        AND archived_at IS NULL
      RETURNING id
    `,
    [userId]
  )

  return result.rowCount
}

export const archiveNotification = async (userId, id) => {
  const result = await query(
    `
      UPDATE notifications
      SET
        read_at = COALESCE(read_at, NOW()),
        archived_at = COALESCE(archived_at, NOW())
      WHERE recipient_user_id = $1
        AND id = $2
        AND archived_at IS NULL
      RETURNING *
    `,
    [userId, id]
  )

  return mapNotification(result.rows[0])
}

export const archiveReadNotifications = async (userId) => {
  const result = await query(
    `
      UPDATE notifications
      SET archived_at = COALESCE(archived_at, NOW())
      WHERE recipient_user_id = $1
        AND read_at IS NOT NULL
        AND archived_at IS NULL
      RETURNING id
    `,
    [userId]
  )

  return result.rowCount
}
