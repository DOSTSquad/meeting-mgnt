import { Router } from 'express'
import { body } from 'express-validator'

import { create, list } from '../controllers/tag-controller.js'
import { handleValidationErrors } from '../middleware/validation-middleware.js'

const tagRouter = Router()

tagRouter.get('/', list)

tagRouter.post(
  '/',
  [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Tag name is required')
      .isLength({ max: 100 })
      .withMessage('Tag name must be at most 100 characters'),
  ],
  handleValidationErrors,
  create
)

export default tagRouter
