import { Router } from 'express'

import {
  getDashboard,
  getNotifications,
  getNotificationSummary,
} from '../controllers/dashboard-controller.js'

const dashboardRouter = Router()

dashboardRouter.get('/dashboard', getDashboard)
dashboardRouter.get('/notifications/summary', getNotificationSummary)
dashboardRouter.get('/notifications', getNotifications)

export default dashboardRouter
