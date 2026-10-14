export const listTags = async (client) => {
  const response = await client.get('/api/tags')
  return response.data?.tags || []
}
