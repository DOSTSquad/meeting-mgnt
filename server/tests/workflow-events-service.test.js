import { describe, it, expect, jest } from '@jest/globals'

const getRecordingForMeeting = jest.fn()

jest.unstable_mockModule('../services/recording-service.js', () => ({
  getRecordingForMeeting,
}))

const { getWorkflowSnapshot, isTranscriptionSettled } =
  await import('../services/workflow-events-service.js')

const MEETING_ID = '33333333-3333-4333-8333-333333333333'
const CALLER_ID = '44444444-4444-4444-8444-444444444444'

const fullAggregate = {
  recording: {
    id: 'rec-1',
    meetingId: MEETING_ID,
    status: 'transcribed',
    errorMessage: null,
    durationSeconds: 60,
    archivedAt: null,
    // Everything below must not reach a client.
    bucketName: 'meeting-audio',
    objectKey: 'meetings/x/recordings/y',
    fileName: 'standup.m4a',
    uploadedBy: CALLER_ID,
  },
  transcript: {
    id: 'tra-1',
    status: 'completed',
    errorMessage: null,
    durationSeconds: 60,
    completedAt: '2026-08-27T00:00:00.000Z',
    transcriptText: 'Highly confidential meeting content.',
    segments: [{ text: 'one' }, { text: 'two' }, { text: 'three' }],
  },
  analysisRun: { id: 'run-1', status: 'queued', errorMessage: null, createdBy: CALLER_ID },
}

describe('workflow snapshot projection', () => {
  it('carries identifiers, statuses, and counts only', async () => {
    getRecordingForMeeting.mockResolvedValue(fullAggregate)

    const snapshot = await getWorkflowSnapshot(MEETING_ID, CALLER_ID)

    expect(snapshot).toEqual({
      recording: {
        id: 'rec-1',
        status: 'transcribed',
        errorMessage: null,
        durationSeconds: 60,
        archivedAt: null,
      },
      transcript: {
        id: 'tra-1',
        status: 'completed',
        errorMessage: null,
        durationSeconds: 60,
        segmentCount: 3,
        completedAt: '2026-08-27T00:00:00.000Z',
      },
      analysisRun: { id: 'run-1', status: 'queued', errorMessage: null },
    })
  })

  it('never leaks transcript text or storage locations', async () => {
    getRecordingForMeeting.mockResolvedValue(fullAggregate)

    const serialised = JSON.stringify(await getWorkflowSnapshot(MEETING_ID, CALLER_ID))

    expect(serialised).not.toContain('confidential')
    expect(serialised).not.toContain('meeting-audio')
    expect(serialised).not.toContain('objectKey')
    expect(serialised).not.toContain('standup.m4a')
  })

  it('re-checks meeting access on every read', async () => {
    getRecordingForMeeting.mockRejectedValue(
      Object.assign(new Error('Only meeting participants can access recordings'), {
        statusCode: 403,
      })
    )

    await expect(getWorkflowSnapshot(MEETING_ID, CALLER_ID)).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('handles a meeting with no recording yet', async () => {
    getRecordingForMeeting.mockResolvedValue({
      recording: null,
      transcript: null,
      analysisRun: null,
    })

    await expect(getWorkflowSnapshot(MEETING_ID, CALLER_ID)).resolves.toEqual({
      recording: null,
      transcript: null,
      analysisRun: null,
    })
  })
})

describe('transcription settlement', () => {
  it.each([
    ['completed', true],
    ['failed', true],
    ['processing', false],
  ])('treats %s as settled=%s', (status, expected) => {
    expect(isTranscriptionSettled({ transcript: { status } })).toBe(expected)
  })

  it('is not settled without a transcript', () => {
    expect(isTranscriptionSettled({ transcript: null })).toBe(false)
    expect(isTranscriptionSettled(null)).toBe(false)
  })
})
