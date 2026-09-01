import { createFixtureAnalysisAdapter } from './fixture-analysis-adapter.js'
import { createLlmAnalysisAdapter } from './llm-analysis-adapter.js'

const adapterFactories = {
  fixture: createFixtureAnalysisAdapter,
  llm: createLlmAnalysisAdapter,
}

/**
 * @typedef {object} AnalysisRequest
 * @property {{ id: string, transcriptText: string, segments: object[] }} transcript
 * @property {{ id: string, meetingId: string }} recording
 * @property {{ id: string, name: string }[]} participants Candidates an owner named
 *   by the provider may resolve to. Never anyone outside the meeting.
 */

export const getAnalysisAdapter = (environment = process.env) => {
  const name = environment.AI_ANALYSIS_PROVIDER

  // No default, for the same reason as the transcription adapter: an implicit
  // fixture would let a production worker publish invented decisions and action
  // items while the ALLOW_UNSAFE_FIXTURE_PROVIDERS guard sees an unset value.
  if (!name) {
    throw new Error('AI_ANALYSIS_PROVIDER is not configured')
  }

  const factory = adapterFactories[name]

  if (!factory) {
    throw new Error(`Unknown analysis provider: ${name}`)
  }

  return factory({ environment })
}
