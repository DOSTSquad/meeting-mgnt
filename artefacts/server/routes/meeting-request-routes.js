import { Router } from 'express'
import { body, param } from 'express-validator'

import {
  confirm,
  create,
  getInviteeDetail,
  getOne,
  replaceInvitees,
  replaceTimeOptions,
  submitAvailability,
  terminate,
  update,
} from '../controllers/meeting-request-controller.js'
import { handleValidationErrors } from '../middleware/validation-middleware.js'

const meetingRequestRouter = Router()

meetingRequestRouter.post(
  '/',
  [
    body('title')
      .trim()
      .notEmpty()
      .withMessage('Title is required')
      .bail()
      .isLength({ max: 255 })
      .withMessage('Title must be at most 255 characters'),
    body('description')
      .optional({ nullable: true })
      .isString()
      .withMessage('Description must be a string'),
    body('durationMinutes')
      .optional()
      .isInt({ min: 1, max: 1440 })
      .withMessage('durationMinutes must be between 1 and 1440')
      .toInt(),
    body('timezoneName').optional().trim().notEmpty().withMessage('timezoneName must not be empty'),
    body('responseDeadline')
      .exists({ checkFalsy: true })
      .withMessage('responseDeadline is required')
      .bail()
      .isISO8601({ strict: true })
      .withMessage('responseDeadline must be a valid ISO 8601 datetime')
      .toDate(),
  ],
  handleValidationErrors,
  create
)

meetingRequestRouter.get(
  '/:requestId',
  [param('requestId').isUUID().withMessage('requestId must be a UUID')],
  handleValidationErrors,
  getOne
)

meetingRequestRouter.put(
  '/:requestId',
  [
    param('requestId').isUUID().withMessage('requestId must be a UUID'),
    body('title')
      .trim()
      .notEmpty()
      .withMessage('Title is required')
      .bail()
      .isLength({ max: 255 })
      .withMessage('Title must be at most 255 characters'),
    body('description')
      .optional({ nullable: true })
      .isString()
      .withMessage('Description must be a string'),
    body('durationMinutes')
      .optional()
      .isInt({ min: 1, max: 1440 })
      .withMessage('durationMinutes must be between 1 and 1440')
      .toInt(),
    body('timezoneName').optional().trim().notEmpty().withMessage('timezoneName must not be empty'),
    body('responseDeadline')
      .exists({ checkFalsy: true })
      .withMessage('responseDeadline is required')
      .bail()
      .isISO8601({ strict: true })
      .withMessage('responseDeadline must be a valid ISO 8601 datetime')
      .toDate(),
  ],
  handleValidationErrors,
  update
)

meetingRequestRouter.get(
  '/:requestId/invitees/:inviteeId',
  [
    param('requestId').isUUID().withMessage('requestId must be a UUID'),
    param('inviteeId').isUUID().withMessage('inviteeId must be a UUID'),
  ],
  handleValidationErrors,
  getInviteeDetail
)

meetingRequestRouter.put(
  '/:requestId/time-options',
  [
    param('requestId').isUUID().withMessage('requestId must be a UUID'),
    body('timeOptions').isArray({ min: 1 }).withMessage('timeOptions must be a non-empty array'),
    body('timeOptions.*.startsAt')
      .isISO8601({ strict: true })
      .withMessage('startsAt must be a valid ISO 8601 datetime')
      .toDate(),
    body('timeOptions.*.endsAt')
      .isISO8601({ strict: true })
      .withMessage('endsAt must be a valid ISO 8601 datetime')
      .toDate(),
    body('timeOptions.*.sortOrder')
      .optional()
      .isInt({ min: 0 })
      .withMessage('sortOrder must be a non-negative integer')
      .toInt(),
  ],
  handleValidationErrors,
  replaceTimeOptions
)

meetingRequestRouter.put(
  '/:requestId/invitees',
  [
    param('requestId').isUUID().withMessage('requestId must be a UUID'),
    body('invitees').isArray({ min: 1 }).withMessage('invitees must be a non-empty array'),
    body('invitees.*.email')
      .isEmail()
      .withMessage('invitee email must be valid')
      .bail()
      .normalizeEmail(),
    body('invitees.*.name')
      .optional({ nullable: true })
      .isString()
      .withMessage('invitee name must be a string'),
  ],
  handleValidationErrors,
  replaceInvitees
)

meetingRequestRouter.put(
  '/:requestId/invitees/:inviteeId/availability',
  [
    param('requestId').isUUID().withMessage('requestId must be a UUID'),
    param('inviteeId').isUUID().withMessage('inviteeId must be a UUID'),
    body('responses').isArray({ min: 1 }).withMessage('responses must be a non-empty array'),
    body('responses.*.timeOptionId').isUUID().withMessage('timeOptionId must be a UUID'),
    body('responses.*.isAvailable').isBoolean().withMessage('isAvailable must be boolean'),
  ],
  handleValidationErrors,
  submitAvailability
)

meetingRequestRouter.post(
  '/:requestId/confirm',
  [
    param('requestId').isUUID().withMessage('requestId must be a UUID'),
    body('timeOptionId').isUUID().withMessage('timeOptionId must be a UUID'),
    body('location')
      .optional({ nullable: true })
      .isString()
      .withMessage('Location must be a string'),
    body('tag')
      .optional({ nullable: true })
      .isString()
      .withMessage('tag must be a string')
      .bail()
      .trim()
      .isLength({ max: 100 })
      .withMessage('tag must be at most 100 characters'),
  ],
  handleValidationErrors,
  confirm
)

meetingRequestRouter.delete(
  '/:requestId',
  [param('requestId').isUUID().withMessage('requestId must be a UUID')],
  handleValidationErrors,
  terminate
)

export default meetingRequestRouter
