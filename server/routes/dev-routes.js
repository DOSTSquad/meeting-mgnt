import { Router } from 'express'

import { resetMeetingItems } from '../controllers/dev-controller.js'

const devRouter = Router()

devRouter.post('/reset-meeting-items', resetMeetingItems)

export default devRouter
