export const listActionItems = async (client, scope = 'mine') => {
  const response = await client.get('/api/action-items', { params: { scope } })
  return response.data?.actionItems || []
}

export const createMeetingActionItem = async (client, meetingId, payload) => {
  const response = await client.post(`/api/meetings/${meetingId}/action-items`, payload)
  return response.data.actionItem
}

export const updateActionItem = async (client, actionItemId, payload) => {
  const response = await client.put(`/api/action-items/${actionItemId}`, payload)
  return response.data.actionItem
}

export const deleteActionItem = async (client, actionItemId) => {
  await client.delete(`/api/action-items/${actionItemId}`)
}
