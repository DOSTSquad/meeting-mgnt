import bcrypt from 'bcryptjs'
import { deleteUser, updateUser } from '../repositories/user-repository.js'
import { createAccount } from '../services/auth-service.js'
import { listUsersForDirectory } from '../services/user-service.js'

export const list = async (req, res, next) => {
  try {
    const { users } = await listUsersForDirectory(req.user?.id)
    res.json({ users })
  } catch (error) {
    next(error)
  }
}

export const create = async (req, res, next) => {
  try {
    const user = await createAccount(req.body ?? {})

    res.status(201).json({ user })
  } catch (error) {
    next(error)
  }
}

export const update = async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot edit your own admin account' })
    }
    const passwordHash = req.body?.password ? await bcrypt.hash(req.body.password, 10) : undefined
    const user = await updateUser(req.params.id, { ...req.body, passwordHash })
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ user })
  } catch (error) {
    next(error)
  }
}

export const remove = async (req, res, next) => {
  try {
    if (req.params.id === req.user.id)
      return res.status(400).json({ error: 'You cannot delete yourself' })
    await deleteUser(req.params.id)
    res.status(204).end()
  } catch (error) {
    next(error)
  }
}
