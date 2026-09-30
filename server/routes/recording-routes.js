import { Router } from 'express'
import { body, param } from 'express-validator'

import {
  getAnalysisForMeeting,
  generateForMeeting,
  getForMeeting,
  removeForMeeting,
  uploadForMeeting,
} from '../controllers/recording-controller.js'
import { handleUploadErrors, uploadSingle } from '../middleware/upload-middleware.js'
import { handleValidationErrors } from '../middleware/validation-middleware.js'

const recordingRouter = Router({ mergeParams: true })

const meetingIdValidator = [param('meetingId').isUUID().withMessage('meetingId must be a UUID')]

// A multipart body only exists after multer has run, so this validates after uploadSingle.
export const recordingConsentValidator = [
  body('consentConfirmed')
    .custom((value) => value === 'true' || value === true)
    .withMessage(
      'consentConfirmed must be true: confirm every participant agreed to the recording'
    ),
]

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
  recordingConsentValidator,
  handleValidationErrors,
  uploadForMeeting
)

recordingRouter.get('/analysis', meetingIdValidator, handleValidationErrors, getAnalysisForMeeting)

recordingRouter.post('/generate', meetingIdValidator, handleValidationErrors, generateForMeeting)

recordingRouter.delete('/', meetingIdValidator, handleValidationErrors, removeForMeeting)

export default recordingRouter
