import { listActionItems } from './actionItemService.js'
import { getDashboard } from './dashboardService.js'
import { listMeetings } from './meetingService.js'
import { listNotifications } from './notificationService.js'
import { listTags } from './tagService.js'
import { listUsers } from './userService.js'

export const loadAppData = async (client) => {
  const dashboard = await getDashboard(client)
  const meetings = await listMeetings(client, { limit: 100 })
  const actionItems = await listActionItems(client)
  const notifications = await listNotifications(client)
  const users = await listUsers(client)
  const tags = await listTags(client)

  return {
    dashboard,
    meetings,
    actionItems,
    notifications,
    users,
    tags,
  }
}
