import {
  deleteFileById,
  getDownloadStream,
  getDownloadUrl,
  listFiles,
  uploadFile,
} from '../services/file-service.js'

export const upload = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' })
    }

    const { file } = await uploadFile(
      req.params.meetingId,
      req.user?.id,
      req.file,
      req.body?.description
    )

    res.status(201).json({ file })
  } catch (error) {
    next(error)
  }
}

export const list = async (req, res, next) => {
  try {
    const { files } = await listFiles(req.params.meetingId, req.user?.id)

    res.json({ files })
  } catch (error) {
    next(error)
  }
}

export const download = async (req, res, next) => {
  try {
    const { url, expiresAt } = await getDownloadUrl(req.params.id, req.user?.id)

    res.json({ url, expiresAt })
  } catch (error) {
    next(error)
  }
}

export const remove = async (req, res, next) => {
  try {
    await deleteFileById(req.params.id, req.user?.id)

    res.status(204).end()
  } catch (error) {
    next(error)
  }
}

export const downloadContent = async (req, res, next) => {
  try {
    const { stream, file } = await getDownloadStream(req.params.id, req.user?.id)
    const safeFileName = encodeURIComponent(file.fileName)

    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFileName}"; filename*=UTF-8''${safeFileName}`
    )
    stream.on('error', next)
    stream.pipe(res)
  } catch (error) {
    next(error)
  }
}
