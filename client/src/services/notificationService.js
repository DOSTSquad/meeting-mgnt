export const listNotifications = async (client) => {
  const response = await client.get('/api/notifications')
  return response.data?.notifications || []
}
