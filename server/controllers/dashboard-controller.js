import { getDashboardData, getNotificationsData } from '../services/dashboard-service.js'

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
    const data = await getNotificationsData(req.user?.id)

    res.json(data)
  } catch (error) {
    next(error)
  }
}
