export const submitMeetingChangeRequest = async (client, meetingId, message) => {
  const response = await client.post(`/api/meetings/${meetingId}/change-requests`, { message })
  return response.data.changeRequest
}

export const getMeetingChangeRequests = async (client, meetingId) => {
  const response = await client.get(`/api/meetings/${meetingId}/change-requests`)
  return response.data.changeRequests
}

export const markMeetingChangeRequestRead = async (client, meetingId, requestId) => {
  const response = await client.patch(
    `/api/meetings/${meetingId}/change-requests/${requestId}/read`
  )
  return response.data.changeRequest
}
