import { validationResult } from 'express-validator'

export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req)

  if (errors.isEmpty()) {
    next()
    return
  }

  res.status(400).json({
    error: 'Validation failed',
    details: errors.array().map(({ path, msg }) => ({
      field: path,
      message: msg,
    })),
  })
}
