const MODEL = 'fixture-analysis-v1'
const PROMPT_VERSION = '2026-08-27'

// Evidence indexes are clamped to what the transcript actually has, so the
// fixture stays valid against a one-segment transcript as well as the three the
// fixture transcription adapter produces.
const clamp = (index, segmentCount) => Math.min(index, Math.max(segmentCount - 1, 0))

export const createFixtureAnalysisAdapter = () => ({
  name: 'fixture',

  analyse: async ({ transcript }) => {
    const segments = Array.isArray(transcript?.segments) ? transcript.segments : []
    const segmentCount = segments.length

    if (segmentCount === 0) {
      throw new Error('Analysis requires a transcript with at least one segment')
    }

    return {
      summary:
        'The team reviewed status, confirmed the recording workflow processed this meeting, and agreed to follow up on open items.',
      keyDiscussions: [
        {
          topic: 'Status update',
          detail: 'The meeting opened with a round of status updates.',
          evidence: [clamp(0, segmentCount)],
        },
        {
          topic: 'Recording workflow',
          detail: 'The recording was transcribed by the configured provider.',
          evidence: [clamp(1, segmentCount)],
        },
      ],
      decisions: [
        {
          decision: 'Follow up on the open items before the next meeting.',
          rationale: 'Agreed at the end of the discussion.',
          evidence: [clamp(2, segmentCount)],
        },
      ],
      suggestions: [
        {
          title: 'Circulate the status update notes',
          description: 'Share the status summary with everyone who could not attend.',
          priority: 'medium',
          evidence: [clamp(0, segmentCount)],
        },
        {
          title: 'Close out the open items',
          description: 'Confirm each open item is resolved before the next meeting.',
          priority: 'high',
          evidence: [clamp(2, segmentCount)],
        },
      ],
      model: MODEL,
      promptVersion: PROMPT_VERSION,
    }
  },
})
