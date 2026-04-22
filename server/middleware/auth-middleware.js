import { getUserForToken } from '../services/auth-service.js'

const PUBLIC_API_PATHS = new Set(['/auth/register', '/auth/login'])

const getBearerToken = (authorizationHeader) => {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return null
  }

  return authorizationHeader.slice('Bearer '.length).trim()
}

export const requireAuth = async (req, res, next) => {
  if (PUBLIC_API_PATHS.has(req.path)) {
    next()
    return
  }

  const token = getBearerToken(req.get('authorization'))

  if (!token) {
    res.status(401).json({ error: 'Authorization token is required' })
    return
  }

  try {
    req.user = await getUserForToken(token)
    next()
  } catch (error) {
    next(error)
  }
}
