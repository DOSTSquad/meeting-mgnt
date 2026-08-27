import { describe, beforeEach, it, expect, jest } from '@jest/globals'

// Every workflow transaction must lock the recording row before it touches the
// transcript row. startTranscription and completeTranscription do this naturally;
// failTranscription has to take the lock explicitly because its first write is on
// the transcript. If one path ever reverses that order, a concurrent complete and
// fail on the same transcript deadlock in PostgreSQL:
//
//   complete: holds recording, waits for transcript
//   fail:     holds transcript, waits for recording
//
// The database aborts one with 40P01 rather than corrupting anything, but the
// error only appears under the stalled-job redelivery this design exists to
// survive, so it would be painful to diagnose. These tests pin the ordering.

const recordedQueries = []

const now = new Date('2026-08-27T00:00:00.000Z')

const recordingRow = {
  id: '11111111-1111-4111-8111-111111111111',
  meeting_id: '33333333-3333-4333-8333-333333333333',
  uploaded_by: '44444444-4444-4444-8444-444444444444',
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
  created_at: now,
}

const transcriptRow = {
  id: '22222222-2222-4222-8222-222222222222',
  meeting_id: recordingRow.meeting_id,
  source_file_id: null,
  recording_id: recordingRow.id,
  created_by: recordingRow.uploaded_by,
  status: 'processing',
  transcript_text: null,
  segments: [],
  duration_seconds: null,
  error_message: null,
  created_at: now,
  updated_at: now,
  completed_at: null,
}

// Rows are returned per table so every guard matches and the transaction runs to
// the end. A guard that returned nothing would short-circuit as stale and hide
// the very statement ordering these tests exist to check.
const rowsFor = (sql) => {
  if (sql.includes('meeting_recordings')) {
    return [recordingRow]
  }

  if (sql.includes('meeting_transcripts')) {
    return [transcriptRow]
  }

  return []
}

const fakeClient = {
  query: jest.fn(async (text) => {
    const sql = text.replace(/\s+/g, ' ').trim()
    recordedQueries.push(sql)

    return { rows: rowsFor(sql) }
  }),
}

jest.unstable_mockModule('../db/postgres.js', () => ({
  query: fakeClient.query,
  transaction: async (callback) => callback(fakeClient),
  closePool: async () => {},
}))

const { completeTranscription, failTranscription, startTranscription } =
  await import('../services/transcription-workflow-service.js')

const RECORDING_ID = '11111111-1111-4111-8111-111111111111'
const TRANSCRIPT_ID = '22222222-2222-4222-8222-222222222222'

const firstIndexMatching = (pattern) => recordedQueries.findIndex((sql) => pattern.test(sql))

const RECORDING_LOCK =
  /SELECT .* FROM meeting_recordings WHERE id = \$1( AND archived_at IS NULL)? FOR UPDATE/
const TRANSCRIPT_WRITE = /UPDATE meeting_transcripts/

beforeEach(() => {
  recordedQueries.length = 0
  fakeClient.query.mockClear()
})

describe('workflow transaction lock order', () => {
  it('locks the recording first when starting transcription', async () => {
    await startTranscription({ recordingId: RECORDING_ID, transcriptId: TRANSCRIPT_ID })

    expect(firstIndexMatching(RECORDING_LOCK)).toBe(0)
  })

  it('locks the recording before writing the transcript when completing', async () => {
    await completeTranscription({
      recordingId: RECORDING_ID,
      transcriptId: TRANSCRIPT_ID,
      result: { text: 'x', segments: [], durationSeconds: 1 },
    })

    const lockIndex = firstIndexMatching(RECORDING_LOCK)

    expect(lockIndex).toBe(0)
    expect(firstIndexMatching(TRANSCRIPT_WRITE)).toBeGreaterThan(lockIndex)
  })

  it('locks the recording before writing the transcript when failing', async () => {
    await failTranscription({
      recordingId: RECORDING_ID,
      transcriptId: TRANSCRIPT_ID,
      errorMessage: 'provider exhausted',
    })

    const lockIndex = firstIndexMatching(RECORDING_LOCK)
    const writeIndex = firstIndexMatching(TRANSCRIPT_WRITE)

    expect(lockIndex).toBe(0)
    expect(writeIndex).toBeGreaterThan(lockIndex)
  })

  it('takes the failure-path lock without the archived filter', async () => {
    await failTranscription({
      recordingId: RECORDING_ID,
      transcriptId: TRANSCRIPT_ID,
      errorMessage: 'provider exhausted',
    })

    // An archived recording's transcript must still be failed, so this lock must
    // not filter on archived_at the way the start and complete paths do.
    expect(recordedQueries[0]).not.toContain('archived_at IS NULL')
    expect(recordedQueries[0]).toContain('FOR UPDATE')
  })
})
