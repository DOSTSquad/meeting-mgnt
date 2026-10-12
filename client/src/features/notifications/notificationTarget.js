export const getNotificationPath = (notification) => {
  if (!notification?.entityType || !notification.entityId) {
    return null
  }

  if (notification.entityType === 'meeting') {
    return `/meetings/${notification.entityId}`
  }

  if (notification.entityType === 'action_item') {
    return `/action-items?item=${notification.entityId}`
  }

  if (
    notification.entityType === 'meeting_request' &&
    notification.type === 'meeting_request_invited'
  ) {
    return '/dashboard'
  }

  return null
}
