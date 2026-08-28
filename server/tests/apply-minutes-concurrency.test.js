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
const { applyGeneratedMinuteContent, findMinuteByMeetingId } =
  await import('../repositories/minute-repository.js')

const dbDescribe = runDatabaseTests ? describe : describe.skip

let userId
let meetingId
let minuteId

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

  await query('TRUNCATE TABLE meetings RESTART IDENTITY CASCADE')
  await query('TRUNCATE TABLE users RESTART IDENTITY CASCADE')
  await query(
    `INSERT INTO users (id, name, email, password_hash, role, department)
     VALUES ($1, 'Apply User', $2, 'x', 'staff', 'ops')`,
    [userId, `apply-${userId}@example.invalid`]
  )
  await query(
    `INSERT INTO meetings (id, title, starts_at, ends_at, timezone_name, owner_id, created_by)
     VALUES ($1, 'Apply Meeting', NOW(), NOW() + INTERVAL '1 hour', 'UTC', $2, $2)`,
    [meetingId, userId]
  )

  const minute = await query(
    `INSERT INTO minutes (meeting_id, prepared_by, content) VALUES ($1, $2, 'Human draft')
     RETURNING id`,
    [meetingId, userId]
  )
  minuteId = minute.rows[0].id
})

afterAll(async () => {
  if (!runDatabaseTests) {
    return
  }

  await closePool()
})

const applyAt = (expectedVersion, content) =>
  applyGeneratedMinuteContent({
    meetingId,
    minuteId,
    expectedVersion,
    content,
    keyDiscussions: 'D',
    decisions: 'X',
    generatedFromTranscriptId: null,
  })

dbDescribe('apply-minutes optimistic concurrency', () => {
  it('applies against the expected version and bumps it', async () => {
    const applied = await applyAt(1, 'Generated content')

    expect(applied).toMatchObject({ version: 2, content: 'Generated content' })
  })

  it('refuses a stale version without touching the row', async () => {
    // A human edit lands first, moving the version past what the caller read.
    await query('UPDATE minutes SET content = $2, version = version + 1 WHERE id = $1', [
      minuteId,
      'Edited by a human while generation ran',
    ])

    expect(await applyAt(1, 'Generated content')).toBeNull()

    const current = await findMinuteByMeetingId(meetingId)

    expect(current.content).toBe('Edited by a human while generation ran')
    expect(current.version).toBe(2)
  })

  it('lets exactly one of two concurrent applies win', async () => {
    const [first, second] = await Promise.all([
      applyAt(1, 'From tab one'),
      applyAt(1, 'From tab two'),
    ])

    const winners = [first, second].filter(Boolean)

    expect(winners).toHaveLength(1)
    expect((await findMinuteByMeetingId(meetingId)).version).toBe(2)
  })

  it('is not idempotent by accident: replaying the same version fails', async () => {
    await applyAt(1, 'Generated content')

    // A duplicate request carrying the version the client originally read must
    // not apply a second time.
    expect(await applyAt(1, 'Generated content')).toBeNull()
    expect((await findMinuteByMeetingId(meetingId)).version).toBe(2)
  })

  it('never changes status, approval, or publication', async () => {
    await applyAt(1, 'Generated content')

    const row = await query(
      'SELECT status, approved_by, approved_at, published_at FROM minutes WHERE id = $1',
      [minuteId]
    )

    expect(row.rows[0]).toEqual({
      status: 'draft',
      approved_by: null,
      approved_at: null,
      published_at: null,
    })
  })
})
