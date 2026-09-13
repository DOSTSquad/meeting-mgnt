import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const mockCreateAiResultConsumer = jest.fn()
const mockGetObject = jest.fn()
const mockFindTranscriptById = jest.fn()
const mockStartTranscription = jest.fn()
const mockCompleteTranscription = jest.fn()
const mockFailTranscription = jest.fn()
const mockStartAnalysis = jest.fn()
const mockCompleteAnalysis = jest.fn()
const mockFailAnalysis = jest.fn()
const mockPublishWorkflowStatus = jest.fn().mockResolvedValue(true)

jest.unstable_mockModule('../services/ai-streams.js', () => ({
  createAiResultConsumer: mockCreateAiResultConsumer,
}))
jest.unstable_mockModule('../services/minio-client.js', () => ({
  getObject: mockGetObject,
}))
jest.unstable_mockModule('../repositories/transcript-repository.js', () => ({
  findTranscriptById: mockFindTranscriptById,
}))
jest.unstable_mockModule('../services/transcription-workflow-service.js', () => ({
  completeTranscription: mockCompleteTranscription,
  failTranscription: mockFailTranscription,
  startTranscription: mockStartTranscription,
}))
jest.unstable_mockModule('../services/analysis-workflow-service.js', () => ({
  completeAnalysis: mockCompleteAnalysis,
  failAnalysis: mockFailAnalysis,
  startAnalysis: mockStartAnalysis,
}))
jest.unstable_mockModule('../services/workflow-status-publisher.js', () => ({
  publishWorkflowStatus: mockPublishWorkflowStatus,
}))

const { createAiResultConsumerService, handleAiResult } =
  await import('../services/ai-result-consumer.js')

const objectStream = (value) => ({
  async *[Symbol.asyncIterator]() {
    yield Buffer.from(JSON.stringify(value))
  },
})

describe('AI result consumer', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockStartTranscription.mockResolvedValue({ stale: false, recording: { id: 'recording-1' } })
    mockCompleteTranscription.mockResolvedValue({
      stale: false,
      recording: { id: 'recording-1', meetingId: 'meeting-1', status: 'transcribed' },
      transcript: { id: 'transcript-1', status: 'completed' },
    })
    mockFailTranscription.mockResolvedValue({ stale: false, recording: { id: 'recording-1' } })
    mockStartAnalysis.mockResolvedValue({ stale: false, analysisRun: { id: 'analysis-1' } })
    mockCompleteAnalysis.mockResolvedValue({
      stale: false,
      analysisRun: {
        id: 'analysis-1',
        meetingId: 'meeting-1',
        recordingId: 'recording-1',
        transcriptId: 'transcript-1',
        status: 'ready_for_review',
      },
    })
    mockFailAnalysis.mockResolvedValue({ stale: false, analysisRun: { id: 'analysis-1' } })
    mockFindTranscriptById.mockResolvedValue({ segments: [] })
    mockGetObject.mockResolvedValue(objectStream({ text: 'Transcript', segments: [] }))
    mockCreateAiResultConsumer.mockReturnValue({ start: jest.fn(), stop: jest.fn() })
  })

  it('loads a transcription artifact and completes the guarded workflow', async () => {
    const resultRef = { bucket: 'meeting-ai-results', key: 'ai-results/transcriptions/t.json' }

    await handleAiResult({
      eventType: 'transcription.completed',
      payload: {
        recordingId: 'recording-1',
        transcriptId: 'transcript-1',
        analysisRunId: 'analysis-1',
        resultRef,
      },
    })

    expect(mockGetObject).toHaveBeenCalledWith(resultRef.bucket, resultRef.key)
    expect(mockCompleteTranscription).toHaveBeenCalledWith({
      recordingId: 'recording-1',
      transcriptId: 'transcript-1',
      analysisRunId: 'analysis-1',
      result: {
        text: 'Transcript',
        segments: [],
        resultRef,
      },
    })
    expect(mockPublishWorkflowStatus).toHaveBeenCalled()
  })

  it('wires stream messages to the result handler', async () => {
    createAiResultConsumerService({ logger: console })

    const { onMessage } = mockCreateAiResultConsumer.mock.calls[0][0]
    await onMessage({
      eventType: 'analysis.started',
      payload: {
        analysisRunId: 'analysis-1',
        transcriptId: 'transcript-1',
        recordingId: 'recording-1',
      },
    })

    expect(mockStartAnalysis).toHaveBeenCalledWith({
      analysisRunId: 'analysis-1',
      transcriptId: 'transcript-1',
      recordingId: 'recording-1',
    })
  })
})
