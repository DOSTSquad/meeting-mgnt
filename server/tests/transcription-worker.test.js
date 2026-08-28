import { Readable } from 'node:stream'

import { describe, beforeEach, it, expect, jest } from '@jest/globals'

const { createFixtureTranscriptionAdapter } =
  await import('../services/transcription/fixture-transcription-adapter.js')
const { getTranscriptionAdapter } =
  await import('../services/transcription/transcription-adapter.js')
const { publishWorkflowStatus, WORKFLOW_STATUS_CHANNEL } =
  await import('../services/workflow-status-publisher.js')
const { createTranscriptionJobProcessor, createTranscriptionWorker, getTranscriptionWorkerConfig } =
  await import('../services/transcription-worker.js')

const RECORDING_ID = '11111111-1111-4111-8111-111111111111'
const TRANSCRIPT_ID = '22222222-2222-4222-8222-222222222222'
const MEETING_ID = '33333333-3333-4333-8333-333333333333'

const createRecording = (overrides = {}) => ({
  id: RECORDING_ID,
  meetingId: MEETING_ID,
  bucketName: 'meeting-audio',
  objectKey: `meetings/${MEETING_ID}/recordings/${RECORDING_ID}`,
  status: 'transcribing',
  fileName: 'standup.m4a',
  mimeType: 'audio/mp4',
  ...overrides,
})

const createTranscript = (overrides = {}) => ({
  id: TRANSCRIPT_ID,
  recordingId: RECORDING_ID,
  status: 'processing',
  ...overrides,
})

const createJob = ({ attemptsMade = 0, attempts = 3, data } = {}) => ({
  data: data ?? { recordingId: RECORDING_ID, transcriptId: TRANSCRIPT_ID },
  attemptsMade,
  opts: { attempts },
})

const createDeps = (overrides = {}) => ({
  adapter: createFixtureTranscriptionAdapter(),
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
  openAudioStream: jest.fn(async () => Readable.from([Buffer.from('audio-bytes')])),
  onStart: jest.fn(async () => ({
    stale: false,
    recording: createRecording(),
    transcript: createTranscript(),
  })),
  onComplete: jest.fn(async () => ({
    stale: false,
    recording: createRecording({ status: 'transcribed' }),
    transcript: createTranscript({ status: 'completed' }),
  })),
  onFail: jest.fn(async () => ({
    stale: false,
    recording: createRecording({ status: 'failed' }),
    transcript: createTranscript({ status: 'failed' }),
    analysisRuns: [],
  })),
  publishStatus: jest.fn(async () => true),
  ...overrides,
})

describe('fixture transcription adapter', () => {
  it('returns deterministic text, segments, and duration', async () => {
    const adapter = createFixtureTranscriptionAdapter()

    const first = await adapter.transcribe({
      recording: createRecording(),
      audioStream: Readable.from([Buffer.from('a')]),
    })
    const second = await adapter.transcribe({
      recording: createRecording({ id: 'other' }),
      audioStream: Readable.from([Buffer.from('completely different bytes')]),
    })

    expect(first.text).toEqual(second.text)
    expect(first.segments).toEqual(second.segments)
    expect(first.durationSeconds).toBe(second.durationSeconds)
    expect(first.segments).toHaveLength(3)
    expect(first.durationSeconds).toBe(60)
    expect(first.segments[0]).toMatchObject({ startSeconds: 0, endSeconds: 20 })
  })

  it('consumes the audio stream and reports its size', async () => {
    const adapter = createFixtureTranscriptionAdapter()
    const chunks = [Buffer.alloc(1024), Buffer.alloc(2048)]

    const result = await adapter.transcribe({
      recording: createRecording(),
      audioStream: Readable.from(chunks),
    })

    expect(result.audioByteLength).toBe(3072)
  })

  it('rejects a missing audio stream', async () => {
    const adapter = createFixtureTranscriptionAdapter()

    await expect(adapter.transcribe({ recording: createRecording() })).rejects.toThrow(
      'Transcription requires an audio stream'
    )
  })
})

describe('transcription adapter selection', () => {
  it('resolves the fixture adapter by name', () => {
    expect(getTranscriptionAdapter({ AI_TRANSCRIPTION_PROVIDER: 'fixture' }).name).toBe('fixture')
  })

  it('refuses to default when the provider is unset', () => {
    expect(() => getTranscriptionAdapter({})).toThrow('AI_TRANSCRIPTION_PROVIDER is not configured')
    expect(() => getTranscriptionAdapter({ AI_TRANSCRIPTION_PROVIDER: '' })).toThrow(
      'AI_TRANSCRIPTION_PROVIDER is not configured'
    )
  })

  it('rejects an unknown provider', () => {
    expect(() => getTranscriptionAdapter({ AI_TRANSCRIPTION_PROVIDER: 'whisper' })).toThrow(
      'Unknown transcription provider: whisper'
    )
  })
})

describe('transcription job processor', () => {
  let deps

  beforeEach(() => {
    deps = createDeps()
  })

  it('transcribes and completes the job', async () => {
    const processJob = createTranscriptionJobProcessor(deps)

    const result = await processJob(createJob())

    expect(result).toEqual({ status: 'completed', transcriptId: TRANSCRIPT_ID })
    expect(deps.onStart).toHaveBeenCalledWith({
      recordingId: RECORDING_ID,
      transcriptId: TRANSCRIPT_ID,
    })
    expect(deps.onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        recordingId: RECORDING_ID,
        transcriptId: TRANSCRIPT_ID,
        result: expect.objectContaining({ durationSeconds: 60 }),
      })
    )
    expect(deps.onFail).not.toHaveBeenCalled()
  })

  it('publishes an invalidation for each committed transition', async () => {
    const processJob = createTranscriptionJobProcessor(deps)

    await processJob(createJob())

    expect(deps.publishStatus).toHaveBeenCalledTimes(2)
    expect(deps.publishStatus.mock.calls[0][0]).toMatchObject({ recordingStatus: 'transcribing' })
    expect(deps.publishStatus.mock.calls[1][0]).toMatchObject({
      recordingStatus: 'transcribed',
      transcriptStatus: 'completed',
    })
  })

  it('never publishes transcript content or storage locations', async () => {
    const processJob = createTranscriptionJobProcessor(deps)

    await processJob(createJob())

    for (const [payload] of deps.publishStatus.mock.calls) {
      expect(Object.keys(payload).sort()).toEqual([
        'meetingId',
        'recordingId',
        'recordingStatus',
        'transcriptId',
        'transcriptStatus',
      ])
    }
  })

  it('skips a stale job before doing any work', async () => {
    deps = createDeps({ onStart: jest.fn(async () => ({ stale: true })) })
    const processJob = createTranscriptionJobProcessor(deps)

    const result = await processJob(createJob())

    expect(result).toEqual({ status: 'skipped', reason: 'stale' })
    expect(deps.openAudioStream).not.toHaveBeenCalled()
    expect(deps.onComplete).not.toHaveBeenCalled()
    expect(deps.publishStatus).not.toHaveBeenCalled()
  })

  it('discards the result when the recording was replaced mid-flight', async () => {
    deps = createDeps({ onComplete: jest.fn(async () => ({ stale: true })) })
    const processJob = createTranscriptionJobProcessor(deps)

    const result = await processJob(createJob())

    expect(result).toEqual({ status: 'skipped', reason: 'stale' })
    expect(deps.publishStatus).toHaveBeenCalledTimes(1)
  })

  it('rethrows without terminal state while attempts remain', async () => {
    deps = createDeps({
      openAudioStream: jest.fn(async () => {
        throw new Error('storage unavailable')
      }),
    })
    const processJob = createTranscriptionJobProcessor(deps)

    await expect(processJob(createJob({ attemptsMade: 0, attempts: 3 }))).rejects.toThrow(
      'storage unavailable'
    )
    expect(deps.onFail).not.toHaveBeenCalled()
  })

  it('writes terminal failure on the final attempt and still rethrows', async () => {
    deps = createDeps({
      openAudioStream: jest.fn(async () => {
        throw new Error('storage unavailable')
      }),
    })
    const processJob = createTranscriptionJobProcessor(deps)

    await expect(processJob(createJob({ attemptsMade: 2, attempts: 3 }))).rejects.toThrow(
      'storage unavailable'
    )
    expect(deps.onFail).toHaveBeenCalledWith({
      recordingId: RECORDING_ID,
      transcriptId: TRANSCRIPT_ID,
      errorMessage: 'storage unavailable',
    })
    expect(deps.publishStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ recordingStatus: 'failed', transcriptStatus: 'failed' }),
      expect.anything()
    )
  })

  it('does not publish when terminal failure lands on a stale recording', async () => {
    deps = createDeps({
      openAudioStream: jest.fn(async () => {
        throw new Error('gone')
      }),
      onFail: jest.fn(async () => ({ stale: true })),
    })
    const processJob = createTranscriptionJobProcessor(deps)

    await expect(processJob(createJob({ attemptsMade: 2, attempts: 3 }))).rejects.toThrow('gone')
    expect(deps.publishStatus).toHaveBeenCalledTimes(1)
  })

  it('rejects a job without identifiers', async () => {
    const processJob = createTranscriptionJobProcessor(deps)

    await expect(processJob(createJob({ data: {} }))).rejects.toThrow(
      'Transcription job requires recordingId and transcriptId'
    )
  })

  it('requires an adapter', () => {
    expect(() => createTranscriptionJobProcessor({})).toThrow(
      'Transcription job processor requires an adapter'
    )
  })
})

describe('transcription worker lifecycle', () => {
  it('does not construct a BullMQ worker until start', () => {
    const createWorker = jest.fn(() => ({ on: jest.fn(), close: jest.fn() }))

    createTranscriptionWorker({
      createWorker,
      connection: {},
      environment: { AI_TRANSCRIPTION_PROVIDER: 'fixture' },
      logger: { log: jest.fn(), error: jest.fn() },
    })

    expect(createWorker).not.toHaveBeenCalled()
  })

  it('starts once and closes on stop', async () => {
    const close = jest.fn(async () => {})
    const createWorker = jest.fn(() => ({ on: jest.fn(), close }))
    const service = createTranscriptionWorker({
      createWorker,
      connection: {},
      environment: {
        AI_TRANSCRIPTION_PROVIDER: 'fixture',
        RECORDING_TRANSCRIPTION_CONCURRENCY: '4',
      },
      logger: { log: jest.fn(), error: jest.fn() },
    })

    service.start()
    service.start()

    expect(createWorker).toHaveBeenCalledTimes(1)
    expect(createWorker.mock.calls[0][2]).toMatchObject({ concurrency: 4 })

    await service.stop()
    await service.stop()

    expect(close).toHaveBeenCalledTimes(1)
  })

  it('fails at startup when the provider is not configured', () => {
    const service = createTranscriptionWorker({
      createWorker: jest.fn(),
      connection: {},
      environment: {},
      logger: { log: jest.fn(), error: jest.fn() },
    })

    expect(() => service.start()).toThrow('AI_TRANSCRIPTION_PROVIDER is not configured')
  })

  it('falls back to safe defaults for concurrency and timeout', () => {
    expect(getTranscriptionWorkerConfig({})).toEqual({ concurrency: 2, lockDurationMs: 120000 })
    expect(
      getTranscriptionWorkerConfig({
        RECORDING_TRANSCRIPTION_CONCURRENCY: 'nonsense',
        RECORDING_TRANSCRIPTION_TIMEOUT_MS: '-5',
      })
    ).toEqual({ concurrency: 2, lockDurationMs: 120000 })
  })
})

describe('workflow status publisher', () => {
  it('publishes identifiers and status labels only', async () => {
    const publish = jest.fn(async () => 1)

    await publishWorkflowStatus(
      {
        meetingId: MEETING_ID,
        recordingId: RECORDING_ID,
        transcriptId: TRANSCRIPT_ID,
        recordingStatus: 'transcribed',
        transcriptStatus: 'completed',
      },
      { connection: { publish }, logger: { error: jest.fn() } }
    )

    expect(publish).toHaveBeenCalledWith(WORKFLOW_STATUS_CHANNEL, expect.any(String))

    const payload = JSON.parse(publish.mock.calls[0][1])

    expect(Object.keys(payload).sort()).toEqual([
      'analysisStatus',
      'meetingId',
      'publishedAt',
      'recordingId',
      'recordingStatus',
      'transcriptId',
      'transcriptStatus',
    ])
    expect(publish.mock.calls[0][1]).not.toMatch(/meeting-audio|objectKey|http/)
  })

  it('swallows publish failures so a committed job is not retried', async () => {
    const logger = { error: jest.fn() }
    const publish = jest.fn(async () => {
      throw new Error('redis down')
    })

    await expect(
      publishWorkflowStatus(
        { meetingId: MEETING_ID, recordingId: RECORDING_ID, recordingStatus: 'transcribed' },
        { connection: { publish }, logger }
      )
    ).resolves.toBe(false)
    expect(logger.error).toHaveBeenCalled()
  })
})
