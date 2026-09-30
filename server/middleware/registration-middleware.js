import { isSelfRegistrationEnabled } from '../services/auth-service.js'

export const requireSelfRegistrationEnabled = (_req, _res, next) => {
  if (isSelfRegistrationEnabled()) {
    next()
    return
  }

  const error = new Error(
    'Self-registration is disabled. Ask an administrator to create your account.'
  )
  error.statusCode = 403
  next(error)
}
