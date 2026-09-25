import { Router } from 'express'
import { body, param } from 'express-validator'
import { create, list, inbox, markRead } from '../controllers/meeting-change-request-controller.js'
import { handleValidationErrors } from '../middleware/validation-middleware.js'

const router = Router({ mergeParams: true })

router.patch(
  '/:requestId/read',
  [param('meetingId').isUUID(), param('requestId').isUUID()],
  handleValidationErrors,
  markRead
)

router.get('/', [param('meetingId').isUUID()], handleValidationErrors, inbox)

router.post(
  '/',
  [
    param('meetingId').isUUID(),
    body('message').isString().bail().trim().isLength({ min: 1, max: 2000 }),
  ],
  handleValidationErrors,
  create
)

router.get(
  '/:userId',
  [param('meetingId').isUUID(), param('userId').isUUID()],
  handleValidationErrors,
  list
)

export default router
