import {
  getDashboardData,
  getNotificationsData,
  getNotificationSummaryData,
} from '../services/dashboard-service.js'

export const getDashboard = async (req, res, next) => {
  try {
    const data = await getDashboardData(req.user?.id)

    res.json(data)
  } catch (error) {
    next(error)
  }
}

export const getNotifications = async (req, res, next) => {
  try {
    const data = await getNotificationsData(req.user?.id, {
      limit: req.query.limit,
      cursor: req.query.cursor,
    })

    res.json(data)
  } catch (error) {
    next(error)
  }
}

export const getNotificationSummary = async (req, res, next) => {
  try {
    const data = await getNotificationSummaryData(req.user?.id)

    res.json(data)
  } catch (error) {
    next(error)
  }
}
