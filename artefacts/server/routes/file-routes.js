import { Router } from 'express'
import { param } from 'express-validator'

import { download, downloadContent, list, remove, upload } from '../controllers/file-controller.js'
import { handleUploadErrors, uploadSingle } from '../middleware/upload-middleware.js'
import { handleValidationErrors } from '../middleware/validation-middleware.js'

// Mounted at /api/meetings/:meetingId/files (mergeParams: true)
export const meetingFileRouter = Router({ mergeParams: true })

meetingFileRouter.post(
  '/',
  [param('meetingId').isUUID().withMessage('meetingId must be a UUID')],
  handleValidationErrors,
  uploadSingle,
  handleUploadErrors,
  upload
)

meetingFileRouter.get(
  '/',
  [param('meetingId').isUUID().withMessage('meetingId must be a UUID')],
  handleValidationErrors,
  list
)

// Mounted at /api/files
export const fileRouter = Router()

fileRouter.get(
  '/:id/download',
  [param('id').isUUID().withMessage('id must be a UUID')],
  handleValidationErrors,
  download
)

fileRouter.get(
  '/:id/content',
  [param('id').isUUID().withMessage('id must be a UUID')],
  handleValidationErrors,
  downloadContent
)

fileRouter.delete(
  '/:id',
  [param('id').isUUID().withMessage('id must be a UUID')],
  handleValidationErrors,
  remove
)
