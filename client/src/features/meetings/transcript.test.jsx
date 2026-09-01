import { describe, expect, it } from 'vitest'

import { hasTranscriptBody } from './transcript.js'

/**
 * The analysis panel and the transcript panel both gate on this. They used to
 * decide separately, which is how the analysis came to render while the
 * transcript it cites was still empty.
 */
describe('hasTranscriptBody', () => {
  it('is false before there is a transcript at all', () => {
    expect(hasTranscriptBody(undefined)).toBe(false)
    expect(hasTranscriptBody(null)).toBe(false)
  })

  it('is false while transcription is still running', () => {
    expect(hasTranscriptBody({ status: 'processing', segments: [] })).toBe(false)
  })

  // The status arrives over the stream before the body is fetched, so completed
  // and empty is a real state rather than a defensive check.
  it('is false when the status has landed but the body has not', () => {
    expect(hasTranscriptBody({ status: 'completed', segments: [], transcriptText: '' })).toBe(false)
  })

  it('is true once there are segments', () => {
    expect(hasTranscriptBody({ status: 'completed', segments: [{ text: 'Hello.' }] })).toBe(true)
  })

  it('is true for a provider that returns text without segments', () => {
    expect(hasTranscriptBody({ status: 'completed', segments: [], transcriptText: 'Hello.' })).toBe(
      true
    )
  })

  it('is false for a failed transcript that carries an error instead', () => {
    expect(hasTranscriptBody({ status: 'failed', segments: [], errorMessage: 'nope' })).toBe(false)
  })
})
