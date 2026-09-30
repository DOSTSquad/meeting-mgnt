export const listUsers = async (client) => {
  const response = await client.get('/api/users')
  return response.data?.users || []
}

export const updateUser = async (client, id, payload) => {
  const response = await client.put(`/api/users/${id}`, payload)
  return response.data.user
}

export const deleteUser = async (client, id) => {
  await client.delete(`/api/users/${id}`)
}

export const createUser = async (client, payload) => {
  const response = await client.post('/api/users', payload)
  return response.data.user
}
