import { Router } from 'express'
import { body, param, query } from 'express-validator'

import { create, getOne, list, remove, update } from '../controllers/meeting-controller.js'
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
    body('timezoneName').optional().trim().notEmpty().withMessage('timezoneName must not be empty'),
    body('location')
      .optional({ nullable: true })
      .isString()
      .withMessage('Location must be a string'),
    body('status').optional().isIn(ALLOWED_STATUSES).withMessage('Invalid status'),
    body('tag')
      .optional({ nullable: true })
      .isString()
      .withMessage('tag must be a string')
      .bail()
      .trim()
      .isLength({ max: 100 })
      .withMessage('tag must be at most 100 characters'),
    body('ownerId').optional().isUUID().withMessage('ownerId must be a UUID'),
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
    query('scope').optional().isIn(['all', 'mine']).withMessage('scope must be all or mine'),
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
    body('timezoneName').optional().trim().notEmpty().withMessage('timezoneName must not be empty'),
    body('location')
      .optional({ nullable: true })
      .isString()
      .withMessage('Location must be a string'),
    body('status').optional().isIn(ALLOWED_STATUSES).withMessage('Invalid status'),
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

export default meetingRouter
