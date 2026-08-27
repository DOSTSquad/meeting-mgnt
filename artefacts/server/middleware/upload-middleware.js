import multer from 'multer'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
})

const rawUploadSingle = upload.single('file')

// multer/busboy decodes the form-data filename as latin1; when the client sends
// a UTF-8 name (e.g. Chinese characters) the string we get is the latin1 view
// of UTF-8 bytes. Re-decode to recover the original name. No-op for ASCII.
const normalizeFilename = (req, _res, next) => {
  if (req.file?.originalname) {
    req.file.originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8')
  }
  next()
}

export const uploadSingle = [rawUploadSingle, normalizeFilename]

// Express 4-arg error middleware — converts multer errors to the shape
// expected by app.js's central error handler (error.statusCode + error.message).
export const handleUploadErrors = (err, _req, _res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const httpErr = new Error('File exceeds the 50 MB limit')
      httpErr.statusCode = 413
      return next(httpErr)
    }

    const httpErr = new Error(err.message || 'Upload error')
    httpErr.statusCode = 400
    return next(httpErr)
  }

  next(err)
}
