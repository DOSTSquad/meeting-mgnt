import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
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
