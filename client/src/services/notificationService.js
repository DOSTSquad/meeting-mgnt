export const sortNotificationsUnreadFirst = (notifications = []) =>
  [...notifications].sort((left, right) => {
    const leftReadRank = left?.isRead || left?.readAt ? 1 : 0
    const rightReadRank = right?.isRead || right?.readAt ? 1 : 0

    if (leftReadRank !== rightReadRank) {
      return leftReadRank - rightReadRank
    }

    return new Date(right?.eventAt || 0).getTime() - new Date(left?.eventAt || 0).getTime()
  })

export const getNotificationSummary = async (client) => {
  const response = await client.get('/api/notifications/summary')
  return {
    unreadCount: response.data?.unreadCount || 0,
    notifications: sortNotificationsUnreadFirst(response.data?.notifications || []),
    nextCursor: response.data?.nextCursor || null,
  }
}

export const listNotifications = async (client, params = {}) => {
  const response = await client.get('/api/notifications', { params })
  return {
    notifications: sortNotificationsUnreadFirst(response.data?.notifications || []),
    nextCursor: response.data?.nextCursor || null,
  }
}

export const markNotificationRead = async (client, notificationId) => {
  const response = await client.post(`/api/notifications/${notificationId}/read`)

  return response.data?.notification ?? null
}

export const markNotificationsRead = async (client, ids) => {
  const response = await client.post('/api/notifications/read', { ids })

  return response.data?.updatedCount ?? 0
}

export const markAllNotificationsRead = async (client) => {
  const response = await client.post('/api/notifications/read-all')

  return response.data?.updatedCount ?? 0
}

export const archiveNotification = async (client, notificationId) => {
  const response = await client.post(`/api/notifications/${notificationId}/archive`)

  return response.data?.notification ?? null
}

export const archiveReadNotifications = async (client) => {
  const response = await client.post('/api/notifications/archive-read')

  return response.data?.archivedCount ?? 0
}
