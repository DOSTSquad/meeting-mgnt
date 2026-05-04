import { Router } from 'express'
import { body } from 'express-validator'

import { getCurrentUser, login, register } from '../controllers/auth-controller.js'
import { requireAuth } from '../middleware/auth-middleware.js'
import { handleValidationErrors } from '../middleware/validation-middleware.js'

const authRouter = Router()

authRouter.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .bail()
      .isEmail()
      .withMessage('Email must be a valid email address')
      .normalizeEmail(),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
      .bail()
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long'),
  ],
  handleValidationErrors,
  register
)

authRouter.post(
  '/login',
  [
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Username or email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  handleValidationErrors,
  login
)

authRouter.get('/me', requireAuth, getCurrentUser)

export default authRouter
