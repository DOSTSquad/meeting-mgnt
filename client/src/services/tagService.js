export const listTags = async (client) => {
  const response = await client.get('/api/tags')
  return response.data?.tags || []
}

export const createTag = async (client, name) => {
  const response = await client.post('/api/tags', { name })
  return response.data.tag
}
