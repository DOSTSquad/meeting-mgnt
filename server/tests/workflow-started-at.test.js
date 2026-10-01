import { beforeEach, describe, expect, it, jest } from '@jest/globals'

// Fake client rather than a database: these tests pin the SQL the start handlers
// issue (guards and COALESCE) and how rows are serialised. The DB-backed file
// transcription-workflow-service.test.js exercises the same transitions against
// PostgreSQL when RUN_DB_TESTS is set.

const RECORDING_ID = '11111111-1111-4111-8111-111111111111'
const TRANSCRIPT_ID = '22222222-2222-4222-8222-222222222222'
const ANALYSIS_RUN_ID = '55555555-5555-4555-8555-555555555555'
const MEETING_ID = '33333333-3333-4333-8333-333333333333'
const USER_ID = '44444444-4444-4444-8444-444444444444'

const created = new Date('2026-08-27T00:00:00.000Z')
const started = new Date('2026-08-27T00:00:20.000Z')

const recordingRow = {
  id: RECORDING_ID,
  meeting_id: MEETING_ID,
  uploaded_by: USER_ID,
  file_name: 'standup.m4a',
  mime_type: 'audio/mp4',
  size_bytes: '1024',
  bucket_name: 'meeting-audio',
  object_key: 'meetings/x/recordings/y',
  duration_seconds: null,
  recorded_at: null,
  status: 'transcribing',
  error_message: null,
  archived_at: null,
  created_at: created,
}

const transcriptRow = {
  id: TRANSCRIPT_ID,
  meeting_id: MEETING_ID,
  source_file_id: null,
  recording_id: RECORDING_ID,
  created_by: USER_ID,
  status: 'processing',
  transcript_text: null,
  segments: [],
  duration_seconds: null,
  error_message: null,
  created_at: created,
  updated_at: created,
  started_at: null,
  completed_at: null,
}

const analysisRunRow = {
  id: ANALYSIS_RUN_ID,
  meeting_id: MEETING_ID,
  recording_id: RECORDING_ID,
  transcript_id: TRANSCRIPT_ID,
  created_by: USER_ID,
  status: 'queued',
  error_message: null,
  summary: null,
  key_discussions: [],
  decisions: [],
  provider: null,
  model: null,
  prompt_version: null,
  created_at: created,
  updated_at: created,
  started_at: null,
  completed_at: null,
}

const recordedQueries = []
let responses = {}

const fakeClient = {
  query: jest.fn(async (text, params) => {
    const sql = text.replace(/\s+/g, ' ').trim()
    recordedQueries.push({ sql, params })

    const match = Object.entries(responses).find(([fragment]) => sql.includes(fragment))

    return { rows: match ? match[1] : [] }
  }),
}

jest.unstable_mockModule('../db/postgres.js', () => ({
  query: fakeClient.query,
  transaction: async (callback) => callback(fakeClient),
  closePool: async () => {},
}))

const { startTranscription } = await import('../services/transcription-workflow-service.js')
const { startAnalysis } = await import('../services/analysis-workflow-service.js')
const { findLatestTranscriptByRecordingId } =
  await import('../repositories/transcript-repository.js')
const { findLatestAnalysisRunByRecordingId } =
  await import('../repositories/analysis-run-repository.js')

const queriesMatching = (fragment) => recordedQueries.filter(({ sql }) => sql.includes(fragment))

beforeEach(() => {
  recordedQueries.length = 0
  fakeClient.query.mockClear()
  responses = {}
})

describe('transcription start', () => {
  const startedTranscriptRow = { ...transcriptRow, started_at: started }

  beforeEach(() => {
    responses = {
      'FROM meeting_recordings WHERE id = $1': [recordingRow],
      'FROM meeting_transcripts WHERE id = $1': [transcriptRow],
      'UPDATE meeting_transcripts': [startedTranscriptRow],
      'UPDATE meeting_recordings': [recordingRow],
    }
  })

  it('records the first start on the transcript, guarded to the processing transcript', async () => {
    await startTranscription({ recordingId: RECORDING_ID, transcriptId: TRANSCRIPT_ID })

    const [update] = queriesMatching('UPDATE meeting_transcripts')

    expect(update.sql).toContain('started_at = COALESCE(started_at, NOW())')
    expect(update.sql).toContain("status = 'processing'")
    expect(update.sql).toContain('recording_id = $2')
    expect(update.params).toEqual([TRANSCRIPT_ID, RECORDING_ID])
  })

  it('returns the transcript with its startedAt', async () => {
    const result = await startTranscription({
      recordingId: RECORDING_ID,
      transcriptId: TRANSCRIPT_ID,
    })

    expect(result.stale).toBe(false)
    expect(result.transcript.startedAt).toBe('2026-08-27T00:00:20.000Z')
  })

  it('does not write started_at when the recording can no longer start transcribing', async () => {
    responses['UPDATE meeting_recordings'] = []

    const result = await startTranscription({
      recordingId: RECORDING_ID,
      transcriptId: TRANSCRIPT_ID,
    })

    expect(result).toEqual({ stale: true })
    expect(queriesMatching('UPDATE meeting_transcripts')).toHaveLength(0)
  })

  it('is stale when the transcript guard matches nothing', async () => {
    responses['UPDATE meeting_transcripts'] = []

    const result = await startTranscription({
      recordingId: RECORDING_ID,
      transcriptId: TRANSCRIPT_ID,
    })

    expect(result).toEqual({ stale: true })
  })

  it('does not write started_at for a transcript that is no longer processing', async () => {
    responses['FROM meeting_transcripts WHERE id = $1'] = [
      { ...transcriptRow, status: 'completed' },
    ]

    const result = await startTranscription({
      recordingId: RECORDING_ID,
      transcriptId: TRANSCRIPT_ID,
    })

    expect(result).toEqual({ stale: true })
    expect(queriesMatching('UPDATE meeting_transcripts')).toHaveLength(0)
  })
})

describe('analysis start', () => {
  beforeEach(() => {
    responses = {
      'FROM meeting_recordings WHERE id = $1': [recordingRow],
      'FROM meeting_transcripts WHERE id = $1': [{ ...transcriptRow, status: 'completed' }],
      'UPDATE analysis_runs': [{ ...analysisRunRow, status: 'processing', started_at: started }],
    }
  })

  it('records the first start on the run, guarded to this transcript', async () => {
    await startAnalysis({
      analysisRunId: ANALYSIS_RUN_ID,
      transcriptId: TRANSCRIPT_ID,
      recordingId: RECORDING_ID,
    })

    const [update] = queriesMatching('UPDATE analysis_runs')

    expect(update.sql).toContain('started_at = COALESCE(started_at, NOW())')
    expect(update.sql).toContain("status IN ('queued', 'processing')")
    expect(update.params).toEqual([ANALYSIS_RUN_ID, TRANSCRIPT_ID])
  })

  it('returns the run with its startedAt', async () => {
    const result = await startAnalysis({
      analysisRunId: ANALYSIS_RUN_ID,
      transcriptId: TRANSCRIPT_ID,
      recordingId: RECORDING_ID,
    })

    expect(result.stale).toBe(false)
    expect(result.analysisRun.startedAt).toBe('2026-08-27T00:00:20.000Z')
  })

  it('is stale when the run guard matches nothing', async () => {
    responses['UPDATE analysis_runs'] = []

    const result = await startAnalysis({
      analysisRunId: ANALYSIS_RUN_ID,
      transcriptId: TRANSCRIPT_ID,
      recordingId: RECORDING_ID,
    })

    expect(result).toEqual({ stale: true })
  })
})

describe('serialisers', () => {
  it('expose startedAt as null for rows that predate the column or have not started', async () => {
    responses = {
      'FROM meeting_transcripts': [transcriptRow],
      'FROM analysis_runs': [analysisRunRow],
    }

    const transcript = await findLatestTranscriptByRecordingId(RECORDING_ID, fakeClient)
    const analysisRun = await findLatestAnalysisRunByRecordingId(RECORDING_ID, fakeClient)

    expect(transcript.startedAt).toBeNull()
    expect(analysisRun.startedAt).toBeNull()
  })

  it('expose startedAt and completedAt as ISO strings', async () => {
    const completed = new Date('2026-08-27T00:02:00.000Z')

    responses = {
      'FROM meeting_transcripts': [
        { ...transcriptRow, status: 'completed', started_at: started, completed_at: completed },
      ],
      'FROM analysis_runs': [
        {
          ...analysisRunRow,
          status: 'ready_for_review',
          started_at: started,
          completed_at: completed,
        },
      ],
    }

    const transcript = await findLatestTranscriptByRecordingId(RECORDING_ID, fakeClient)
    const analysisRun = await findLatestAnalysisRunByRecordingId(RECORDING_ID, fakeClient)

    expect(transcript).toMatchObject({
      startedAt: '2026-08-27T00:00:20.000Z',
      completedAt: '2026-08-27T00:02:00.000Z',
    })
    expect(analysisRun).toMatchObject({
      startedAt: '2026-08-27T00:00:20.000Z',
      completedAt: '2026-08-27T00:02:00.000Z',
    })
  })

  it('select started_at so the column reaches the mapper', async () => {
    responses = {
      'FROM meeting_transcripts': [transcriptRow],
      'FROM analysis_runs': [analysisRunRow],
    }

    await findLatestTranscriptByRecordingId(RECORDING_ID, fakeClient)
    await findLatestAnalysisRunByRecordingId(RECORDING_ID, fakeClient)

    expect(queriesMatching('FROM meeting_transcripts')[0].sql).toContain('started_at')
    expect(queriesMatching('FROM analysis_runs')[0].sql).toContain('started_at')
  })
})
