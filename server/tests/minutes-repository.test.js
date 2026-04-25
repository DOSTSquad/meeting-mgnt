import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, beforeAll, beforeEach, afterAll, it, expect } from '@jest/globals'
import { parse } from 'dotenv'

import { runMigrations } from '../db/migrate.js'
import { closePool, query } from '../db/postgres.js'
import { createUser } from '../repositories/user-repository.js'
import { createMeeting } from '../repositories/meeting-repository.js'
import {
  countVersions,
  findById,
  insertWithFirstVersion,
  updateBodyWithVersion,
} from '../repositories/minutes-repository.js'

const serverDir = fileURLToPath(new URL('../', import.meta.url))
const repoRoot = path.resolve(serverDir, '..')
const envPath = existsSync(path.join(repoRoot, '.env'))
  ? path.join(repoRoot, '.env')
  : path.join(repoRoot, '.env.example')
const projectEnv = parse(readFileSync(envPath))
const runDatabaseTests = process.env.RUN_DB_TESTS === 'true' && Boolean(projectEnv.DATABASE_URL)

let testUser

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

  testUser = await createUser({
    name: 'Repo Tester',
    email: 'repo-tester@example.com',
    passwordHash: 'fake-hash-not-used',
    role: 'staff',
    department: 'engineering',
  })
})

afterAll(async () => {
  if (!runDatabaseTests) {
    return
  }

  await closePool()
})

const createBareMeeting = async (overrides = {}) => {
  return createMeeting({
    title: 'Repo test meeting',
    description: null,
    startsAt: new Date('2026-05-01T09:00:00Z'),
    endsAt: new Date('2026-05-01T10:00:00Z'),
    timezoneName: 'UTC',
    location: null,
    status: 'scheduled',
    department: null,
    createdBy: testUser.id,
    ...overrides,
  })
}

const dbDescribe = runDatabaseTests ? describe : describe.skip

dbDescribe('minutes-repository (DB-backed)', () => {
  it('insertWithFirstVersion creates a minutes row plus exactly one v1 version', async () => {
    const meeting = await createBareMeeting()

    const minutes = await insertWithFirstVersion({
      meetingId: meeting.id,
      body: '# initial',
      createdBy: testUser.id,
    })

    expect(minutes.id).toEqual(expect.any(String))
    expect(minutes.body).toBe('# initial')
    expect(minutes.createdBy).toBe(testUser.id)
    expect(minutes.updatedBy).toBe(testUser.id)

    const versionsRes = await query(
      'SELECT version, body, edited_by FROM minutes_versions WHERE minutes_id = $1 ORDER BY version ASC',
      [minutes.id]
    )

    expect(versionsRes.rows).toHaveLength(1)
    expect(versionsRes.rows[0].version).toBe(1)
    expect(versionsRes.rows[0].body).toBe('# initial')
    expect(versionsRes.rows[0].edited_by).toBe(testUser.id)
  })

  it('updateBodyWithVersion increments the version monotonically per minutes row', async () => {
    const meeting = await createBareMeeting()

    const minutes = await insertWithFirstVersion({
      meetingId: meeting.id,
      body: '# v1',
      createdBy: testUser.id,
    })

    await updateBodyWithVersion(minutes.id, '# v2', testUser.id)
    await updateBodyWithVersion(minutes.id, '# v3', testUser.id)
    await updateBodyWithVersion(minutes.id, '# v4', testUser.id)

    const versionsRes = await query(
      'SELECT version FROM minutes_versions WHERE minutes_id = $1 ORDER BY version ASC',
      [minutes.id]
    )

    expect(versionsRes.rows.map((r) => r.version)).toEqual([1, 2, 3, 4])
    expect(await countVersions(minutes.id)).toBe(4)
  })

  it('updateBodyWithVersion returns null for an unknown id', async () => {
    const unknownId = '00000000-0000-0000-0000-000000000088'

    const result = await updateBodyWithVersion(unknownId, '# nope', testUser.id)

    expect(result).toBeNull()
  })

  it('rolls back the body update if inserting the version row fails (atomicity)', async () => {
    const meeting = await createBareMeeting()

    const minutes = await insertWithFirstVersion({
      meetingId: meeting.id,
      body: '# stable',
      createdBy: testUser.id,
    })

    const fakeUserId = '00000000-0000-0000-0000-0000000000aa'

    await expect(
      updateBodyWithVersion(minutes.id, '# attempted', fakeUserId)
    ).rejects.toBeDefined()

    const reread = await findById(minutes.id)
    expect(reread.body).toBe('# stable')

    expect(await countVersions(minutes.id)).toBe(1)
  })

  it('tracks version numbering independently across multiple minutes rows', async () => {
    const meetingA = await createBareMeeting({ title: 'A' })
    const meetingB = await createBareMeeting({ title: 'B' })

    const minutesA = await insertWithFirstVersion({
      meetingId: meetingA.id,
      body: '# A1',
      createdBy: testUser.id,
    })
    const minutesB = await insertWithFirstVersion({
      meetingId: meetingB.id,
      body: '# B1',
      createdBy: testUser.id,
    })

    await updateBodyWithVersion(minutesA.id, '# A2', testUser.id)
    await updateBodyWithVersion(minutesA.id, '# A3', testUser.id)
    await updateBodyWithVersion(minutesB.id, '# B2', testUser.id)

    const versionsA = await query(
      'SELECT version FROM minutes_versions WHERE minutes_id = $1 ORDER BY version ASC',
      [minutesA.id]
    )
    const versionsB = await query(
      'SELECT version FROM minutes_versions WHERE minutes_id = $1 ORDER BY version ASC',
      [minutesB.id]
    )

    expect(versionsA.rows.map((r) => r.version)).toEqual([1, 2, 3])
    expect(versionsB.rows.map((r) => r.version)).toEqual([1, 2])
  })
})
