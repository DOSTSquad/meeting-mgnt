export const getMeetingRecording = async (client, meetingId) => {
  const response = await client.get(`/api/meetings/${meetingId}/recording`)
  return response.data
}

export const uploadMeetingRecording = async (client, meetingId, file, { replace = false } = {}) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('replace', String(replace))

  const response = await client.put(`/api/meetings/${meetingId}/recording`, formData)
  return response.data
}

export const removeMeetingRecording = async (client, meetingId) => {
  await client.delete(`/api/meetings/${meetingId}/recording`)
}

export const generateMinutesFromRecording = async (client, meetingId) => {
  const response = await client.post(`/api/meetings/${meetingId}/recording/generate-minutes`)
  return response.data
}

export const getMeetingAnalysis = async (client, meetingId) => {
  const response = await client.get(`/api/meetings/${meetingId}/recording/analysis`)
  return response.data
}
