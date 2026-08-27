import { Router } from 'express'
import { param } from 'express-validator'

import { streamWorkflowEvents } from '../controllers/workflow-events-controller.js'
import { handleValidationErrors } from '../middleware/validation-middleware.js'

const workflowEventsRouter = Router({ mergeParams: true })

workflowEventsRouter.get(
  '/events',
  [param('meetingId').isUUID().withMessage('meetingId must be a UUID')],
  handleValidationErrors,
  streamWorkflowEvents
)

export default workflowEventsRouter
