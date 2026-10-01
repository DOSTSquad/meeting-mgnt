import { buildApiUrl } from '../lib/apiClient.js'

export const register = async ({ name, email, password }) => {
  const response = await fetch(buildApiUrl('/api/auth/register'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, email, password }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(data.error || data.message || 'Unable to create account right now')
    error.response = { data, status: response.status }
    throw error
  }

  return data
}

export const login = async ({ email, password }) => {
  const response = await fetch(buildApiUrl('/api/auth/login'), {
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

export const changePassword = async (client, { currentPassword, newPassword }) => {
  await client.put('/api/auth/me/password', { currentPassword, newPassword })
}
