import {
  listMyActionItems,
  listPendingAvailabilityRequestsForUser,
  listPendingMeetingRequestsForUser,
  listRecentMeetingsForUser,
} from '../repositories/dashboard-repository.js'
import { getNotificationSummary, listNotifications } from './notification-service.js'

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

export const getNotificationsData = async (userId, { limit, cursor } = {}) => {
  return listNotifications(userId, { limit, cursor })
}

export const getNotificationSummaryData = async (userId) => {
  return getNotificationSummary(userId)
}
