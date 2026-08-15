import { Router } from 'express'
import { body, param } from 'express-validator'

import {
  getPublicInvitation,
  submitPublicAvailability,
} from '../controllers/meeting-request-controller.js'
import { handleValidationErrors } from '../middleware/validation-middleware.js'

const publicInvitationRouter = Router()
const tokenValidation = param('token')
  .isString()
  .withMessage('token must be a string')
  .bail()
  .matches(/^[A-Za-z0-9_-]{40,100}$/)
  .withMessage('token is invalid')

publicInvitationRouter.get(
  '/:token',
  [tokenValidation],
  handleValidationErrors,
  getPublicInvitation
)

publicInvitationRouter.put(
  '/:token/availability',
  [
    tokenValidation,
    body('responses').isArray({ min: 1 }).withMessage('responses must be a non-empty array'),
    body('responses.*.timeOptionId').isUUID().withMessage('timeOptionId must be a UUID'),
    body('responses.*.isAvailable').isBoolean().withMessage('isAvailable must be boolean'),
  ],
  handleValidationErrors,
  submitPublicAvailability
)

export default publicInvitationRouter
