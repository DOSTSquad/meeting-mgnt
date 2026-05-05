export const createMeetingRequestService = (client) => ({
  createRequest: async (payload) => {
    const response = await client.post('/api/meeting-requests', payload)
    return response.data.meetingRequest
  },

  updateTimeOptions: async (requestId, timeOptions) => {
    const response = await client.put(`/api/meeting-requests/${requestId}/time-options`, {
      timeOptions,
    })
    return response.data.timeOptions
  },

  updateInvitees: async (requestId, invitees) => {
    const response = await client.put(`/api/meeting-requests/${requestId}/invitees`, {
      invitees,
    })
    return response.data.invitees
  },

  getRequest: async (requestId) => {
    const response = await client.get(`/api/meeting-requests/${requestId}`)
    return response.data
  },

  getInviteeRequest: async (requestId, inviteeId) => {
    const response = await client.get(`/api/meeting-requests/${requestId}/invitees/${inviteeId}`)
    return response.data
  },

  submitAvailability: async (requestId, inviteeId, responses) => {
    const response = await client.put(
      `/api/meeting-requests/${requestId}/invitees/${inviteeId}/availability`,
      { responses }
    )
    return response.data.responses
  },

  confirmRequest: async (requestId, payload) => {
    const response = await client.post(`/api/meeting-requests/${requestId}/confirm`, payload)
    return response.data
  },
})
