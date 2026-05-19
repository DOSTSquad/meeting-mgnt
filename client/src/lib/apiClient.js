import axios from 'axios'

export const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '/')

export const buildApiUrl = (path) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  if (apiBaseUrl === '/') {
    return normalizedPath
  }

  return `${apiBaseUrl.replace(/\/$/, '')}${normalizedPath}`
}

export const getApiClient = (token) =>
  axios.create({
    baseURL: apiBaseUrl,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
