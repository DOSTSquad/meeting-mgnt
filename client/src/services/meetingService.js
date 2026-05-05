export const listMeetings = async (client, params = {}) => {
  const response = await client.get('/api/meetings', { params })
  return response.data?.meetings || []
}

export const createMeeting = async (client, payload) => {
  const response = await client.post('/api/meetings', payload)
  return response.data.meeting
}

export const getMeeting = async (client, meetingId) => {
  const response = await client.get(`/api/meetings/${meetingId}`)
  return response.data.meeting
}

export const updateMeeting = async (client, meetingId, payload) => {
  const response = await client.put(`/api/meetings/${meetingId}`, payload)
  return response.data.meeting
}

export const listMeetingParticipants = async (client, meetingId) => {
  const response = await client.get(`/api/meetings/${meetingId}/participants`)
  return response.data?.participants || []
}

export const addMeetingParticipants = async (client, meetingId, payload) => {
  const response = await client.post(`/api/meetings/${meetingId}/participants`, payload)
  return response.data.participants
}

export const listMeetingActionItems = async (client, meetingId) => {
  const response = await client.get(`/api/meetings/${meetingId}/action-items`)
  return response.data?.actionItems || []
}

export const listMeetingFiles = async (client, meetingId) => {
  const response = await client.get(`/api/meetings/${meetingId}/files`)
  return response.data?.files || []
}

export const getMeetingDetail = async (client, meetingId) => {
  const meeting = await getMeeting(client, meetingId)
  const participants = await listMeetingParticipants(client, meetingId)
  const actionItems = await listMeetingActionItems(client, meetingId)
  const files = await listMeetingFiles(client, meetingId)

  return {
    meeting,
    participants,
    actionItems,
    files,
  }
}
