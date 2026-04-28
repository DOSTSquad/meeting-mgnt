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
let sourceFile

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

  const fileResult = await query(
    `
      INSERT INTO meeting_files (
        meeting_id,
        uploaded_by,
        file_name,
        mime_type,
        size_bytes,
        object_key
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
    [
      baseMeeting.id,
      creatorUser.id,
      'recording.mp3',
      'audio/mpeg',
      2048,
      `meetings/${baseMeeting.id}/recording.mp3`,
    ]
  )
  sourceFile = fileResult.rows[0]
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
        source_file_id,
        created_by,
        status,
        language_code,
        provider,
        model,
        transcript_text,
        segments,
        confidence,
        duration_seconds,
        completed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)
      RETURNING *
    `,
    [
      overrides.meetingId ?? baseMeeting.id,
      overrides.sourceFileId ?? sourceFile.id,
      overrides.createdBy ?? creatorUser.id,
      overrides.status ?? 'completed',
      overrides.languageCode ?? 'en-AU',
      overrides.provider ?? 'openai',
      overrides.model ?? 'gpt-4o-transcribe',
      overrides.transcriptText ?? 'Welcome to the meeting.',
      JSON.stringify(overrides.segments ?? []),
      overrides.confidence ?? 0.92,
      overrides.durationSeconds ?? 120,
      overrides.completedAt ?? new Date('2026-05-01T00:05:00.000Z'),
    ]
  )

dbDescribe('meeting_transcripts schema', () => {
  it('stores transcript metadata and defaults segments to an array', async () => {
    const result = await createTranscript()

    expect(result.rows[0]).toMatchObject({
      meeting_id: baseMeeting.id,
      source_file_id: sourceFile.id,
      created_by: creatorUser.id,
      status: 'completed',
      language_code: 'en-AU',
      provider: 'openai',
      model: 'gpt-4o-transcribe',
      transcript_text: 'Welcome to the meeting.',
      duration_seconds: 120,
    })
    expect(Number(result.rows[0].confidence)).toBe(0.92)
    expect(result.rows[0].segments).toEqual([])
  })

  it('allows one transcript per source file', async () => {
    await createTranscript()

    await expect(
      createTranscript({
        transcriptText: 'Duplicate source file transcript.',
        completedAt: new Date('2026-05-01T00:06:00.000Z'),
      })
    ).rejects.toThrow(/meeting_transcripts_source_file_unique_idx/)
  })

  it('allows multiple transcripts for a meeting when each source file is different or absent', async () => {
    await createTranscript()

    const result = await createTranscript({
      sourceFileId: null,
      transcriptText: 'Live note transcript.',
      completedAt: new Date('2026-05-01T00:07:00.000Z'),
    })

    expect(result.rows[0].meeting_id).toBe(baseMeeting.id)
    expect(result.rows[0].source_file_id).toBeNull()
  })

  it('rejects invalid status, segment shape, confidence, and duration values', async () => {
    await expect(createTranscript({ status: 'queued' })).rejects.toThrow(
      /meeting_transcripts_status_check/
    )

    await expect(createTranscript({ segments: { text: 'not an array' } })).rejects.toThrow(
      /meeting_transcripts_segments_check/
    )

    await expect(createTranscript({ confidence: 1.5 })).rejects.toThrow(
      /meeting_transcripts_confidence_check/
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

  it('keeps transcripts when the source file is deleted', async () => {
    const result = await createTranscript()

    await query('DELETE FROM meeting_files WHERE id = $1', [sourceFile.id])

    const transcriptResult = await query('SELECT source_file_id FROM meeting_transcripts WHERE id = $1', [
      result.rows[0].id,
    ])
    expect(transcriptResult.rows[0].source_file_id).toBeNull()
  })
})
