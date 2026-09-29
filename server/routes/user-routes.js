import { Router } from 'express'
import { body, param } from 'express-validator'

import { list, remove, update } from '../controllers/user-controller.js'
import { requireRole } from '../middleware/rbac-middleware.js'
import { handleValidationErrors } from '../middleware/validation-middleware.js'
import { ACCOUNT_ROLES } from '../services/permissions.js'

const userRouter = Router()

userRouter.get('/', list)

userRouter.put(
  '/:id',
  requireRole('admin'),
  [
    param('id').isUUID().withMessage('id must be a UUID'),
    body('role')
      .optional()
      .isIn(ACCOUNT_ROLES)
      .withMessage(`role must be one of: ${ACCOUNT_ROLES.join(', ')}`),
    body('email').optional().isEmail().withMessage('Email must be a valid email address'),
    body('password')
      .optional({ values: 'falsy' })
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long'),
  ],
  handleValidationErrors,
  update
)

userRouter.delete(
  '/:id',
  requireRole('admin'),
  [param('id').isUUID().withMessage('id must be a UUID')],
  handleValidationErrors,
  remove
)

export default userRouter
