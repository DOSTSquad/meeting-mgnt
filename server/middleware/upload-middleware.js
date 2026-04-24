import multer from 'multer'

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true)
    } else {
      const err = new multer.MulterError('UNSUPPORTED_MIME')
      err.field = file.fieldname
      cb(err)
    }
  },
})

export const uploadSingle = upload.single('file')

// Express 4-arg error middleware — converts multer errors to the shape
// expected by app.js's central error handler (error.statusCode + error.message).
export const handleUploadErrors = (err, _req, _res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const httpErr = new Error('File exceeds the 50 MB limit')
      httpErr.statusCode = 413
      return next(httpErr)
    }

    if (err.code === 'UNSUPPORTED_MIME') {
      const httpErr = new Error('File type not allowed')
      httpErr.statusCode = 415
      return next(httpErr)
    }

    const httpErr = new Error(err.message || 'Upload error')
    httpErr.statusCode = 400
    return next(httpErr)
  }

  next(err)
}
