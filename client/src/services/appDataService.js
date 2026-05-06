import { getNotificationSummary } from './notificationService.js'
import { listTags } from './tagService.js'
import { listUsers } from './userService.js'

export const loadAppData = async (client) => {
  const [notificationSummary, users, tags] = await Promise.all([
    getNotificationSummary(client),
    listUsers(client),
    listTags(client),
  ])

  return {
    notifications: notificationSummary.notifications,
    notificationCount: notificationSummary.unreadCount,
    notificationNextCursor: notificationSummary.nextCursor,
    users,
    tags,
  }
}
