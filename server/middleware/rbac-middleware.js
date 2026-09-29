const createHttpError = (message, statusCode) => {
  const error = new Error(message)
  error.statusCode = statusCode

  return error
}

const capitalize = (value) => `${value.charAt(0).toUpperCase()}${value.slice(1)}`

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) {
      next(createHttpError('Authentication required', 401))
      return
    }

    if (!roles.includes(req.user.role)) {
      next(createHttpError(`${roles.map(capitalize).join(' or ')} access required`, 403))
      return
    }

    next()
  }
