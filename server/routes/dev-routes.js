import { Router } from 'express'

import { resetMeetingItems } from '../controllers/dev-controller.js'
import { requireRole } from '../middleware/rbac-middleware.js'

const devRouter = Router()

devRouter.post('/reset-meeting-items', requireRole('admin'), resetMeetingItems)

export default devRouter
