import { Router } from 'express'
import { body } from 'express-validator'

import {
  changeOwnPassword,
  getCurrentUser,
  login,
  register,
} from '../controllers/auth-controller.js'
import { requireAuth } from '../middleware/auth-middleware.js'
import { requireSelfRegistrationEnabled } from '../middleware/registration-middleware.js'
import { handleValidationErrors } from '../middleware/validation-middleware.js'

const authRouter = Router()

authRouter.post(
  '/register',
  requireSelfRegistrationEnabled,
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
      .withMessage('Email is required')
      .bail()
      .isEmail()
      .withMessage('Email must be a valid email address')
      .normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  handleValidationErrors,
  login
)

authRouter.get('/me', requireAuth, getCurrentUser)

authRouter.put(
  '/me/password',
  requireAuth,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .notEmpty()
      .withMessage('New password is required')
      .bail()
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
      .bail()
      .custom((value, { req }) => value !== req.body.currentPassword)
      .withMessage('New password must be different from the current password'),
  ],
  handleValidationErrors,
  changeOwnPassword
)

export default authRouter
