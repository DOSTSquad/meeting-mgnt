export const getMeetingRecording = async (client, meetingId) => {
  const response = await client.get(`/api/meetings/${meetingId}/recording`)
  return response.data
}

export const generateMeetingRecording = async (client, meetingId) => {
  const response = await client.post(`/api/meetings/${meetingId}/recording/generate`)
  return response.data
}

export const uploadMeetingRecording = async (
  client,
  meetingId,
  file,
  { replace = false, consentConfirmed = false } = {}
) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('replace', String(replace))
  formData.append('consentConfirmed', String(consentConfirmed))

  const response = await client.put(`/api/meetings/${meetingId}/recording`, formData)
  return response.data
}

export const removeMeetingRecording = async (client, meetingId) => {
  await client.delete(`/api/meetings/${meetingId}/recording`)
}

export const getMeetingAnalysis = async (client, meetingId) => {
  const response = await client.get(`/api/meetings/${meetingId}/recording/analysis`)
  return response.data
}

export const acceptAnalysisSuggestion = async (client, meetingId, suggestionId) => {
  const response = await client.post(
    `/api/meetings/${meetingId}/analysis-suggestions/${suggestionId}/accept`
  )
  return response.data
}

export const rejectAnalysisSuggestion = async (client, meetingId, suggestionId) => {
  const response = await client.post(
    `/api/meetings/${meetingId}/analysis-suggestions/${suggestionId}/reject`
  )
  return response.data
}

export const editAnalysisSuggestion = async (client, meetingId, suggestionId, updates) => {
  const response = await client.patch(
    `/api/meetings/${meetingId}/analysis-suggestions/${suggestionId}`,
    updates
  )
  return response.data
}
