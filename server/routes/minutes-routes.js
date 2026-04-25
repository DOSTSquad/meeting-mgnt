import { Router } from 'express'
import { body, param } from 'express-validator'

import { getForMeeting, update } from '../controllers/minutes-controller.js'
import { handleValidationErrors } from '../middleware/validation-middleware.js'

export const meetingMinutesRouter = Router({ mergeParams: true })

meetingMinutesRouter.get(
  '/',
  [param('meetingId').isUUID().withMessage('meetingId must be a UUID')],
  handleValidationErrors,
  getForMeeting
)

export const minutesRouter = Router()

minutesRouter.put(
  '/:id',
  [
    param('id').isUUID().withMessage('id must be a UUID'),
    body('body')
      .exists()
      .withMessage('body is required')
      .bail()
      .isString()
      .withMessage('body must be a string'),
  ],
  handleValidationErrors,
  update
)
