import { loginUser, registerUser } from '../services/auth-service.js'

export const register = async (req, res, next) => {
  try {
    const authResult = await registerUser(req.body ?? {})

    res.status(201).json(authResult)
  } catch (error) {
    next(error)
  }
}

export const login = async (req, res, next) => {
  try {
    const result = await loginUser(req.body ?? {})

    res.json(result)
  } catch (error) {
    next(error)
  }
}

export const getCurrentUser = (req, res) => {
  res.json({ user: req.user })
}
