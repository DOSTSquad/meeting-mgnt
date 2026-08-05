import { buildApiUrl } from '../lib/apiClient.js'

export const createMeetingRequestService = (client) => ({
  createRequest: async (payload) => {
    const response = await client.post('/api/meeting-requests', payload)
    return response.data.meetingRequest
  },

  updateRequest: async (requestId, payload) => {
    const response = await client.put(`/api/meeting-requests/${requestId}`, payload)
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

  sendInvitations: async (requestId) => {
    const response = await client.post(`/api/meeting-requests/${requestId}/send-invitations`)
    return response.data
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

  terminateRequest: async (requestId) => {
    const response = await client.delete(`/api/meeting-requests/${requestId}`)
    return response.data
  },
})

export const getPublicInvitation = async (token) => {
  const response = await fetch(buildApiUrl(`/api/public/invitations/${encodeURIComponent(token)}`))
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error || 'Unable to load invitation')
  }

  return data
}

export const submitPublicAvailability = async (token, responses) => {
  const response = await fetch(
    buildApiUrl(`/api/public/invitations/${encodeURIComponent(token)}/availability`),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responses }),
    }
  )
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error || 'Unable to submit availability')
  }

  return data.responses
}
