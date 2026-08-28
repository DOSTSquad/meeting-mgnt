import { Router } from 'express'
import { body, param } from 'express-validator'

import {
  archiveNotification,
  archiveReadNotifications,
  getDashboard,
  getNotifications,
  getNotificationSummary,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationsRead,
} from '../controllers/dashboard-controller.js'
import { handleValidationErrors } from '../middleware/validation-middleware.js'

const dashboardRouter = Router()

dashboardRouter.get('/dashboard', getDashboard)
dashboardRouter.get('/notifications/summary', getNotificationSummary)
dashboardRouter.get('/notifications', getNotifications)
dashboardRouter.post(
  '/notifications/read',
  [
    body('ids').isArray({ min: 1 }).withMessage('ids must be a non-empty array'),
    body('ids.*').isUUID().withMessage('ids must contain UUID values'),
  ],
  handleValidationErrors,
  markNotificationsRead
)
dashboardRouter.post('/notifications/read-all', markAllNotificationsRead)
dashboardRouter.post('/notifications/archive-read', archiveReadNotifications)
dashboardRouter.post(
  '/notifications/:id/read',
  [param('id').isUUID().withMessage('id must be a UUID')],
  handleValidationErrors,
  markNotificationRead
)
dashboardRouter.post(
  '/notifications/:id/archive',
  [param('id').isUUID().withMessage('id must be a UUID')],
  handleValidationErrors,
  archiveNotification
)

export default dashboardRouter
