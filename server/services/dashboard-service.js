import {
  getNotificationSummaryForUser,
  listMyActionItems,
  listNotificationItemsForUser,
  listPendingAvailabilityRequestsForUser,
  listPendingMeetingRequestsForUser,
  listRecentMeetingsForUser,
} from '../repositories/dashboard-repository.js'

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

export const getDashboardData = async (userId) => {
  assertUser(userId)

  const recentMeetings = await listRecentMeetingsForUser(userId, 6)
  const pendingMeetingRequests = await listPendingMeetingRequestsForUser(userId, 5)
  const pendingAvailabilityRequests = await listPendingAvailabilityRequestsForUser(userId, 5)
  const myActionItems = await listMyActionItems(userId, 6)

  return {
    recentMeetings,
    pendingMeetingRequests,
    pendingAvailabilityRequests,
    myActionItems,
  }
}

const normalizeLimit = (value, fallback = 20, maximum = 50) => {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.min(parsed, maximum)
}

export const getNotificationsData = async (userId, { limit, cursor } = {}) => {
  assertUser(userId)

  const { notifications, nextCursor } = await listNotificationItemsForUser(userId, {
    limit: normalizeLimit(limit),
    cursor,
  })

  return { notifications, nextCursor }
}

export const getNotificationSummaryData = async (userId) => {
  assertUser(userId)

  const summary = await getNotificationSummaryForUser(userId, 5)

  return {
    unreadCount: summary.unreadCount,
    notifications: summary.latest,
    nextCursor: summary.nextCursor,
  }
}
