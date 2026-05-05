import { Router } from 'express'
import { body, param } from 'express-validator'

import { getForMeeting, updateForMeeting } from '../controllers/minute-controller.js'
import { handleValidationErrors } from '../middleware/validation-middleware.js'
import { ALLOWED_MINUTE_STATUSES } from '../services/minute-service.js'

const minuteRouter = Router({ mergeParams: true })

const updateValidators = [
  param('meetingId').isUUID().withMessage('meetingId must be a UUID'),
  body('content').optional().isString().withMessage('content must be a string'),
  body('keyDiscussions').optional().isString().withMessage('keyDiscussions must be a string'),
  body('decisions').optional().isString().withMessage('decisions must be a string'),
  body('facilitatorId')
    .optional({ nullable: true })
    .isUUID()
    .withMessage('facilitatorId must be a UUID'),
  body('recorderId').optional({ nullable: true }).isUUID().withMessage('recorderId must be a UUID'),
  body('status').optional().isIn(ALLOWED_MINUTE_STATUSES).withMessage('Invalid status'),
]

minuteRouter.get(
  '/',
  [param('meetingId').isUUID().withMessage('meetingId must be a UUID')],
  handleValidationErrors,
  getForMeeting
)

minuteRouter.put('/', updateValidators, handleValidationErrors, updateForMeeting)

minuteRouter.put(
  '/:minutesId',
  [
    param('meetingId').isUUID().withMessage('meetingId must be a UUID'),
    param('minutesId').isUUID().withMessage('minutesId must be a UUID'),
    ...updateValidators.slice(1),
  ],
  handleValidationErrors,
  updateForMeeting
)

export default minuteRouter
