import { listUsers } from '../repositories/user-repository.js'

const createHttpError = (message, statusCode) => {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

export const listUsersForDirectory = async (callerId) => {
  if (!callerId) {
    throw createHttpError('Authentication required', 401)
  }

  const users = await listUsers()
  return { users }
}
