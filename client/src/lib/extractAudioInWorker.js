import { AudioExtractionError } from './audioExtractionError.js'

// Extraction is one long microtask chain; on the main thread it freezes the page until it ends.
export const extractAudioInWorker = (file, { onProgress, maxBytes } = {}) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./extractAudio.worker.js', import.meta.url), {
      type: 'module',
    })
    const settle = (callback, value) => {
      worker.terminate()
      callback(value)
    }

    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        onProgress?.(data.value)
      } else if (data.type === 'done') {
        settle(resolve, data.file)
      } else {
        settle(reject, new AudioExtractionError(data.code, data.message))
      }
    }
    worker.onerror = (event) =>
      settle(
        reject,
        new AudioExtractionError('failed', event.message || 'Audio extraction failed.')
      )

    worker.postMessage({ file, maxBytes })
  })
