import {
  archiveNotification,
  archiveReadNotifications,
  createNotification,
  createNotifications,
  getNotificationSummaryForUser,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationsRead,
} from '../repositories/notification-repository.js'

const createHttpError = (message, statusCode) => {
  const error = new Error(message)
  error.statusCode = statusCode

  return error
}

const assertUser = (userId) => {
  if (!userId) {
    throw createHttpError('Authentication required', 401)
  }
}

const normalizeLimit = (value, fallback = 20, maximum = 50) => {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.min(parsed, maximum)
}

const uniqueUserIds = (userIds) => [...new Set(userIds.filter(Boolean))]

export const listNotifications = async (userId, { limit, cursor } = {}) => {
  assertUser(userId)

  return listNotificationsForUser(userId, {
    limit: normalizeLimit(limit),
    cursor,
  })
}

export const getNotificationSummary = async (userId) => {
  assertUser(userId)

  const summary = await getNotificationSummaryForUser(userId, 5)

  return {
    unreadCount: summary.unreadCount,
    notifications: summary.latest,
    nextCursor: summary.nextCursor,
  }
}

export const readNotification = async (userId, id) => {
  assertUser(userId)

  const notification = await markNotificationRead(userId, id)
  if (!notification) {
    throw createHttpError('Notification not found', 404)
  }

  return { notification }
}

export const readNotifications = async (userId, ids) => {
  assertUser(userId)

  return { updatedCount: await markNotificationsRead(userId, ids) }
}

export const readAllNotifications = async (userId) => {
  assertUser(userId)

  return { updatedCount: await markAllNotificationsRead(userId) }
}

export const archiveOneNotification = async (userId, id) => {
  assertUser(userId)

  const notification = await archiveNotification(userId, id)
  if (!notification) {
    throw createHttpError('Notification not found', 404)
  }

  return { notification }
}

export const archiveReadNotificationsForUser = async (userId) => {
  assertUser(userId)

  return { archivedCount: await archiveReadNotifications(userId) }
}

export const notifyMeetingCreated = async (meeting, recipientUserIds = [meeting?.ownerId]) => {
  const recipients = uniqueUserIds(recipientUserIds)

  return createNotifications(
    recipients.map((recipientUserId) => ({
      recipientUserId,
      type: 'meeting_created',
      entityType: 'meeting',
      entityId: meeting.id,
      title: meeting.title,
      detail: 'A new meeting has been created.',
      eventAt: meeting.createdAt ? new Date(meeting.createdAt) : new Date(),
      idempotencyKey: `meeting_created:${meeting.id}`,
    }))
  )
}

export const notifyActionItemAssigned = async (actionItem) => {
  if (!actionItem?.assigneeId) {
    return null
  }

  return createNotification({
    recipientUserId: actionItem.assigneeId,
    type: 'task_assigned',
    entityType: 'action_item',
    entityId: actionItem.id,
    title: actionItem.title,
    detail: 'A task has been assigned to you.',
    eventAt: actionItem.updatedAt ? new Date(actionItem.updatedAt) : new Date(),
    idempotencyKey: `task_assigned:${actionItem.id}`,
  })
}

export const notifyMeetingRequestInvited = async (meetingRequest, invitees) => {
  const knownInvitees = invitees.filter((invitee) => invitee.userId)

  return createNotifications(
    knownInvitees.map((invitee) => ({
      recipientUserId: invitee.userId,
      type: 'meeting_request_invited',
      entityType: 'meeting_request',
      entityId: meetingRequest.id,
      title: meetingRequest.title,
      detail: 'You have been invited to share your availability.',
      eventAt: invitee.invitedAt ? new Date(invitee.invitedAt) : new Date(),
      idempotencyKey: `meeting_request_invited:${meetingRequest.id}:${invitee.id}`,
    }))
  )
}

export const notifyMeetingRequestConfirmed = async (meetingRequest, meeting, recipientUserIds) => {
  const recipients = uniqueUserIds(recipientUserIds)

  return createNotifications(
    recipients.map((recipientUserId) => ({
      recipientUserId,
      type: 'meeting_request_confirmed',
      entityType: 'meeting',
      entityId: meeting.id,
      title: meeting.title,
      detail: 'A meeting request has been confirmed.',
      eventAt: meetingRequest.updatedAt ? new Date(meetingRequest.updatedAt) : new Date(),
      idempotencyKey: `meeting_request_confirmed:${meetingRequest.id}`,
    }))
  )
}
