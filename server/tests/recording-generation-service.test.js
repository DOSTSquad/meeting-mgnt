import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const meetingId = '11111111-1111-4111-8111-111111111111'
const recordingId = '22222222-2222-4222-8222-222222222222'
const ownerId = '33333333-3333-4333-8333-333333333333'
const transcriptId = '44444444-4444-4444-8444-444444444444'
const recording = {
  id: recordingId,
  meetingId,
  uploadedBy: ownerId,
  status: 'failed',
  bucketName: 'meeting-audio',
  objectKey: `meetings/${meetingId}/recordings/${recordingId}`,
}

const createTranscript = jest.fn()
const createAnalysisRun = jest.fn()
const createWorkflowOutboxEvent = jest.fn()
const updateRecordingStatus = jest.fn()

jest.unstable_mockModule('../db/postgres.js', () => ({
  transaction: jest.fn(async (callback) => callback({ query: jest.fn() })),
}))

jest.unstable_mockModule('../repositories/meeting-repository.js', () => ({
  findMeetingById: jest.fn(async () => ({ id: meetingId, ownerId })),
}))

jest.unstable_mockModule('../repositories/participant-repository.js', () => ({
  listByMeeting: jest.fn(async () => []),
}))

jest.unstable_mockModule('../repositories/recording-repository.js', () => ({
  archiveRecording: jest.fn(),
  createRecording: jest.fn(),
  findActiveRecordingByMeetingId: jest.fn(async () => recording),
  lockActiveRecordingById: jest.fn(async () => recording),
  updateRecordingStatus,
}))

jest.unstable_mockModule('../repositories/transcript-repository.js', () => ({
  createTranscript,
  findLatestTranscriptByRecordingId: jest.fn(async () => null),
}))

jest.unstable_mockModule('../repositories/analysis-run-repository.js', () => ({
  createAnalysisRun,
  findLatestAnalysisRunByRecordingId: jest.fn(async () => null),
}))

jest.unstable_mockModule('../repositories/workflow-outbox-repository.js', () => ({
  createWorkflowOutboxEvent,
}))

jest.unstable_mockModule('../services/minio-client.js', () => ({
  BUCKET_AUDIO: 'meeting-audio',
  putObject: jest.fn(),
  removeObject: jest.fn(),
}))

const { generateMinutesFromRecording } = await import('../services/recording-service.js')

describe('recording generation service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.AI_PIPELINE_ENABLED = 'true'
    createTranscript.mockResolvedValue({
      id: transcriptId,
      meetingId,
      recordingId,
      status: 'processing',
    })
    createAnalysisRun.mockImplementation(async ({ id }) => ({
      id,
      meetingId,
      recordingId,
      transcriptId,
      status: 'queued',
    }))
    updateRecordingStatus.mockResolvedValue({ ...recording, status: 'uploaded' })
  })

  it('queues a durable workflow for an existing recording', async () => {
    const result = await generateMinutesFromRecording(meetingId, ownerId)

    expect(result).toMatchObject({
      generationStatus: 'queued',
      recording: { status: 'uploaded' },
      transcript: { id: transcriptId, status: 'processing' },
      analysisRun: { status: 'queued' },
    })
    expect(createWorkflowOutboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'recording.generation_requested',
        aggregateType: 'analysis_run',
        payload: expect.objectContaining({ recordingId, transcriptId }),
      }),
      expect.anything()
    )
  })

  it('returns a service error when the pipeline is disabled', async () => {
    process.env.AI_PIPELINE_ENABLED = 'false'

    await expect(generateMinutesFromRecording(meetingId, ownerId)).rejects.toMatchObject({
      statusCode: 503,
      message: 'Speech-to-text pipeline is not enabled',
    })
  })
})
