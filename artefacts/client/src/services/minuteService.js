export const getMeetingMinutes = async (client, meetingId) => {
  const response = await client.get(`/api/meetings/${meetingId}/minutes`)
  return response.data.minutes
}

export const updateMeetingMinutes = async (client, meetingId, payload) => {
  const response = await client.put(`/api/meetings/${meetingId}/minutes`, payload)
  return response.data.minutes
}
