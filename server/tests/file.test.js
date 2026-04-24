import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, beforeAll, beforeEach, afterAll, it, expect, jest } from '@jest/globals'
import { parse } from 'dotenv'

const serverDir = fileURLToPath(new URL('../', import.meta.url))
const repoRoot = path.resolve(serverDir, '..')
const envPath = existsSync(path.join(repoRoot, '.env'))
  ? path.join(repoRoot, '.env')
  : path.join(repoRoot, '.env.example')
const projectEnv = parse(readFileSync(envPath))
const runDatabaseTests = process.env.RUN_DB_TESTS === 'true' && Boolean(projectEnv.DATABASE_URL)

// --------------------------------------------------------------------------
// Mock minio-client BEFORE any module that imports it is loaded.
// jest.unstable_mockModule hoists automatically when using dynamic import().
// --------------------------------------------------------------------------
const mockPutObject = jest.fn().mockResolvedValue(undefined)
const mockPresignedGetObject = jest.fn().mockResolvedValue('https://minio.local/presigned-url')
const mockRemoveObject = jest.fn().mockResolvedValue(undefined)

jest.unstable_mockModule('../services/minio-client.js', () => ({
  BUCKET_FILES: 'meeting-files',
  BUCKET_AUDIO: 'meeting-audio',
  putObject: mockPutObject,
  presignedGetObject: mockPresignedGetObject,
  presignedPutObject: jest.fn().mockResolvedValue('https://minio.local/presigned-put'),
  statObject: jest.fn().mockResolvedValue({}),
  removeObject: mockRemoveObject,
}))

// Now import everything that transitively pulls in minio-client.
const { runMigrations } = await import('../db/migrate.js')
const { closePool, query } = await import('../db/postgres.js')
const { createUser } = await import('../repositories/user-repository.js')
const { create: createMeetingHandler } = await import('../controllers/meeting-controller.js')
const { add: addParticipantsHandler } = await import('../controllers/participant-controller.js')
const { upload: uploadHandler, list: listHandler, download: downloadHandler, remove: removeHandler } = await import('../controllers/file-controller.js')

const TEST_SECRET = 'test-secret'

// --------------------------------------------------------------------------
// Test helpers (mirror participant.test.js)
// --------------------------------------------------------------------------
const createResponseRecorder = () => ({
  statusCode: 200,
  body: null,
  headers: {},
  ended: false,
  status(code) {
    this.statusCode = code
    return this
  },
  set(name, value) {
    this.headers[name] = value
    return this
  },
  json(payload) {
    this.body = payload
    return this
  },
  end() {
    this.ended = true
    return this
  },
})

const buildRequest = ({
  body = {},
  params = {},
  query: queryParams = {},
  user,
  file,
  baseUrl = '/api',
  reqPath = '/',
} = {}) => ({
  body,
  params,
  query: queryParams,
  user,
  file,
  protocol: 'http',
  baseUrl,
  path: reqPath,
  get(headerName) {
    if (headerName.toLowerCase() === 'host') {
      return 'localhost:3001'
    }
    return undefined
  },
})

const runHandler = async (handler, req) => {
  const res = createResponseRecorder()
  let nextError

  await handler(req, res, (error) => {
    nextError = error
  })

  return { res, nextError }
}

const makeFakeFile = (overrides = {}) => ({
  originalname: 'agenda.pdf',
  mimetype: 'application/pdf',
  size: 1024,
  buffer: Buffer.from('fake-pdf-content'),
  ...overrides,
})

// --------------------------------------------------------------------------
// Test data
// --------------------------------------------------------------------------
let creatorUser
let participantUser
let outsiderUser
let baseMeeting

const baseMeetingBody = (overrides = {}) => ({
  title: 'File Test Meeting',
  description: 'Testing file uploads',
  startsAt: '2026-05-01T09:00:00+10:00',
  endsAt: '2026-05-01T10:00:00+10:00',
  timezoneName: 'Australia/Brisbane',
  location: 'Room B',
  status: 'scheduled',
  department: 'engineering',
  ...overrides,
})

const createMeetingViaController = async (user, overrides = {}) => {
  const req = buildRequest({ body: baseMeetingBody(overrides), user: { id: user.id } })
  const { res, nextError } = await runHandler(createMeetingHandler, req)
  expect(nextError).toBeUndefined()
  expect(res.statusCode).toBe(201)
  return res.body.meeting
}

const addParticipant = async (meetingId, userId, role = 'attendee') => {
  await runHandler(
    addParticipantsHandler,
    buildRequest({
      params: { meetingId },
      body: { userIds: [userId], role },
      user: { id: creatorUser.id },
    })
  )
}

// --------------------------------------------------------------------------
// Lifecycle
// --------------------------------------------------------------------------
beforeAll(async () => {
  process.env.JWT_SECRET = TEST_SECRET
  process.env.JWT_EXPIRES_IN = '1h'
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

  mockPutObject.mockClear()
  mockPresignedGetObject.mockClear()
  mockRemoveObject.mockClear()

  await query('TRUNCATE TABLE meetings RESTART IDENTITY CASCADE')
  await query('TRUNCATE TABLE users RESTART IDENTITY CASCADE')

  creatorUser = await createUser({
    name: 'Creator User',
    email: 'creator@example.com',
    passwordHash: 'fake-hash',
    role: 'staff',
    department: 'engineering',
  })

  participantUser = await createUser({
    name: 'Participant User',
    email: 'participant@example.com',
    passwordHash: 'fake-hash',
    role: 'staff',
    department: 'engineering',
  })

  outsiderUser = await createUser({
    name: 'Outsider User',
    email: 'outsider@example.com',
    passwordHash: 'fake-hash',
    role: 'staff',
    department: 'engineering',
  })

  baseMeeting = await createMeetingViaController(creatorUser)
  await addParticipant(baseMeeting.id, participantUser.id, 'attendee')
})

afterAll(async () => {
  if (!runDatabaseTests) {
    return
  }

  await closePool()
})

const dbDescribe = runDatabaseTests ? describe : describe.skip

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------
dbDescribe('File controller (DB-backed)', () => {
  describe('POST /api/meetings/:meetingId/files (upload)', () => {
    it('creator can upload a file and receives 201 with the file row', async () => {
      const { res, nextError } = await runHandler(
        uploadHandler,
        buildRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
          file: makeFakeFile(),
          body: { description: 'Agenda doc' },
        })
      )

      expect(nextError).toBeUndefined()
      expect(res.statusCode).toBe(201)
      expect(res.body.file).toMatchObject({
        meetingId: baseMeeting.id,
        uploadedBy: creatorUser.id,
        fileName: 'agenda.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        description: 'Agenda doc',
      })
      expect(res.body.file.objectKey).toMatch(
        new RegExp(`^meetings/${baseMeeting.id}/[0-9a-f-]{36}$`)
      )
      expect(mockPutObject).toHaveBeenCalledTimes(1)
    })

    it('participant with organizer role can upload a file', async () => {
      await query(
        `UPDATE meeting_participants SET role = 'organizer' WHERE meeting_id = $1 AND user_id = $2`,
        [baseMeeting.id, participantUser.id]
      )

      const { res, nextError } = await runHandler(
        uploadHandler,
        buildRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: participantUser.id },
          file: makeFakeFile(),
        })
      )

      expect(nextError).toBeUndefined()
      expect(res.statusCode).toBe(201)
    })

    it('returns 400 when no file is provided', async () => {
      const { res, nextError } = await runHandler(
        uploadHandler,
        buildRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
          file: undefined,
        })
      )

      expect(nextError).toBeUndefined()
      expect(res.statusCode).toBe(400)
    })

    it('returns 403 when caller is not creator or organizer (plain attendee)', async () => {
      const { nextError } = await runHandler(
        uploadHandler,
        buildRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: participantUser.id },
          file: makeFakeFile(),
        })
      )

      expect(nextError).toBeDefined()
      expect(nextError.statusCode).toBe(403)
    })

    it('returns 403 when caller is not a participant at all', async () => {
      const { nextError } = await runHandler(
        uploadHandler,
        buildRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: outsiderUser.id },
          file: makeFakeFile(),
        })
      )

      expect(nextError).toBeDefined()
      expect(nextError.statusCode).toBe(403)
    })

    it('returns 404 for an unknown meetingId', async () => {
      const { nextError } = await runHandler(
        uploadHandler,
        buildRequest({
          params: { meetingId: '00000000-0000-0000-0000-000000000000' },
          user: { id: creatorUser.id },
          file: makeFakeFile(),
        })
      )

      expect(nextError).toBeDefined()
      expect(nextError.statusCode).toBe(404)
    })
  })

  describe('GET /api/meetings/:meetingId/files (list)', () => {
    it('creator can list files', async () => {
      // Upload one file first
      await runHandler(
        uploadHandler,
        buildRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
          file: makeFakeFile(),
        })
      )

      const { res, nextError } = await runHandler(
        listHandler,
        buildRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
        })
      )

      expect(nextError).toBeUndefined()
      expect(res.body.files).toHaveLength(1)
      expect(res.body.files[0].fileName).toBe('agenda.pdf')
    })

    it('participant (attendee) can list files', async () => {
      const { res, nextError } = await runHandler(
        listHandler,
        buildRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: participantUser.id },
        })
      )

      expect(nextError).toBeUndefined()
      expect(Array.isArray(res.body.files)).toBe(true)
    })

    it('returns empty array when no files exist', async () => {
      const { res, nextError } = await runHandler(
        listHandler,
        buildRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
        })
      )

      expect(nextError).toBeUndefined()
      expect(res.body.files).toEqual([])
    })

    it('returns 403 when caller is not a participant', async () => {
      const { nextError } = await runHandler(
        listHandler,
        buildRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: outsiderUser.id },
        })
      )

      expect(nextError).toBeDefined()
      expect(nextError.statusCode).toBe(403)
    })
  })

  describe('GET /api/files/:id/download', () => {
    let uploadedFile

    beforeEach(async () => {
      if (!runDatabaseTests) return

      const { res } = await runHandler(
        uploadHandler,
        buildRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
          file: makeFakeFile(),
        })
      )
      uploadedFile = res.body.file
    })

    it('returns { url, expiresAt } for the meeting creator', async () => {
      const { res, nextError } = await runHandler(
        downloadHandler,
        buildRequest({
          params: { id: uploadedFile.id },
          user: { id: creatorUser.id },
        })
      )

      expect(nextError).toBeUndefined()
      expect(res.body.url).toBe('https://minio.local/presigned-url')
      expect(res.body.expiresAt).toBeDefined()
      expect(mockPresignedGetObject).toHaveBeenCalledTimes(1)
    })

    it('participant (attendee) can get a download URL', async () => {
      const { res, nextError } = await runHandler(
        downloadHandler,
        buildRequest({
          params: { id: uploadedFile.id },
          user: { id: participantUser.id },
        })
      )

      expect(nextError).toBeUndefined()
      expect(res.body.url).toBeDefined()
    })

    it('returns 403 when caller is not a participant', async () => {
      const { nextError } = await runHandler(
        downloadHandler,
        buildRequest({
          params: { id: uploadedFile.id },
          user: { id: outsiderUser.id },
        })
      )

      expect(nextError).toBeDefined()
      expect(nextError.statusCode).toBe(403)
    })

    it('returns 404 for an unknown file id', async () => {
      const { nextError } = await runHandler(
        downloadHandler,
        buildRequest({
          params: { id: '00000000-0000-0000-0000-000000000000' },
          user: { id: creatorUser.id },
        })
      )

      expect(nextError).toBeDefined()
      expect(nextError.statusCode).toBe(404)
    })
  })

  describe('DELETE /api/files/:id', () => {
    let uploadedFile

    beforeEach(async () => {
      if (!runDatabaseTests) return

      const { res } = await runHandler(
        uploadHandler,
        buildRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
          file: makeFakeFile(),
        })
      )
      uploadedFile = res.body.file
    })

    it('creator can delete a file — returns 204 and removes from MinIO', async () => {
      const { res, nextError } = await runHandler(
        removeHandler,
        buildRequest({
          params: { id: uploadedFile.id },
          user: { id: creatorUser.id },
        })
      )

      expect(nextError).toBeUndefined()
      expect(res.statusCode).toBe(204)
      expect(res.ended).toBe(true)
      expect(mockRemoveObject).toHaveBeenCalledTimes(1)
    })

    it('file is gone after delete — list returns empty', async () => {
      await runHandler(
        removeHandler,
        buildRequest({
          params: { id: uploadedFile.id },
          user: { id: creatorUser.id },
        })
      )

      const listRes = await runHandler(
        listHandler,
        buildRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
        })
      )

      expect(listRes.res.body.files).toEqual([])
    })

    it('download returns 404 after delete', async () => {
      await runHandler(
        removeHandler,
        buildRequest({
          params: { id: uploadedFile.id },
          user: { id: creatorUser.id },
        })
      )

      const { nextError } = await runHandler(
        downloadHandler,
        buildRequest({
          params: { id: uploadedFile.id },
          user: { id: creatorUser.id },
        })
      )

      expect(nextError).toBeDefined()
      expect(nextError.statusCode).toBe(404)
    })

    it('organizer participant can delete a file', async () => {
      await addParticipant(baseMeeting.id, outsiderUser.id, 'organizer')

      const { res, nextError } = await runHandler(
        removeHandler,
        buildRequest({
          params: { id: uploadedFile.id },
          user: { id: outsiderUser.id },
        })
      )

      expect(nextError).toBeUndefined()
      expect(res.statusCode).toBe(204)
    })

    it('plain attendee cannot delete a file — returns 403', async () => {
      const { nextError } = await runHandler(
        removeHandler,
        buildRequest({
          params: { id: uploadedFile.id },
          user: { id: participantUser.id },
        })
      )

      expect(nextError).toBeDefined()
      expect(nextError.statusCode).toBe(403)
    })

    it('outsider cannot delete a file — returns 403', async () => {
      const { nextError } = await runHandler(
        removeHandler,
        buildRequest({
          params: { id: uploadedFile.id },
          user: { id: outsiderUser.id },
        })
      )

      expect(nextError).toBeDefined()
      expect(nextError.statusCode).toBe(403)
    })

    it('returns 404 when deleting an unknown file id', async () => {
      const { nextError } = await runHandler(
        removeHandler,
        buildRequest({
          params: { id: '00000000-0000-0000-0000-000000000000' },
          user: { id: creatorUser.id },
        })
      )

      expect(nextError).toBeDefined()
      expect(nextError.statusCode).toBe(404)
    })
  })
})
