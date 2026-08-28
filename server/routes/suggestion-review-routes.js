import { Router } from 'express'
import { body, param } from 'express-validator'

import {
  acceptForMeeting,
  editForMeeting,
  rejectForMeeting,
} from '../controllers/suggestion-review-controller.js'
import { handleValidationErrors } from '../middleware/validation-middleware.js'

const suggestionRouter = Router({ mergeParams: true })

const identifiers = [
  param('meetingId').isUUID().withMessage('meetingId must be a UUID'),
  param('suggestionId').isUUID().withMessage('suggestionId must be a UUID'),
]

suggestionRouter.patch(
  '/:suggestionId',
  [
    ...identifiers,
    body('title').optional().isString().notEmpty().withMessage('title must be a non-empty string'),
    body('description').optional({ nullable: true }).isString(),
    body('assigneeId')
      .optional({ nullable: true })
      .isUUID()
      .withMessage('assigneeId must be a UUID'),
    body('dueDate').optional({ nullable: true }).isISO8601().withMessage('dueDate must be a date'),
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high'])
      .withMessage('priority must be low, medium, or high'),
    // `source` and `sourceRef` are deliberately absent. Provenance on the
    // resulting action item is set by the server, never by the caller.
  ],
  handleValidationErrors,
  editForMeeting
)

suggestionRouter.post(
  '/:suggestionId/accept',
  identifiers,
  handleValidationErrors,
  acceptForMeeting
)
suggestionRouter.post(
  '/:suggestionId/reject',
  identifiers,
  handleValidationErrors,
  rejectForMeeting
)

export default suggestionRouter
