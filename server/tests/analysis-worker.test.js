import { describe, beforeEach, it, expect, jest } from '@jest/globals'

const { createFixtureAnalysisAdapter } =
  await import('../services/analysis/fixture-analysis-adapter.js')
const { getAnalysisAdapter } = await import('../services/analysis/analysis-adapter.js')
const { validateAnalysisResult } = await import('../services/analysis/analysis-schema.js')
const { createAnalysisJobProcessor, createAnalysisWorker, getAnalysisWorkerConfig } =
  await import('../services/analysis-worker.js')

const ANALYSIS_RUN_ID = '11111111-1111-4111-8111-111111111111'
const TRANSCRIPT_ID = '22222222-2222-4222-8222-222222222222'
const RECORDING_ID = '33333333-3333-4333-8333-333333333333'
const MEETING_ID = '44444444-4444-4444-8444-444444444444'

const transcript = {
  id: TRANSCRIPT_ID,
  status: 'completed',
  segments: [
    { startSeconds: 0, endSeconds: 20, speaker: 'Speaker 1', text: 'one' },
    { startSeconds: 20, endSeconds: 40, speaker: 'Speaker 2', text: 'two' },
    { startSeconds: 40, endSeconds: 60, speaker: 'Speaker 3', text: 'three' },
  ],
}

const analysisRun = (overrides = {}) => ({
  id: ANALYSIS_RUN_ID,
  meetingId: MEETING_ID,
  recordingId: RECORDING_ID,
  transcriptId: TRANSCRIPT_ID,
  status: 'processing',
  ...overrides,
})

const createJob = ({ attemptsMade = 0, attempts = 3, data } = {}) => ({
  data: data ?? {
    recordingId: RECORDING_ID,
    transcriptId: TRANSCRIPT_ID,
    analysisRunId: ANALYSIS_RUN_ID,
  },
  attemptsMade,
  opts: { attempts },
})

const createDeps = (overrides = {}) => ({
  adapter: createFixtureAnalysisAdapter(),
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
  // The roster only matters to a provider that names owners; the fixture ignores
  // it, and injecting keeps these unit tests off the database.
  loadParticipants: jest.fn(async () => []),
  onStart: jest.fn(async () => ({ stale: false, analysisRun: analysisRun(), transcript })),
  onComplete: jest.fn(async () => ({
    stale: false,
    analysisRun: analysisRun({ status: 'ready_for_review' }),
    suggestions: [],
  })),
  onFail: jest.fn(async () => ({
    stale: false,
    analysisRun: analysisRun({ status: 'failed' }),
  })),
  publishStatus: jest.fn(async () => true),
  ...overrides,
})

describe('fixture analysis adapter', () => {
  it('produces summary, discussions, decisions, and suggestions', async () => {
    const result = await createFixtureAnalysisAdapter().analyse({ transcript })

    expect(result.summary).toEqual(expect.any(String))
    expect(result.keyDiscussions).toHaveLength(2)
    expect(result.decisions).toHaveLength(1)
    expect(result.suggestions).toHaveLength(2)
    expect(result.model).toBe('fixture-analysis-v1')
    expect(result.promptVersion).toEqual(expect.any(String))
  })

  it('is deterministic', async () => {
    const adapter = createFixtureAnalysisAdapter()

    expect(await adapter.analyse({ transcript })).toEqual(await adapter.analyse({ transcript }))
  })

  it('keeps evidence inside a short transcript', async () => {
    const oneSegment = { ...transcript, segments: [transcript.segments[0]] }

    const result = await createFixtureAnalysisAdapter().analyse({ transcript: oneSegment })

    expect(() => validateAnalysisResult(result, { segmentCount: 1 })).not.toThrow()
  })

  it('refuses a transcript with no segments', async () => {
    await expect(
      createFixtureAnalysisAdapter().analyse({ transcript: { segments: [] } })
    ).rejects.toThrow('at least one segment')
  })
})

describe('analysis adapter selection', () => {
  it('resolves fixture by name and refuses to default', () => {
    expect(getAnalysisAdapter({ AI_ANALYSIS_PROVIDER: 'fixture' }).name).toBe('fixture')
    expect(() => getAnalysisAdapter({})).toThrow('AI_ANALYSIS_PROVIDER is not configured')
    // 'llama' is the kind of near-miss the old message left unexplained: the
    // list shows at a glance whether it is a typo or a build without that
    // provider.
    expect(() => getAnalysisAdapter({ AI_ANALYSIS_PROVIDER: 'llama' })).toThrow(
      'Unknown analysis provider: llama (available: fixture, llm)'
    )
  })
})

describe('analysis output validation', () => {
  const valid = () => ({
    summary: 'A summary.',
    keyDiscussions: [{ topic: 'T', detail: 'D', evidence: [0] }],
    decisions: [{ decision: 'Do it', rationale: 'Because', evidence: [1] }],
    suggestions: [{ title: 'Task', priority: 'high', evidence: [2] }],
    model: 'm',
    promptVersion: 'v',
  })

  it('accepts a well-formed result', () => {
    expect(() => validateAnalysisResult(valid(), { segmentCount: 3 })).not.toThrow()
  })

  it('requires provenance', () => {
    expect(() => validateAnalysisResult({ ...valid(), model: '' }, { segmentCount: 3 })).toThrow(
      'model and promptVersion are required'
    )
  })

  it('requires a summary', () => {
    expect(() =>
      validateAnalysisResult({ ...valid(), summary: '  ' }, { segmentCount: 3 })
    ).toThrow('summary must be a non-empty string')
  })

  it('rejects evidence outside this transcript', () => {
    const result = valid()
    result.suggestions[0].evidence = [7]

    expect(() => validateAnalysisResult(result, { segmentCount: 3 })).toThrow(
      'evidence references segment 7, outside 0..2'
    )
  })

  it('rejects a negative or non-integer segment index', () => {
    const result = valid()
    result.decisions[0].evidence = [-1]

    expect(() => validateAnalysisResult(result, { segmentCount: 3 })).toThrow('outside 0..2')
  })

  it('rejects an unknown priority', () => {
    const result = valid()
    result.suggestions[0].priority = 'urgent'

    expect(() => validateAnalysisResult(result, { segmentCount: 3 })).toThrow(
      'priority must be low, medium, or high'
    )
  })

  it('rejects a non-array section', () => {
    expect(() =>
      validateAnalysisResult({ ...valid(), decisions: 'none' }, { segmentCount: 3 })
    ).toThrow('decisions must be an array')
  })
})

describe('analysis job processor', () => {
  let deps

  beforeEach(() => {
    deps = createDeps()
  })

  it('analyses and marks the run ready for review', async () => {
    const processJob = createAnalysisJobProcessor(deps)

    const result = await processJob(createJob())

    expect(result).toEqual({ status: 'ready_for_review', analysisRunId: ANALYSIS_RUN_ID })
    expect(deps.onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        analysisRunId: ANALYSIS_RUN_ID,
        result: expect.objectContaining({ provider: 'fixture', model: 'fixture-analysis-v1' }),
      })
    )
  })

  it('publishes after each committed transition', async () => {
    const processJob = createAnalysisJobProcessor(deps)

    await processJob(createJob())

    expect(deps.publishStatus).toHaveBeenCalledTimes(2)
    expect(deps.publishStatus.mock.calls[0][0]).toMatchObject({ analysisStatus: 'processing' })
    expect(deps.publishStatus.mock.calls[1][0]).toMatchObject({
      analysisStatus: 'ready_for_review',
    })
  })

  it('never publishes generated content', async () => {
    const processJob = createAnalysisJobProcessor(deps)

    await processJob(createJob())

    for (const [payload] of deps.publishStatus.mock.calls) {
      expect(JSON.stringify(payload)).not.toMatch(/Circulate|summary|decision/i)
    }
  })

  it('skips a stale run before analysing', async () => {
    deps = createDeps({ onStart: jest.fn(async () => ({ stale: true })) })
    const processJob = createAnalysisJobProcessor(deps)

    expect(await processJob(createJob())).toEqual({ status: 'skipped', reason: 'stale' })
    expect(deps.onComplete).not.toHaveBeenCalled()
    expect(deps.publishStatus).not.toHaveBeenCalled()
  })

  it('discards the result when the run went stale mid-flight', async () => {
    deps = createDeps({ onComplete: jest.fn(async () => ({ stale: true })) })
    const processJob = createAnalysisJobProcessor(deps)

    expect(await processJob(createJob())).toEqual({ status: 'skipped', reason: 'stale' })
    expect(deps.publishStatus).toHaveBeenCalledTimes(1)
  })

  it('fails the run when the adapter returns invalid output', async () => {
    deps = createDeps({
      adapter: { name: 'broken', analyse: async () => ({ summary: '', keyDiscussions: [] }) },
    })
    const processJob = createAnalysisJobProcessor(deps)

    await expect(processJob(createJob({ attemptsMade: 2 }))).rejects.toThrow(
      'Analysis output invalid'
    )
    expect(deps.onComplete).not.toHaveBeenCalled()
    expect(deps.onFail).toHaveBeenCalled()
  })

  it('rethrows without terminal state while attempts remain', async () => {
    deps = createDeps({
      adapter: {
        name: 'flaky',
        analyse: async () => {
          throw new Error('provider unavailable')
        },
      },
    })
    const processJob = createAnalysisJobProcessor(deps)

    await expect(processJob(createJob({ attemptsMade: 0 }))).rejects.toThrow('provider unavailable')
    expect(deps.onFail).not.toHaveBeenCalled()
  })

  it('writes terminal failure on the final attempt and still rethrows', async () => {
    deps = createDeps({
      adapter: {
        name: 'flaky',
        analyse: async () => {
          throw new Error('provider unavailable')
        },
      },
    })
    const processJob = createAnalysisJobProcessor(deps)

    await expect(processJob(createJob({ attemptsMade: 2 }))).rejects.toThrow('provider unavailable')
    expect(deps.onFail).toHaveBeenCalledWith({
      analysisRunId: ANALYSIS_RUN_ID,
      transcriptId: TRANSCRIPT_ID,
      recordingId: RECORDING_ID,
      errorMessage: 'provider unavailable',
    })
  })

  it('rejects a job without identifiers', async () => {
    const processJob = createAnalysisJobProcessor(deps)

    await expect(processJob(createJob({ data: {} }))).rejects.toThrow(
      'Analysis job requires transcriptId and analysisRunId'
    )
  })

  it('requires an adapter', () => {
    expect(() => createAnalysisJobProcessor({})).toThrow(
      'Analysis job processor requires an adapter'
    )
  })
})

describe('analysis worker lifecycle', () => {
  it('builds no BullMQ worker until start', () => {
    const createWorker = jest.fn(() => ({ on: jest.fn(), close: jest.fn() }))

    createAnalysisWorker({
      createWorker,
      connection: {},
      environment: { AI_ANALYSIS_PROVIDER: 'fixture' },
      logger: { log: jest.fn(), error: jest.fn() },
    })

    expect(createWorker).not.toHaveBeenCalled()
  })

  it('fails at startup when the provider is not configured', () => {
    const service = createAnalysisWorker({
      createWorker: jest.fn(),
      connection: {},
      environment: {},
      logger: { log: jest.fn(), error: jest.fn() },
    })

    expect(() => service.start()).toThrow('AI_ANALYSIS_PROVIDER is not configured')
  })

  it('starts once and closes on stop', async () => {
    const close = jest.fn(async () => {})
    const createWorker = jest.fn(() => ({ on: jest.fn(), close }))
    const service = createAnalysisWorker({
      createWorker,
      connection: {},
      environment: { AI_ANALYSIS_PROVIDER: 'fixture', RECORDING_ANALYSIS_CONCURRENCY: '3' },
      logger: { log: jest.fn(), error: jest.fn() },
    })

    service.start()
    service.start()
    expect(createWorker).toHaveBeenCalledTimes(1)
    expect(createWorker.mock.calls[0][2]).toMatchObject({ concurrency: 3 })

    await service.stop()
    await service.stop()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('falls back to safe defaults', () => {
    expect(getAnalysisWorkerConfig({})).toEqual({ concurrency: 2, lockDurationMs: 120000 })
  })
})
