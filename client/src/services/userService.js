export const listUsers = async (client) => {
  const response = await client.get('/api/users')
  return response.data?.users || []
}
