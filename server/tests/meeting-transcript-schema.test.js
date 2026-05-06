import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, beforeAll, beforeEach, afterAll, it, expect } from '@jest/globals'
import { parse } from 'dotenv'

import { runMigrations } from '../db/migrate.js'
import { closePool, query } from '../db/postgres.js'
import { createUser } from '../repositories/user-repository.js'

const serverDir = fileURLToPath(new URL('../', import.meta.url))
const repoRoot = path.resolve(serverDir, '..')
const envPath = existsSync(path.join(repoRoot, '.env'))
  ? path.join(repoRoot, '.env')
  : path.join(repoRoot, '.env.example')
const projectEnv = parse(readFileSync(envPath))
const runDatabaseTests = process.env.RUN_DB_TESTS === 'true' && Boolean(projectEnv.DATABASE_URL)

let creatorUser
let baseMeeting
let recording

beforeAll(async () => {
  process.env.DATABASE_URL = projectEnv.DATABASE_URL

  if (!runDatabaseTests) {
    return
  }

  await runMigrations()
})

beforeEach(async () => {
  if (!runDatabaseTests) {
    return
  }

  await query('TRUNCATE TABLE meetings RESTART IDENTITY CASCADE')
  await query('TRUNCATE TABLE users RESTART IDENTITY CASCADE')

  creatorUser = await createUser({
    name: 'Transcript Creator',
    email: 'transcript.creator@example.com',
    passwordHash: 'fake-hash-not-used',
    role: 'staff',
    department: 'engineering',
  })

  const meetingResult = await query(
    `
      INSERT INTO meetings (
        title,
        starts_at,
        ends_at,
        timezone_name,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [
      'Transcript Schema Meeting',
      '2026-05-01T09:00:00+10:00',
      '2026-05-01T10:00:00+10:00',
      'Australia/Brisbane',
      creatorUser.id,
    ]
  )
  baseMeeting = meetingResult.rows[0]

  const recordingResult = await query(
    `
      INSERT INTO meeting_recordings (
        meeting_id,
        uploaded_by,
        file_name,
        mime_type,
        size_bytes,
        bucket_name,
        object_key
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
    [
      baseMeeting.id,
      creatorUser.id,
      'recording.mp3',
      'audio/mpeg',
      2048,
      'meeting-audio',
      `meetings/${baseMeeting.id}/recordings/recording.mp3`,
    ]
  )
  recording = recordingResult.rows[0]
})

afterAll(async () => {
  if (!runDatabaseTests) {
    return
  }

  await closePool()
})

const dbDescribe = runDatabaseTests ? describe : describe.skip

const createTranscript = (overrides = {}) =>
  query(
    `
      INSERT INTO meeting_transcripts (
        meeting_id,
        recording_id,
        created_by,
        status,
        transcript_text,
        segments,
        duration_seconds,
        error_message,
        completed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
      RETURNING *
    `,
    [
      overrides.meetingId ?? baseMeeting.id,
      overrides.recordingId ?? recording.id,
      overrides.createdBy ?? creatorUser.id,
      overrides.status ?? 'completed',
      overrides.transcriptText ?? 'Welcome to the meeting.',
      JSON.stringify(overrides.segments ?? []),
      overrides.durationSeconds ?? 120,
      overrides.errorMessage ?? null,
      overrides.completedAt ?? new Date('2026-05-01T00:05:00.000Z'),
    ]
  )

dbDescribe('meeting_transcripts schema', () => {
  it('stores lean transcript metadata linked to a recording', async () => {
    const result = await createTranscript()

    expect(result.rows[0]).toMatchObject({
      meeting_id: baseMeeting.id,
      recording_id: recording.id,
      created_by: creatorUser.id,
      status: 'completed',
      transcript_text: 'Welcome to the meeting.',
      duration_seconds: 120,
    })
    expect(result.rows[0].segments).toEqual([])
  })

  it('allows multiple transcript attempts for the same recording', async () => {
    await createTranscript()
    const result = await createTranscript({
      transcriptText: 'Retry transcript.',
      completedAt: new Date('2026-05-01T00:07:00.000Z'),
    })

    expect(result.rows[0].meeting_id).toBe(baseMeeting.id)
    expect(result.rows[0].recording_id).toBe(recording.id)
  })

  it('rejects invalid status, segment shape, and duration values', async () => {
    await expect(createTranscript({ status: 'queued' })).rejects.toThrow(/meeting_transcripts/)

    await expect(createTranscript({ segments: { text: 'not an array' } })).rejects.toThrow(
      /meeting_transcripts_segments_check/
    )

    await expect(createTranscript({ durationSeconds: 0 })).rejects.toThrow(
      /meeting_transcripts_duration_seconds_check/
    )
  })

  it('cascades transcripts when a meeting is deleted', async () => {
    await createTranscript()

    await query('DELETE FROM meetings WHERE id = $1', [baseMeeting.id])

    const result = await query('SELECT id FROM meeting_transcripts WHERE meeting_id = $1', [
      baseMeeting.id,
    ])
    expect(result.rows).toHaveLength(0)
  })

  it('keeps transcripts when the recording is deleted', async () => {
    const result = await createTranscript()

    await query('DELETE FROM meeting_recordings WHERE id = $1', [recording.id])

    const transcriptResult = await query(
      'SELECT recording_id FROM meeting_transcripts WHERE id = $1',
      [result.rows[0].id]
    )
    expect(transcriptResult.rows[0].recording_id).toBeNull()
  })
})
