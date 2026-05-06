export const getNotificationSummary = async (client) => {
  const response = await client.get('/api/notifications/summary')
  return {
    unreadCount: response.data?.unreadCount || 0,
    notifications: response.data?.notifications || [],
    nextCursor: response.data?.nextCursor || null,
  }
}

export const listNotifications = async (client, params = {}) => {
  const response = await client.get('/api/notifications', { params })
  return {
    notifications: response.data?.notifications || [],
    nextCursor: response.data?.nextCursor || null,
  }
}
