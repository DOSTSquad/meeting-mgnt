import { apiBaseUrl } from '../lib/apiClient.js'

export const login = async ({ email, password }) => {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(data.error || data.message || 'Unable to sign in right now')
    error.response = { data, status: response.status }
    throw error
  }

  return data
}
