export const getMeetingMinutes = async (client, meetingId) => {
  const response = await client.get(`/api/meetings/${meetingId}/minutes`)
  return response.data.minutes
}

export const updateMeetingMinutes = async (client, meetingId, payload) => {
  const response = await client.put(`/api/meetings/${meetingId}/minutes`, payload)
  return response.data.minutes
}

export const applyGeneratedMinutes = async (
  client,
  meetingId,
  { analysisRunId, expectedVersion }
) => {
  const response = await client.post(`/api/meetings/${meetingId}/minutes/apply-generated`, {
    analysisRunId,
    expectedVersion,
  })
  return response.data
}
