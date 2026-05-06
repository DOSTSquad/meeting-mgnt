import {
  getDashboardData,
  getNotificationsData,
  getNotificationSummaryData,
} from '../services/dashboard-service.js'
import {
  archiveOneNotification,
  archiveReadNotificationsForUser,
  readAllNotifications,
  readNotification,
  readNotifications,
} from '../services/notification-service.js'

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

export const markNotificationRead = async (req, res, next) => {
  try {
    const data = await readNotification(req.user?.id, req.params.id)

    res.json(data)
  } catch (error) {
    next(error)
  }
}

export const markNotificationsRead = async (req, res, next) => {
  try {
    const data = await readNotifications(req.user?.id, req.body?.ids ?? [])

    res.json(data)
  } catch (error) {
    next(error)
  }
}

export const markAllNotificationsRead = async (req, res, next) => {
  try {
    const data = await readAllNotifications(req.user?.id)

    res.json(data)
  } catch (error) {
    next(error)
  }
}

export const archiveNotification = async (req, res, next) => {
  try {
    const data = await archiveOneNotification(req.user?.id, req.params.id)

    res.json(data)
  } catch (error) {
    next(error)
  }
}

export const archiveReadNotifications = async (req, res, next) => {
  try {
    const data = await archiveReadNotificationsForUser(req.user?.id)

    res.json(data)
  } catch (error) {
    next(error)
  }
}
