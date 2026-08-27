import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

import { createUser, findUserByEmail, findUserById } from '../repositories/user-repository.js'

const SALT_ROUNDS = 10

const getJwtSecret = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured')
  }

  return process.env.JWT_SECRET
}

const createHttpError = (message, statusCode) => {
  const error = new Error(message)
  error.statusCode = statusCode

  return error
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const isEmailAddress = (value) => EMAIL_PATTERN.test(value.trim())

const sanitizeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  department: user.department,
  createdAt: user.createdAt,
})

const signToken = (user) =>
  jwt.sign({ sub: user.id, email: user.email }, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  })

export const registerUser = async ({ name, email, password }) => {
  if (!name || !name.trim()) {
    throw createHttpError('Name is required', 400)
  }

  if (!email || !email.trim()) {
    throw createHttpError('Email is required', 400)
  }

  if (!password || password.length < 8) {
    throw createHttpError('Password must be at least 8 characters long', 400)
  }

  const existingUser = await findUserByEmail(email)

  if (existingUser) {
    throw createHttpError('A user with this email already exists', 409)
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
  let user

  try {
    user = await createUser({ name, email, passwordHash })
  } catch (error) {
    if (error.code === '23505') {
      throw createHttpError('A user with this email already exists', 409)
    }

    throw error
  }

  return {
    token: signToken(user),
    user: sanitizeUser(user),
  }
}

export const loginUser = async ({ email, password }) => {
  if (!email || !email.trim()) {
    throw createHttpError('Email is required', 400)
  }

  if (!isEmailAddress(email)) {
    throw createHttpError('Email must be a valid email address', 400)
  }

  if (!password) {
    throw createHttpError('Password is required', 400)
  }

  const user = await findUserByEmail(email)

  if (!user) {
    throw createHttpError('Invalid email or password', 401)
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash)

  if (!passwordMatches) {
    throw createHttpError('Invalid email or password', 401)
  }

  return {
    token: signToken(user),
    user: sanitizeUser(user),
  }
}

export const verifyToken = (token) => jwt.verify(token, getJwtSecret())

export const getUserForToken = async (token) => {
  let payload

  try {
    payload = verifyToken(token)
  } catch {
    throw createHttpError('Invalid or expired token', 401)
  }

  const user = await findUserById(payload.sub)

  if (!user) {
    throw createHttpError('Authentication required', 401)
  }

  return sanitizeUser(user)
}
