import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

import { describe, beforeAll, beforeEach, afterAll, it, expect } from '@jest/globals'
import { parse } from 'dotenv'

const serverDir = fileURLToPath(new URL('../', import.meta.url))
const repoRoot = path.resolve(serverDir, '..')
const envPath = existsSync(path.join(repoRoot, '.env'))
  ? path.join(repoRoot, '.env')
  : path.join(repoRoot, '.env.example')
const projectEnv = parse(readFileSync(envPath))
const runDatabaseTests = process.env.RUN_DB_TESTS === 'true' && Boolean(projectEnv.DATABASE_URL)

process.env.DATABASE_URL = projectEnv.DATABASE_URL

const { runMigrations } = await import('../db/migrate.js')
const { closePool, query } = await import('../db/postgres.js')
const { completeTranscription, failTranscription, startTranscription } =
  await import('../services/transcription-workflow-service.js')
const { createWhisperTranscriptionAdapter } =
  await import('../services/transcription/whisper-transcription-adapter.js')
const { completeAnalysis, failAnalysis, startAnalysis } =
  await import('../services/analysis-workflow-service.js')
const { listSuggestionsForAnalysisRun } =
  await import('../repositories/analysis-suggestion-repository.js')

const dbDescribe = runDatabaseTests ? describe : describe.skip

const FIXTURE_RESULT = {
  text: 'Fixture transcript body.',
  segments: [
    { startSeconds: 0, endSeconds: 20, speaker: 'Speaker 1', text: 'Fixture transcript body.' },
  ],
  durationSeconds: 60,
}

let userId
let meetingId
let recordingId
let transcriptId
let analysisRunId

const readRecording = async (id) => {
  const result = await query(
    'SELECT status, error_message, duration_seconds, archived_at FROM meeting_recordings WHERE id = $1',
    [id]
  )

  return result.rows[0]
}

const readTranscript = async (id) => {
  const result = await query(
    'SELECT status, transcript_text, segments, duration_seconds, error_message, completed_at FROM meeting_transcripts WHERE id = $1',
    [id]
  )

  return result.rows[0]
}

const readAnalysisRun = async (id) => {
  const result = await query('SELECT status, error_message FROM analysis_runs WHERE id = $1', [id])

  return result.rows[0]
}

beforeAll(async () => {
  if (!runDatabaseTests) {
    return
  }

  await runMigrations()
})

beforeEach(async () => {
  if (!runDatabaseTests) {
    return
  }

  userId = randomUUID()
  meetingId = randomUUID()
  recordingId = randomUUID()
  transcriptId = randomUUID()
  analysisRunId = randomUUID()

  await query('TRUNCATE TABLE meetings RESTART IDENTITY CASCADE')
  await query('TRUNCATE TABLE users RESTART IDENTITY CASCADE')

  await query(
    `
      INSERT INTO users (id, name, email, password_hash, role, department)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [userId, 'Transcription User', `transcription-${userId}@example.com`, 'hash', 'staff', 'ops']
  )
  await query(
    `
      INSERT INTO meetings (id, title, starts_at, ends_at, timezone_name, owner_id, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $6)
    `,
    [
      meetingId,
      'Transcription Meeting',
      '2026-05-01T09:00:00Z',
      '2026-05-01T10:00:00Z',
      'UTC',
      userId,
    ]
  )
  await query(
    `
      INSERT INTO meeting_recordings (
        id, meeting_id, uploaded_by, file_name, mime_type, size_bytes, bucket_name, object_key, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'uploaded')
    `,
    [
      recordingId,
      meetingId,
      userId,
      'transcription.mp3',
      'audio/mpeg',
      1024,
      'meeting-audio',
      `meetings/${meetingId}/recordings/${recordingId}`,
    ]
  )
  await query(
    `
      INSERT INTO meeting_transcripts (id, meeting_id, recording_id, created_by, status)
      VALUES ($1, $2, $3, $4, 'processing')
    `,
    [transcriptId, meetingId, recordingId, userId]
  )
  await query(
    `
      INSERT INTO analysis_runs (id, meeting_id, recording_id, transcript_id, created_by, status)
      VALUES ($1, $2, $3, $4, $5, 'queued')
    `,
    [analysisRunId, meetingId, recordingId, transcriptId, userId]
  )
})

afterAll(async () => {
  if (!runDatabaseTests) {
    return
  }

  await closePool()
})

dbDescribe('transcription workflow transitions', () => {
  it('moves the recording to transcribing when work starts', async () => {
    const started = await startTranscription({ recordingId, transcriptId })

    expect(started.stale).toBe(false)
    expect(started.recording.status).toBe('transcribing')
    expect((await readRecording(recordingId)).status).toBe('transcribing')
  })

  it('is idempotent across a retry or process restart', async () => {
    await startTranscription({ recordingId, transcriptId })
    const second = await startTranscription({ recordingId, transcriptId })

    expect(second.stale).toBe(false)
    expect(second.recording.status).toBe('transcribing')
  })

  it('completes the transcript and the recording in one transaction', async () => {
    await startTranscription({ recordingId, transcriptId })

    const completed = await completeTranscription({
      recordingId,
      transcriptId,
      result: FIXTURE_RESULT,
    })

    expect(completed.stale).toBe(false)

    const recording = await readRecording(recordingId)
    const transcript = await readTranscript(transcriptId)

    expect(recording.status).toBe('transcribed')
    expect(recording.duration_seconds).toBe(60)
    expect(transcript.status).toBe('completed')
    expect(transcript.transcript_text).toBe(FIXTURE_RESULT.text)
    expect(transcript.segments).toEqual(FIXTURE_RESULT.segments)
    expect(transcript.completed_at).not.toBeNull()
  })

  it('persists a fractional Whisper duration after adapter normalization', async () => {
    const adapter = createWhisperTranscriptionAdapter({
      environment: { AI_SERVICE_URL: 'http://ai-service.test' },
      request: async (_url, options) => {
        for await (const chunk of options.body) {
          void chunk
        }

        return new Response(
          JSON.stringify({
            text: 'A short transcript.',
            language: 'en',
            duration_seconds: 12.5,
            model: 'small',
            segments: [{ id: 0, start: 0, end: 12.5, text: 'A short transcript.' }],
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      },
    })
    const result = await adapter.transcribe({
      recording: { fileName: 'meeting.wav', mimeType: 'audio/wav' },
      audioStream: Readable.from([Buffer.from('audio')]),
    })

    await startTranscription({ recordingId, transcriptId })
    await completeTranscription({ recordingId, transcriptId, result })

    expect((await readRecording(recordingId)).duration_seconds).toBe(13)
    expect((await readTranscript(transcriptId)).duration_seconds).toBe(13)
  })

  it('treats a duplicate completion as stale instead of rewriting state', async () => {
    await startTranscription({ recordingId, transcriptId })
    await completeTranscription({ recordingId, transcriptId, result: FIXTURE_RESULT })

    const duplicate = await completeTranscription({
      recordingId,
      transcriptId,
      result: { ...FIXTURE_RESULT, text: 'second delivery', durationSeconds: 999 },
    })

    expect(duplicate.stale).toBe(true)

    const transcript = await readTranscript(transcriptId)

    expect(transcript.transcript_text).toBe(FIXTURE_RESULT.text)
    expect((await readRecording(recordingId)).duration_seconds).toBe(60)
  })

  it('refuses to start once the recording is archived', async () => {
    await query('UPDATE meeting_recordings SET archived_at = NOW() WHERE id = $1', [recordingId])

    expect((await startTranscription({ recordingId, transcriptId })).stale).toBe(true)
    expect((await readRecording(recordingId)).status).toBe('uploaded')
  })

  it('discards a result for a recording replaced while transcribing', async () => {
    await startTranscription({ recordingId, transcriptId })
    await query('UPDATE meeting_recordings SET archived_at = NOW() WHERE id = $1', [recordingId])

    const replacementId = randomUUID()
    await query(
      `
        INSERT INTO meeting_recordings (
          id, meeting_id, uploaded_by, file_name, mime_type, size_bytes, bucket_name, object_key, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'uploaded')
      `,
      [
        replacementId,
        meetingId,
        userId,
        'replacement.mp3',
        'audio/mpeg',
        2048,
        'meeting-audio',
        `meetings/${meetingId}/recordings/${replacementId}`,
      ]
    )

    const completed = await completeTranscription({
      recordingId,
      transcriptId,
      result: FIXTURE_RESULT,
    })

    expect(completed.stale).toBe(true)
    expect((await readTranscript(transcriptId)).status).toBe('processing')
    expect((await readRecording(replacementId)).status).toBe('uploaded')
  })

  it('fails transcript, recording, and the waiting analysis run together', async () => {
    await startTranscription({ recordingId, transcriptId })

    const failed = await failTranscription({
      recordingId,
      transcriptId,
      errorMessage: 'provider exhausted',
    })

    expect(failed.stale).toBe(false)
    expect(failed.analysisRuns).toHaveLength(1)

    expect(await readTranscript(transcriptId)).toMatchObject({
      status: 'failed',
      error_message: 'provider exhausted',
    })
    expect(await readRecording(recordingId)).toMatchObject({
      status: 'failed',
      error_message: 'provider exhausted',
    })
    expect(await readAnalysisRun(analysisRunId)).toMatchObject({
      status: 'failed',
      error_message: 'provider exhausted',
    })
  })

  it('fails an archived recording transcript without touching the replacement', async () => {
    await startTranscription({ recordingId, transcriptId })
    await query('UPDATE meeting_recordings SET archived_at = NOW() WHERE id = $1', [recordingId])

    const failed = await failTranscription({
      recordingId,
      transcriptId,
      errorMessage: 'provider exhausted',
    })

    expect(failed.stale).toBe(false)
    expect(failed.recording).toBeNull()
    expect((await readTranscript(transcriptId)).status).toBe('failed')
    expect((await readAnalysisRun(analysisRunId)).status).toBe('failed')
    expect((await readRecording(recordingId)).status).toBe('transcribing')
  })

  // Scheduling decides who wins, so this cannot force the interleaving that a
  // reversed lock order would deadlock on. It checks the weaker but still useful
  // property that exactly one path commits. The lock ordering itself is pinned in
  // transcription-lock-order.test.js.
  it('keeps exactly one winner when a complete and a fail race', async () => {
    await startTranscription({ recordingId, transcriptId })

    const [completed, failed] = await Promise.all([
      completeTranscription({ recordingId, transcriptId, result: FIXTURE_RESULT }),
      failTranscription({ recordingId, transcriptId, errorMessage: 'provider exhausted' }),
    ])

    expect([completed.stale, failed.stale].filter(Boolean)).toHaveLength(1)

    const transcript = await readTranscript(transcriptId)
    const recording = await readRecording(recordingId)

    if (completed.stale) {
      expect(transcript.status).toBe('failed')
      expect(recording.status).toBe('failed')
    } else {
      expect(transcript.status).toBe('completed')
      expect(recording.status).toBe('transcribed')
    }
  })

  it('survives many concurrent duplicate completions', async () => {
    await startTranscription({ recordingId, transcriptId })

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        completeTranscription({ recordingId, transcriptId, result: FIXTURE_RESULT })
      )
    )

    expect(results.filter((result) => !result.stale)).toHaveLength(1)
    expect((await readTranscript(transcriptId)).status).toBe('completed')
  })

  it('treats a second failure as stale', async () => {
    await startTranscription({ recordingId, transcriptId })
    await failTranscription({ recordingId, transcriptId, errorMessage: 'first' })

    const second = await failTranscription({ recordingId, transcriptId, errorMessage: 'second' })

    expect(second.stale).toBe(true)
    expect((await readTranscript(transcriptId)).error_message).toBe('first')
  })
})

const ANALYSIS_RESULT = {
  summary: 'A generated summary.',
  keyDiscussions: [{ topic: 'T', detail: 'D', evidence: [0] }],
  decisions: [{ decision: 'Do it', rationale: 'Because', evidence: [0] }],
  suggestions: [
    { title: 'First task', description: 'Do the first thing', priority: 'high', evidence: [0] },
    { title: 'Second task', priority: 'low', evidence: [0] },
  ],
  provider: 'fixture',
  model: 'fixture-analysis-v1',
  promptVersion: '2026-08-27',
}

dbDescribe('analysis workflow transitions', () => {
  const completeTranscriptFirst = async () => {
    await startTranscription({ recordingId, transcriptId })
    await completeTranscription({ recordingId, transcriptId, result: FIXTURE_RESULT })
  }

  it('refuses to start while the transcript is not completed', async () => {
    const started = await startAnalysis({ analysisRunId, transcriptId, recordingId })

    expect(started.stale).toBe(true)
    expect((await readAnalysisRun(analysisRunId)).status).toBe('queued')
  })

  it('moves the run to processing once the transcript is complete', async () => {
    await completeTranscriptFirst()

    const started = await startAnalysis({ analysisRunId, transcriptId, recordingId })

    expect(started.stale).toBe(false)
    expect(started.transcript.status).toBe('completed')
    expect((await readAnalysisRun(analysisRunId)).status).toBe('processing')
  })

  it('persists the result, provenance, and proposed suggestions in one transaction', async () => {
    await completeTranscriptFirst()
    await startAnalysis({ analysisRunId, transcriptId, recordingId })

    const completed = await completeAnalysis({
      analysisRunId,
      transcriptId,
      recordingId,
      result: ANALYSIS_RESULT,
    })

    expect(completed.stale).toBe(false)

    const row = await query(
      'SELECT status, summary, provider, model, prompt_version, jsonb_array_length(key_discussions) AS discussions, jsonb_array_length(decisions) AS decisions, completed_at FROM analysis_runs WHERE id = $1',
      [analysisRunId]
    )

    expect(row.rows[0]).toMatchObject({
      status: 'ready_for_review',
      summary: 'A generated summary.',
      provider: 'fixture',
      model: 'fixture-analysis-v1',
      prompt_version: '2026-08-27',
      discussions: 1,
      decisions: 1,
    })
    expect(row.rows[0].completed_at).not.toBeNull()

    const suggestions = await listSuggestionsForAnalysisRun(analysisRunId)

    expect(suggestions).toHaveLength(2)
    expect(suggestions.every((item) => item.status === 'proposed')).toBe(true)
    expect(suggestions[0]).toMatchObject({ title: 'First task', priority: 'high', evidence: [0] })
  })

  it('withdraws an accepted suggestion when its action item is deleted', async () => {
    await completeTranscriptFirst()
    await startAnalysis({ analysisRunId, transcriptId, recordingId })
    await completeAnalysis({ analysisRunId, transcriptId, recordingId, result: ANALYSIS_RESULT })

    const [suggestion] = await listSuggestionsForAnalysisRun(analysisRunId)
    const item = await query(
      `INSERT INTO action_items (meeting_id, title, created_by, source)
       VALUES ($1, 'Accepted task', $2, 'ai') RETURNING id`,
      [meetingId, userId]
    )
    await query(
      `UPDATE analysis_action_item_suggestions
          SET status = 'accepted', accepted_action_item_id = $2,
              reviewed_by = $3, reviewed_at = NOW()
        WHERE id = $1`,
      [suggestion.id, item.rows[0].id, userId]
    )

    // 0035 gave the link ON DELETE SET NULL while also requiring an accepted
    // suggestion to have one, so this delete used to fail outright.
    await expect(
      query('DELETE FROM action_items WHERE id = $1', [item.rows[0].id])
    ).resolves.toBeDefined()

    const [withdrawn] = await listSuggestionsForAnalysisRun(analysisRunId)

    expect(withdrawn.status).toBe('withdrawn')
    expect(withdrawn.acceptedActionItemId ?? null).toBeNull()
    // What was proposed and who reviewed it stays on the record.
    expect(withdrawn.title).toBe(suggestion.title)
    expect(withdrawn.reviewedBy ?? null).not.toBeNull()
  })

  it("replaces a previous attempt's suggestions rather than accumulating them", async () => {
    await completeTranscriptFirst()
    await startAnalysis({ analysisRunId, transcriptId, recordingId })
    await completeAnalysis({ analysisRunId, transcriptId, recordingId, result: ANALYSIS_RESULT })

    // A retry re-runs the adapter. completed_at is cleared with the status
    // because 0033 forbids a completion timestamp on a run that is not ready.
    await query(
      "UPDATE analysis_runs SET status = 'processing', completed_at = NULL WHERE id = $1",
      [analysisRunId]
    )
    await completeAnalysis({
      analysisRunId,
      transcriptId,
      recordingId,
      result: { ...ANALYSIS_RESULT, suggestions: [ANALYSIS_RESULT.suggestions[0]] },
    })

    expect(await listSuggestionsForAnalysisRun(analysisRunId)).toHaveLength(1)
  })

  it('treats a duplicate completion as stale', async () => {
    await completeTranscriptFirst()
    await startAnalysis({ analysisRunId, transcriptId, recordingId })
    await completeAnalysis({ analysisRunId, transcriptId, recordingId, result: ANALYSIS_RESULT })

    const duplicate = await completeAnalysis({
      analysisRunId,
      transcriptId,
      recordingId,
      result: { ...ANALYSIS_RESULT, summary: 'second delivery' },
    })

    expect(duplicate.stale).toBe(true)
    expect((await readAnalysisRun(analysisRunId)).status).toBe('ready_for_review')
  })

  it('fails the run and keeps the failure message', async () => {
    await completeTranscriptFirst()
    await startAnalysis({ analysisRunId, transcriptId, recordingId })

    const failed = await failAnalysis({
      analysisRunId,
      transcriptId,
      recordingId,
      errorMessage: 'provider exhausted',
    })

    expect(failed.stale).toBe(false)
    expect(await readAnalysisRun(analysisRunId)).toMatchObject({
      status: 'failed',
      error_message: 'provider exhausted',
    })
  })

  it('leaves the analysis run failed when transcription failed', async () => {
    await startTranscription({ recordingId, transcriptId })
    await failTranscription({ recordingId, transcriptId, errorMessage: 'no audio' })

    // failTranscription already failed the pending run, so the analysis job has
    // nothing to claim even if BullMQ somehow delivered it.
    expect((await readAnalysisRun(analysisRunId)).status).toBe('failed')
    expect((await startAnalysis({ analysisRunId, transcriptId, recordingId })).stale).toBe(true)
  })
})
