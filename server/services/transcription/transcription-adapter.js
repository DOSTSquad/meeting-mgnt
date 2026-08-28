import { createFixtureTranscriptionAdapter } from './fixture-transcription-adapter.js'
import { createWhisperTranscriptionAdapter } from './whisper-transcription-adapter.js'

const adapterFactories = {
  fixture: createFixtureTranscriptionAdapter,
  whisper: createWhisperTranscriptionAdapter,
}

/**
 * A transcription adapter turns recording metadata plus an audio stream into
 * transcript text, timestamped segments, and a duration.
 *
 * @typedef {object} TranscriptionRequest
 * @property {{ id: string, meetingId: string, fileName: string, mimeType: string }} recording
 * @property {AsyncIterable<Buffer>} audioStream
 *
 * @typedef {object} TranscriptionSegment
 * @property {number} startSeconds
 * @property {number} endSeconds
 * @property {string | null} speaker
 * @property {string} text
 *
 * @typedef {object} TranscriptionResult
 * @property {string} text
 * @property {TranscriptionSegment[]} segments
 * @property {number | null} durationSeconds
 *
 * @typedef {object} TranscriptionAdapter
 * @property {string} name
 * @property {(request: TranscriptionRequest) => Promise<TranscriptionResult>} transcribe
 */

export const getTranscriptionAdapter = (environment = process.env) => {
  const name = environment.AI_TRANSCRIPTION_PROVIDER

  // Deliberately no default. Falling back to the fixture would let a production
  // worker emit placeholder transcripts while the ALLOW_UNSAFE_FIXTURE_PROVIDERS
  // guard in worker-runtime.js sees an unset value and stays quiet.
  if (!name) {
    throw new Error('AI_TRANSCRIPTION_PROVIDER is not configured')
  }

  const factory = adapterFactories[name]

  if (!factory) {
    throw new Error(`Unknown transcription provider: ${name}`)
  }

  return factory({ environment })
}
