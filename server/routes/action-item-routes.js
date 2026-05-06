import { Router } from 'express'
import { body, param, query } from 'express-validator'

import {
  create,
  getOne,
  list,
  listMine,
  remove,
  update,
} from '../controllers/action-item-controller.js'
import { handleValidationErrors } from '../middleware/validation-middleware.js'
import {
  ALLOWED_PRIORITIES,
  ALLOWED_STATUSES,
} from '../services/action-item-service.js'

// Mounted at /api/meetings/:meetingId/action-items (mergeParams: true)
export const meetingActionItemRouter = Router({ mergeParams: true })

meetingActionItemRouter.get(
  '/',
  [
    param('meetingId').isUUID().withMessage('meetingId must be a UUID'),
    query('status').optional().isIn(ALLOWED_STATUSES).withMessage('Invalid status'),
    query('assigneeId').optional().isUUID().withMessage('assigneeId must be a UUID'),
  ],
  handleValidationErrors,
  list
)

meetingActionItemRouter.post(
  '/',
  [
    param('meetingId').isUUID().withMessage('meetingId must be a UUID'),
    body('title')
      .isString()
      .withMessage('title must be a string')
      .bail()
      .trim()
      .notEmpty()
      .withMessage('title is required')
      .isLength({ max: 255 })
      .withMessage('title must be 255 characters or fewer'),
    body('description').optional({ nullable: true }).isString().withMessage('description must be a string'),
    body('assigneeId').optional({ nullable: true }).isUUID().withMessage('assigneeId must be a UUID'),
    body('dueDate').optional({ nullable: true }).isISO8601().withMessage('dueDate must be ISO 8601').toDate(),
    body('priority').optional().isIn(ALLOWED_PRIORITIES).withMessage('Invalid priority'),
  ],
  handleValidationErrors,
  create
)

// Mounted at /api/action-items
export const actionItemRouter = Router()

actionItemRouter.get(
  '/',
  [
    query('status').optional().isIn(ALLOWED_STATUSES).withMessage('Invalid status'),
    query('priority').optional().isIn(ALLOWED_PRIORITIES).withMessage('Invalid priority'),
  ],
  handleValidationErrors,
  listMine
)

actionItemRouter.get(
  '/:id',
  [param('id').isUUID().withMessage('id must be a UUID')],
  handleValidationErrors,
  getOne
)

actionItemRouter.put(
  '/:id',
  [
    param('id').isUUID().withMessage('id must be a UUID'),
    body('title')
      .optional()
      .isString()
      .withMessage('title must be a string')
      .bail()
      .trim()
      .notEmpty()
      .withMessage('title must be non-empty')
      .isLength({ max: 255 })
      .withMessage('title must be 255 characters or fewer'),
    body('description').optional({ nullable: true }).isString().withMessage('description must be a string'),
    body('assigneeId').optional({ nullable: true }).isUUID().withMessage('assigneeId must be a UUID'),
    body('dueDate').optional({ nullable: true }).isISO8601().withMessage('dueDate must be ISO 8601').toDate(),
    body('status').optional().isIn(ALLOWED_STATUSES).withMessage('Invalid status'),
    body('priority').optional().isIn(ALLOWED_PRIORITIES).withMessage('Invalid priority'),
  ],
  handleValidationErrors,
  update
)

actionItemRouter.delete(
  '/:id',
  [param('id').isUUID().withMessage('id must be a UUID')],
  handleValidationErrors,
  remove
)
