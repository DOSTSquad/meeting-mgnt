import { describe, expect, it } from '@jest/globals'
import express from 'express'
import multer from 'multer'

import { handleUploadErrors, uploadSingle } from '../middleware/upload-middleware.js'

const MAX_FILE_SIZE = 50 * 1024 * 1024

// Mirrors the upload routes: multer, then the error mapper, then the app's central handler.
const createUploadApp = () => {
  const app = express()
  app.post('/upload', uploadSingle, handleUploadErrors, (req, res) => {
    res.status(201).json({ size: req.file.size })
  })
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode ?? 500).json({ error: error.message })
  })
  return app
}

const postFile = async (sizeBytes) => {
  const server = createUploadApp().listen(0)

  try {
    const { port } = server.address()
    const form = new FormData()
    form.append('file', new Blob([Buffer.alloc(sizeBytes)]), 'recording.mp3')
    const response = await fetch(`http://127.0.0.1:${port}/upload`, {
      method: 'POST',
      body: form,
    })
    return { status: response.status, body: await response.json() }
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

describe('upload size limit', () => {
  it('accepts a file one byte under 50 MB', async () => {
    const { status, body } = await postFile(MAX_FILE_SIZE - 1)

    expect(status).toBe(201)
    expect(body.size).toBe(MAX_FILE_SIZE - 1)
  })

  // busboy stops a file once it reaches the limit, so exactly 50 MB is already rejected.
  it('returns 413 for a file of exactly 50 MB', async () => {
    const { status, body } = await postFile(MAX_FILE_SIZE)

    expect(status).toBe(413)
    expect(body.error).toBe('File exceeds the 50 MB limit')
  })

  it('returns 413 for a file one byte over 50 MB', async () => {
    const { status, body } = await postFile(MAX_FILE_SIZE + 1)

    expect(status).toBe(413)
    expect(body.error).toBe('File exceeds the 50 MB limit')
  })
})

describe('handleUploadErrors', () => {
  it('returns 400 for other multer errors', () => {
    let forwarded
    handleUploadErrors(
      new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'attachment'),
      {},
      {},
      (e) => {
        forwarded = e
      }
    )

    expect(forwarded.statusCode).toBe(400)
  })

  it('passes errors that are not from multer through unchanged', () => {
    const original = new Error('database unavailable')
    let forwarded
    handleUploadErrors(original, {}, {}, (e) => {
      forwarded = e
    })

    expect(forwarded).toBe(original)
  })
})
