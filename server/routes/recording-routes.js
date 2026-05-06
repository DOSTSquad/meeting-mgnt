import { Router } from 'express'
import { body, param } from 'express-validator'

import {
  generateForMeeting,
  getForMeeting,
  removeForMeeting,
  uploadForMeeting,
} from '../controllers/recording-controller.js'
import { handleUploadErrors, uploadSingle } from '../middleware/upload-middleware.js'
import { handleValidationErrors } from '../middleware/validation-middleware.js'

const recordingRouter = Router({ mergeParams: true })

const meetingIdValidator = [param('meetingId').isUUID().withMessage('meetingId must be a UUID')]

recordingRouter.get('/', meetingIdValidator, handleValidationErrors, getForMeeting)

recordingRouter.put(
  '/',
  [
    ...meetingIdValidator,
    body('replace').optional().isBoolean().withMessage('replace must be a boolean'),
  ],
  handleValidationErrors,
  uploadSingle,
  handleUploadErrors,
  uploadForMeeting
)

recordingRouter.delete('/', meetingIdValidator, handleValidationErrors, removeForMeeting)

recordingRouter.post(
  '/generate-minutes',
  meetingIdValidator,
  handleValidationErrors,
  generateForMeeting
)

export default recordingRouter
