import { Router } from 'express'
import { body, param } from 'express-validator'

import {
  applyGeneratedForMeeting,
  getForMeeting,
  updateForMeeting,
} from '../controllers/minute-controller.js'
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
  body('generatedFromTranscriptId')
    .optional({ nullable: true })
    .isUUID()
    .withMessage('generatedFromTranscriptId must be a UUID'),
  body('status').optional().isIn(ALLOWED_MINUTE_STATUSES).withMessage('Invalid status'),
]

minuteRouter.get(
  '/',
  [param('meetingId').isUUID().withMessage('meetingId must be a UUID')],
  handleValidationErrors,
  getForMeeting
)

minuteRouter.post(
  '/apply-generated',
  [
    param('meetingId').isUUID().withMessage('meetingId must be a UUID'),
    body('analysisRunId').isUUID().withMessage('analysisRunId must be a UUID'),
    // Required, not optional: an apply without an expected version would be
    // last-write-wins, which is exactly what this endpoint exists to prevent.
    body('expectedVersion')
      .isInt({ min: 1 })
      .withMessage('expectedVersion must be a positive integer'),
  ],
  handleValidationErrors,
  applyGeneratedForMeeting
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
