import { AudioExtractionError, extractAudio } from './extractAudio.js'

self.onmessage = async ({ data }) => {
  try {
    const file = await extractAudio(data.file, {
      maxBytes: data.maxBytes,
      onProgress: (value) => self.postMessage({ type: 'progress', value }),
    })
    self.postMessage({ type: 'done', file })
  } catch (error) {
    self.postMessage({
      type: 'error',
      code: error instanceof AudioExtractionError ? error.code : 'failed',
      message: error.message,
    })
  }
}
