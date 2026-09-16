import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { Readable } from 'node:stream'

const DEFAULT_TIMEOUT_MS = 1800000

export class TranscriptionProviderError extends Error {
  constructor(message, { retryable, cause } = {}) {
    super(message, { cause })
    this.name = 'TranscriptionProviderError'
    this.retryable = retryable
  }
}

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const safeFileName = (value) => path.basename(value || 'recording.audio').replace(/["\r\n]/g, '_')

const createMultipartBody = ({ audioStream, fileName, mimeType, boundary }) =>
  Readable.from(
    (async function* () {
      yield Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
          `Content-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`
      )

      for await (const chunk of audioStream) {
        yield chunk
      }

      yield Buffer.from(`\r\n--${boundary}--\r\n`)
    })()
  )

const isValidSegment = (segment) =>
  segment !== null &&
  typeof segment === 'object' &&
  Number.isFinite(segment.start) &&
  segment.start >= 0 &&
  Number.isFinite(segment.end) &&
  segment.end >= segment.start &&
  typeof segment.text === 'string'

const isValidResponse = (result) =>
  result !== null &&
  typeof result === 'object' &&
  typeof result.text === 'string' &&
  (result.duration_seconds === null ||
    result.duration_seconds === undefined ||
    (Number.isFinite(result.duration_seconds) && result.duration_seconds >= 0)) &&
  Array.isArray(result.segments) &&
  result.segments.every(isValidSegment) &&
  typeof result.model === 'string'

const normalizeDurationSeconds = (value) =>
  Number.isFinite(value) && value > 0 ? Math.ceil(value) : null

const discardResponseBody = async (response) => {
  try {
    await response.body?.cancel()
  } catch {
    // Preserve the provider classification if the failed response also disconnects.
  }
}

export const createWhisperTranscriptionAdapter = ({
  environment = process.env,
  request = fetch,
} = {}) => {
  const configuredUrl = environment.AI_SERVICE_URL

  if (!configuredUrl) {
    throw new Error('AI_SERVICE_URL is not configured')
  }

  let serviceUrl

  try {
    serviceUrl = new URL(configuredUrl)
  } catch {
    throw new Error('AI_SERVICE_URL must be an HTTP or HTTPS URL')
  }

  if (!['http:', 'https:'].includes(serviceUrl.protocol)) {
    throw new Error('AI_SERVICE_URL must be an HTTP or HTTPS URL')
  }

  const baseUrl = serviceUrl.toString().replace(/\/+$/, '')
  const language = environment.AI_TRANSCRIPTION_LANGUAGE || 'th'
  const timeoutMs = parsePositiveInteger(
    environment.AI_TRANSCRIPTION_REQUEST_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS
  )

  return {
    name: 'whisper',
    async transcribe({ recording, audioStream }) {
      if (!audioStream?.[Symbol.asyncIterator]) {
        throw new Error('Transcription requires an audio stream')
      }

      const boundary = `meeting-mgnt-${randomUUID()}`
      const query = new URLSearchParams({ language })
      let response

      try {
        response = await request(`${baseUrl}/v1/transcribe?${query}`, {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
          body: createMultipartBody({
            audioStream,
            fileName: safeFileName(recording?.fileName),
            mimeType: recording?.mimeType,
            boundary,
          }),
          duplex: 'half',
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch (error) {
        throw new TranscriptionProviderError('Whisper service request failed', {
          retryable: true,
          cause: error,
        })
      }

      if (!response.ok) {
        const retryable =
          response.status === 408 || response.status === 429 || response.status >= 500
        await discardResponseBody(response)
        throw new TranscriptionProviderError(
          retryable
            ? 'Whisper service is temporarily unavailable'
            : 'Whisper rejected the transcription request',
          { retryable }
        )
      }

      let result

      try {
        result = await response.json()
      } catch (error) {
        const retryable = !(error instanceof SyntaxError)
        throw new TranscriptionProviderError(
          retryable
            ? 'Whisper service response was interrupted'
            : 'Whisper returned an invalid transcription response',
          { retryable, cause: error }
        )
      }

      if (!isValidResponse(result)) {
        throw new TranscriptionProviderError('Whisper returned an invalid transcription response', {
          retryable: false,
        })
      }

      return {
        text: result.text,
        durationSeconds: normalizeDurationSeconds(result.duration_seconds),
        segments: result.segments.map((segment) => ({
          startSeconds: segment.start,
          endSeconds: segment.end,
          speaker: null,
          text: segment.text,
        })),
      }
    },
  }
}
