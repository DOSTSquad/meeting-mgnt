export const getDashboard = async (client) => {
  const response = await client.get('/api/dashboard')
  return response.data
}
