import {
  listMyActionItems,
  listNotificationItemsForUser,
  listPendingRsvpMeetingsForUser,
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

  const [recentMeetings, pendingRsvpMeetings, pendingMeetingRequests, myActionItems] =
    await Promise.all([
      listRecentMeetingsForUser(userId, 6),
      listPendingRsvpMeetingsForUser(userId, 3),
      listPendingMeetingRequestsForUser(userId, 5),
      listMyActionItems(userId, 6),
    ])

  return {
    recentMeetings,
    pendingRsvpMeetings,
    pendingMeetingRequests,
    myActionItems,
  }
}

export const getNotificationsData = async (userId) => {
  assertUser(userId)

  const notifications = await listNotificationItemsForUser(userId, 30)

  return { notifications }
}
