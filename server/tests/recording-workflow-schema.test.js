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

const dbDescribe = runDatabaseTests ? describe : describe.skip

let userId
let meetingId
let recordingId
let transcriptId

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

  await query('TRUNCATE TABLE meetings RESTART IDENTITY CASCADE')
  await query('TRUNCATE TABLE users RESTART IDENTITY CASCADE')

  await query(
    `
      INSERT INTO users (id, name, email, password_hash, role, department)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      userId,
      'Workflow Schema User',
      `workflow-schema-${userId}@example.com`,
      'hash',
      'staff',
      'ops',
    ]
  )
  await query(
    `
      INSERT INTO meetings (id, title, starts_at, ends_at, timezone_name, owner_id, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $6)
    `,
    [
      meetingId,
      'Workflow Schema Meeting',
      '2026-05-01T09:00:00Z',
      '2026-05-01T10:00:00Z',
      'UTC',
      userId,
    ]
  )
  await query(
    `
      INSERT INTO meeting_recordings (
        id,
        meeting_id,
        uploaded_by,
        file_name,
        mime_type,
        size_bytes,
        bucket_name,
        object_key
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      recordingId,
      meetingId,
      userId,
      'workflow-schema.mp3',
      'audio/mpeg',
      1024,
      'meeting-audio',
      `meetings/${meetingId}/recordings/${recordingId}`,
    ]
  )
  await query(
    `
      INSERT INTO meeting_transcripts (id, meeting_id, recording_id, created_by, status)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [transcriptId, meetingId, recordingId, userId, 'processing']
  )
})

afterAll(async () => {
  if (!runDatabaseTests) {
    return
  }

  await closePool()
})

const createAnalysisRun = (status, completedAt = null, id = randomUUID()) =>
  query(
    `
      INSERT INTO analysis_runs (
        id,
        meeting_id,
        recording_id,
        transcript_id,
        created_by,
        status,
        completed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
    [id, meetingId, recordingId, transcriptId, userId, status, completedAt]
  )

dbDescribe('recording generation workflow schema', () => {
  it('uses analysis-run statuses aligned with the review workflow', async () => {
    await expect(createAnalysisRun('processing')).resolves.toBeDefined()

    await query('DELETE FROM analysis_runs')
    await expect(
      createAnalysisRun('ready_for_review', new Date('2026-05-01T10:00:00Z'))
    ).resolves.toBeDefined()

    await expect(createAnalysisRun('running')).rejects.toThrow(/analysis_runs/)
    await expect(createAnalysisRun('completed')).rejects.toThrow(/analysis_runs/)
  })

  it('allows only one queued or processing analysis per active recording or transcript', async () => {
    await createAnalysisRun('queued')

    await expect(createAnalysisRun('processing')).rejects.toThrow(/analysis_runs/)
  })

  it('stores proposed action-item suggestions for later accept or reject review', async () => {
    const analysisRun = await createAnalysisRun(
      'ready_for_review',
      new Date('2026-05-01T10:00:00Z')
    )

    const result = await query(
      `
        INSERT INTO analysis_action_item_suggestions (
          analysis_run_id,
          meeting_id,
          title
        )
        VALUES ($1, $2, $3)
        RETURNING status
      `,
      [analysisRun.rows[0].id, meetingId, 'Follow up with owners']
    )

    expect(result.rows[0].status).toBe('proposed')

    await expect(
      query(
        `
          INSERT INTO analysis_action_item_suggestions (
            analysis_run_id,
            meeting_id,
            title,
            status
          )
          VALUES ($1, $2, $3, $4)
        `,
        [analysisRun.rows[0].id, meetingId, 'Invalid pending item', 'pending']
      )
    ).rejects.toThrow(/analysis_action_item_suggestions/)
  })
})
