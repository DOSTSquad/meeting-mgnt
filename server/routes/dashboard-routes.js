import { Router } from 'express'

import { getDashboard, getNotifications } from '../controllers/dashboard-controller.js'

const dashboardRouter = Router()

dashboardRouter.get('/dashboard', getDashboard)
dashboardRouter.get('/notifications', getNotifications)

export default dashboardRouter
