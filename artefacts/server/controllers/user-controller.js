import { listUsersForDirectory } from '../services/user-service.js'

export const list = async (req, res, next) => {
  try {
    const { users } = await listUsersForDirectory(req.user?.id)
    res.json({ users })
  } catch (error) {
    next(error)
  }
}
