import { Router } from 'express'
import { body, param, query } from 'express-validator'

import {
  create,
  getOne,
  list,
  remove,
  update,
} from '../controllers/meeting-controller.js'
import { updateOwnRsvp } from '../controllers/participant-controller.js'
import { handleValidationErrors } from '../middleware/validation-middleware.js'
import { ALLOWED_STATUSES } from '../services/meeting-service.js'

const meetingRouter = Router()

meetingRouter.post(
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
    body('startsAt')
      .notEmpty()
      .withMessage('startsAt is required')
      .bail()
      .isISO8601({ strict: true })
      .withMessage('startsAt must be a valid ISO 8601 datetime')
      .toDate(),
    body('endsAt')
      .notEmpty()
      .withMessage('endsAt is required')
      .bail()
      .isISO8601({ strict: true })
      .withMessage('endsAt must be a valid ISO 8601 datetime')
      .toDate(),
    body('timezoneName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('timezoneName must not be empty'),
    body('location')
      .optional({ nullable: true })
      .isString()
      .withMessage('Location must be a string'),
    body('status').optional().isIn(ALLOWED_STATUSES).withMessage('Invalid status'),
    body('department')
      .optional({ nullable: true })
      .trim()
      .isLength({ max: 100 })
      .withMessage('Department must be at most 100 characters'),
    body('facilitator')
      .optional({ nullable: true })
      .isString()
      .withMessage('Facilitator must be a string')
      .bail()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Facilitator must be at most 100 characters'),
    body('recorder')
      .optional({ nullable: true })
      .isString()
      .withMessage('Recorder must be a string')
      .bail()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Recorder must be at most 100 characters'),
    body('keyDiscussions')
      .optional({ nullable: true })
      .isString()
      .withMessage('keyDiscussions must be a string'),
    body('meetingMinutes')
      .optional({ nullable: true })
      .isString()
      .withMessage('meetingMinutes must be a string'),
    body('decisions').optional({ nullable: true }).isString().withMessage('decisions must be a string'),
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
  create
)

meetingRouter.get(
  '/',
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('page must be a positive integer')
      .toInt(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('limit must be between 1 and 100')
      .toInt(),
    query('from')
      .optional()
      .isISO8601({ strict: true })
      .withMessage('from must be a valid ISO 8601 datetime')
      .toDate(),
    query('to')
      .optional()
      .isISO8601({ strict: true })
      .withMessage('to must be a valid ISO 8601 datetime')
      .toDate(),
    query('status').optional().isIn(ALLOWED_STATUSES).withMessage('Invalid status'),
    query('department')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Department must be at most 100 characters'),
    query('q')
      .optional()
      .isString()
      .withMessage('q must be a string')
      .bail()
      .trim()
      .isLength({ max: 200 })
      .withMessage('q must be at most 200 characters'),
  ],
  handleValidationErrors,
  list
)

meetingRouter.get(
  '/:id',
  [param('id').isUUID().withMessage('id must be a UUID')],
  handleValidationErrors,
  getOne
)

meetingRouter.put(
  '/:id',
  [
    param('id').isUUID().withMessage('id must be a UUID'),
    body('title')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Title cannot be empty')
      .bail()
      .isLength({ max: 255 })
      .withMessage('Title must be at most 255 characters'),
    body('description')
      .optional({ nullable: true })
      .isString()
      .withMessage('Description must be a string'),
    body('startsAt')
      .optional()
      .isISO8601({ strict: true })
      .withMessage('startsAt must be a valid ISO 8601 datetime')
      .toDate(),
    body('endsAt')
      .optional()
      .isISO8601({ strict: true })
      .withMessage('endsAt must be a valid ISO 8601 datetime')
      .toDate(),
    body('timezoneName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('timezoneName must not be empty'),
    body('location')
      .optional({ nullable: true })
      .isString()
      .withMessage('Location must be a string'),
    body('status').optional().isIn(ALLOWED_STATUSES).withMessage('Invalid status'),
    body('department')
      .optional({ nullable: true })
      .trim()
      .isLength({ max: 100 })
      .withMessage('Department must be at most 100 characters'),
    body('facilitator')
      .optional({ nullable: true })
      .isString()
      .withMessage('Facilitator must be a string')
      .bail()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Facilitator must be at most 100 characters'),
    body('recorder')
      .optional({ nullable: true })
      .isString()
      .withMessage('Recorder must be a string')
      .bail()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Recorder must be at most 100 characters'),
    body('keyDiscussions')
      .optional({ nullable: true })
      .isString()
      .withMessage('keyDiscussions must be a string'),
    body('meetingMinutes')
      .optional({ nullable: true })
      .isString()
      .withMessage('meetingMinutes must be a string'),
    body('decisions').optional({ nullable: true }).isString().withMessage('decisions must be a string'),
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
  update
)

meetingRouter.delete(
  '/:id',
  [param('id').isUUID().withMessage('id must be a UUID')],
  handleValidationErrors,
  remove
)

meetingRouter.put(
  '/:id/rsvp',
  [
    param('id').isUUID().withMessage('id must be a UUID'),
    body('rsvpStatus')
      .notEmpty().withMessage('rsvpStatus is required').bail()
      .isIn(['accepted', 'declined']).withMessage('rsvpStatus must be accepted or declined'),
  ],
  handleValidationErrors,
  updateOwnRsvp
)

export default meetingRouter
