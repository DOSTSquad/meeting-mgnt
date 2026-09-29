// Same limit as server/middleware/upload-middleware.js.
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

const VIDEO_EXTENSIONS = ['.mp4', '.m4v', '.mov', '.webm', '.mkv']

const hasVideoExtension = (name) => VIDEO_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext))

export const needsExtraction = (file) =>
  file.type.startsWith('video/') ||
  (!file.type.startsWith('audio/') && hasVideoExtension(file.name))

export const extractedAudioName = (fileName) => {
  const baseName = fileName.replace(/\.[^./\\]+$/, '')

  return `${baseName || 'recording'}.m4a`
}
