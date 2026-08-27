import { Router } from 'express'
import { body, param } from 'express-validator'

import { add, list, remove, update } from '../controllers/participant-controller.js'
import { handleValidationErrors } from '../middleware/validation-middleware.js'
import { ALLOWED_ROLES } from '../services/participant-service.js'

const participantRouter = Router({ mergeParams: true })

participantRouter.get(
  '/',
  [param('meetingId').isUUID().withMessage('meetingId must be a UUID')],
  handleValidationErrors,
  list
)

participantRouter.post(
  '/',
  [
    param('meetingId').isUUID().withMessage('meetingId must be a UUID'),
    body('userIds')
      .isArray({ min: 1, max: 50 })
      .withMessage('userIds must be an array of 1–50 UUIDs'),
    body('userIds.*').isUUID().withMessage('Each userId must be a UUID'),
    body('role').optional().isIn(ALLOWED_ROLES).withMessage('Invalid role'),
  ],
  handleValidationErrors,
  add
)

participantRouter.patch(
  '/:userId',
  [
    param('meetingId').isUUID().withMessage('meetingId must be a UUID'),
    param('userId').isUUID().withMessage('userId must be a UUID'),
    body('role').optional().isIn(ALLOWED_ROLES).withMessage('Invalid role'),
  ],
  handleValidationErrors,
  update
)

participantRouter.delete(
  '/:userId',
  [
    param('meetingId').isUUID().withMessage('meetingId must be a UUID'),
    param('userId').isUUID().withMessage('userId must be a UUID'),
  ],
  handleValidationErrors,
  remove
)

export default participantRouter
