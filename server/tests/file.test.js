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
const mockGetObject = jest.fn().mockResolvedValue({
  pipe: jest.fn(),
})
const mockPublishAiJob = jest.fn().mockResolvedValue({ messageId: '1-0' })

jest.unstable_mockModule('../services/minio-client.js', () => ({
  BUCKET_FILES: 'meeting-files',
  BUCKET_AUDIO: 'meeting-audio',
  putObject: mockPutObject,
  presignedGetObject: mockPresignedGetObject,
  presignedPutObject: jest.fn().mockResolvedValue('https://minio.local/presigned-put'),
  statObject: jest.fn().mockResolvedValue({}),
  getObject: mockGetObject,
  removeObject: mockRemoveObject,
}))

jest.unstable_mockModule('../services/ai-streams.js', () => ({
  ANALYSIS_STREAM: 'ai.analysis.jobs',
  TRANSCRIPTION_STREAM: 'ai.transcription.jobs',
  publishAiJob: mockPublishAiJob,
}))

// Now import everything that transitively pulls in minio-client.
const { runMigrations } = await import('../db/migrate.js')
const { closePool, query } = await import('../db/postgres.js')
const { createUser } = await import('../repositories/user-repository.js')
const { create: createMeetingHandler } = await import('../controllers/meeting-controller.js')
const { add: addParticipantsHandler } = await import('../controllers/participant-controller.js')
const {
  upload: uploadHandler,
  list: listHandler,
  download: downloadHandler,
  remove: removeHandler,
} = await import('../controllers/file-controller.js')
const {
  generateForMeeting: generateRecordingHandler,
  getForMeeting: getRecordingHandler,
  removeForMeeting: removeRecordingHandler,
  uploadForMeeting: uploadRecordingHandler,
} = await import('../controllers/recording-controller.js')
const { dispatchPendingWorkflowOutbox } = await import('../services/workflow-outbox-service.js')

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

// The route validator rejects a recording upload without consent before the controller runs, so
// every request that reaches the controller carries it.
const buildRecordingUploadRequest = ({ body = {}, ...rest } = {}) =>
  buildRequest({ ...rest, body: { consentConfirmed: 'true', ...body } })

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
  mockGetObject.mockClear()
  mockPublishAiJob.mockClear()
  mockPublishAiJob.mockResolvedValue({ messageId: '1-0' })
  process.env.AI_PIPELINE_ENABLED = 'false'

  await query('TRUNCATE TABLE workflow_outbox RESTART IDENTITY')
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
        bucketName: 'meeting-files',
        description: 'Agenda doc',
      })
      expect(res.body.file.objectKey).toMatch(
        new RegExp(`^meetings/${baseMeeting.id}/files/[0-9a-f-]{36}$`)
      )
      expect(mockPutObject).toHaveBeenCalledTimes(1)
      expect(mockPutObject).toHaveBeenCalledWith(
        'meeting-files',
        expect.stringMatching(new RegExp(`^meetings/${baseMeeting.id}/files/[0-9a-f-]{36}$`)),
        expect.any(Buffer),
        1024,
        expect.objectContaining({ 'Content-Type': 'application/pdf' })
      )
    })

    it('stores audio uploads in the audio bucket and prefix', async () => {
      const { res, nextError } = await runHandler(
        uploadHandler,
        buildRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
          file: makeFakeFile({
            originalname: 'recording.mp3',
            mimetype: 'audio/mpeg',
          }),
          body: { storageKind: 'audio' },
        })
      )

      expect(nextError).toBeUndefined()
      expect(res.statusCode).toBe(201)
      expect(res.body.file).toMatchObject({
        bucketName: 'meeting-audio',
        fileName: 'recording.mp3',
        mimeType: 'audio/mpeg',
      })
      expect(res.body.file.objectKey).toMatch(
        new RegExp(`^meetings/${baseMeeting.id}/audio/[0-9a-f-]{36}$`)
      )
      expect(mockPutObject).toHaveBeenCalledWith(
        'meeting-audio',
        expect.stringMatching(new RegExp(`^meetings/${baseMeeting.id}/audio/[0-9a-f-]{36}$`)),
        expect.any(Buffer),
        1024,
        expect.objectContaining({ 'Content-Type': 'audio/mpeg' })
      )
    })

    it('plain attendee participant can upload a file', async () => {
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

  describe('Meeting recording controller scaffold', () => {
    it('uploads one active recording for minutes workflow', async () => {
      const { res, nextError } = await runHandler(
        uploadRecordingHandler,
        buildRecordingUploadRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
          file: makeFakeFile({
            originalname: 'meeting-recording.mp3',
            mimetype: 'audio/mpeg',
          }),
        })
      )

      expect(nextError).toBeUndefined()
      expect(res.statusCode).toBe(201)
      expect(res.body.recording).toMatchObject({
        meetingId: baseMeeting.id,
        uploadedBy: creatorUser.id,
        fileName: 'meeting-recording.mp3',
        mimeType: 'audio/mpeg',
        bucketName: 'meeting-audio',
        status: 'uploaded',
      })
      expect(res.body.recording.objectKey).toMatch(
        new RegExp(`^meetings/${baseMeeting.id}/recordings/[0-9a-f-]{36}$`)
      )
      expect(mockPutObject).toHaveBeenCalledWith(
        'meeting-audio',
        expect.stringMatching(new RegExp(`^meetings/${baseMeeting.id}/recordings/[0-9a-f-]{36}$`)),
        expect.any(Buffer),
        1024,
        expect.objectContaining({ 'Content-Type': 'audio/mpeg' })
      )
      expect(res.body.transcript).toBeNull()
      expect(res.body.analysisRun).toBeNull()
      expect(mockPublishAiJob).not.toHaveBeenCalled()
    })

    it('rejects a recording upload without consent confirmation', async () => {
      const { nextError } = await runHandler(
        uploadRecordingHandler,
        buildRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
          file: makeFakeFile({ originalname: 'no-consent.mp3', mimetype: 'audio/mpeg' }),
        })
      )

      expect(nextError.statusCode).toBe(400)
      expect(mockPutObject).not.toHaveBeenCalled()
    })

    it('records who confirmed consent and when', async () => {
      const { res } = await runHandler(
        uploadRecordingHandler,
        buildRecordingUploadRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
          file: makeFakeFile({ originalname: 'consented.mp3', mimetype: 'audio/mpeg' }),
        })
      )

      expect(res.body.recording.consentConfirmedAt).toEqual(expect.any(String))

      const { rows } = await query(
        'SELECT consent_confirmed_by FROM meeting_recordings WHERE id = $1',
        [res.body.recording.id]
      )
      expect(rows[0].consent_confirmed_by).toBe(creatorUser.id)
    })

    it('creates durable workflow rows when generation is requested', async () => {
      process.env.AI_PIPELINE_ENABLED = 'true'

      const uploaded = await runHandler(
        uploadRecordingHandler,
        buildRecordingUploadRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
          file: makeFakeFile({
            originalname: 'pipeline-recording.mp3',
            mimetype: 'audio/mpeg',
          }),
        })
      )

      expect(uploaded.nextError).toBeUndefined()
      expect(uploaded.res.statusCode).toBe(201)
      expect(uploaded.res.body.transcript).toBeNull()
      expect(uploaded.res.body.analysisRun).toBeNull()

      const { res, nextError } = await runHandler(
        generateRecordingHandler,
        buildRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
        })
      )

      expect(uploaded.res.body.recording.status).toBe('uploaded')
      expect(nextError).toBeUndefined()
      expect(res.statusCode).toBe(202)
      expect(res.body.recording.status).toBe('uploaded')
      expect(res.body.transcript).toMatchObject({
        meetingId: baseMeeting.id,
        recordingId: uploaded.res.body.recording.id,
        status: 'processing',
      })
      expect(res.body.analysisRun).toMatchObject({
        meetingId: baseMeeting.id,
        recordingId: uploaded.res.body.recording.id,
        transcriptId: res.body.transcript.id,
        status: 'queued',
      })
      expect(mockPublishAiJob).not.toHaveBeenCalled()

      const outboxResult = await query(
        `
          SELECT event_type, aggregate_type, aggregate_id, payload, status
          FROM workflow_outbox
          WHERE aggregate_id = $1
        `,
        [res.body.analysisRun.id]
      )
      expect(outboxResult.rows).toHaveLength(1)
      expect(outboxResult.rows[0]).toMatchObject({
        event_type: 'recording.generation_requested',
        aggregate_type: 'analysis_run',
        aggregate_id: res.body.analysisRun.id,
        status: 'pending',
      })
      expect(outboxResult.rows[0].payload).toEqual({
        recordingId: uploaded.res.body.recording.id,
        transcriptId: res.body.transcript.id,
        analysisRunId: res.body.analysisRun.id,
        bucketName: 'meeting-audio',
        objectKey: res.body.recording.objectKey,
        fileName: 'pipeline-recording.mp3',
        mimeType: 'audio/mpeg',
      })
    })

    it('keeps workflow intent pending when Redis is unavailable during generation', async () => {
      process.env.AI_PIPELINE_ENABLED = 'true'
      const originalRedisUrl = process.env.REDIS_URL
      process.env.REDIS_URL = 'redis://127.0.0.1:1'

      const uploaded = await runHandler(
        uploadRecordingHandler,
        buildRecordingUploadRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
          file: makeFakeFile({
            originalname: 'redis-down.mp3',
            mimetype: 'audio/mpeg',
          }),
        })
      )

      const { res, nextError } = await runHandler(
        generateRecordingHandler,
        buildRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
        })
      )

      expect(uploaded.res.statusCode).toBe(201)
      expect(nextError).toBeUndefined()
      expect(res.statusCode).toBe(202)
      expect(res.body.analysisRun.status).toBe('queued')
      expect(mockPublishAiJob).not.toHaveBeenCalled()

      const outboxResult = await query(
        `
          SELECT status, attempts, last_error
          FROM workflow_outbox
          WHERE aggregate_id = $1
        `,
        [res.body.analysisRun.id]
      )
      expect(outboxResult.rows[0]).toMatchObject({
        status: 'pending',
        attempts: 0,
        last_error: null,
      })

      if (originalRedisUrl) {
        process.env.REDIS_URL = originalRedisUrl
      } else {
        delete process.env.REDIS_URL
      }
    })

    it('removes the newly uploaded object if the database transaction fails', async () => {
      const { nextError } = await runHandler(
        uploadRecordingHandler,
        buildRecordingUploadRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
          file: makeFakeFile({
            originalname: 'too-large.mp3',
            mimetype: 'audio/mpeg',
            size: 524288001,
          }),
        })
      )

      expect(nextError).toBeDefined()
      expect(mockPutObject).toHaveBeenCalled()
      expect(mockRemoveObject).toHaveBeenCalledWith(
        'meeting-audio',
        expect.stringMatching(new RegExp(`^meetings/${baseMeeting.id}/recordings/[0-9a-f-]{36}$`))
      )
    })

    it('preserves the database error when cleanup of a failed upload object also fails', async () => {
      const loggerSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      mockRemoveObject.mockRejectedValueOnce(new Error('MinIO cleanup failed'))

      const { nextError } = await runHandler(
        uploadRecordingHandler,
        buildRecordingUploadRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
          file: makeFakeFile({
            originalname: 'too-large-cleanup-fail.mp3',
            mimetype: 'audio/mpeg',
            size: 524288001,
          }),
        })
      )

      expect(nextError).toBeDefined()
      expect(nextError.message).toMatch(/meeting_recordings/)
      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to remove newly uploaded recording after database error',
        expect.objectContaining({
          bucketName: 'meeting-audio',
          message: 'MinIO cleanup failed',
        })
      )

      loggerSpy.mockRestore()
    })

    it('keeps replacement upload successful when old object cleanup fails', async () => {
      const loggerSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      const first = await runHandler(
        uploadRecordingHandler,
        buildRecordingUploadRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
          file: makeFakeFile({ originalname: 'first-cleanup.mp3', mimetype: 'audio/mpeg' }),
        })
      )
      expect(first.nextError).toBeUndefined()

      mockRemoveObject.mockRejectedValueOnce(new Error('old object unavailable'))

      const replace = await runHandler(
        uploadRecordingHandler,
        buildRecordingUploadRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
          file: makeFakeFile({ originalname: 'second-cleanup.mp3', mimetype: 'audio/mpeg' }),
          body: { replace: 'true' },
        })
      )

      expect(replace.nextError).toBeUndefined()
      expect(replace.res.statusCode).toBe(201)
      expect(replace.res.body.recording.fileName).toBe('second-cleanup.mp3')
      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to remove replaced recording object',
        expect.objectContaining({
          bucketName: 'meeting-audio',
          message: 'old object unavailable',
        })
      )

      loggerSpy.mockRestore()
    })

    it('replays a failed outbox event with the same workflow identifiers', async () => {
      process.env.AI_PIPELINE_ENABLED = 'true'

      const uploaded = await runHandler(
        uploadRecordingHandler,
        buildRecordingUploadRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
          file: makeFakeFile({
            originalname: 'replay.mp3',
            mimetype: 'audio/mpeg',
          }),
        })
      )
      expect(uploaded.nextError).toBeUndefined()
      const generated = await runHandler(
        generateRecordingHandler,
        buildRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
        })
      )
      expect(generated.nextError).toBeUndefined()
      mockPublishAiJob.mockRejectedValueOnce(new Error('Redis unavailable'))

      await dispatchPendingWorkflowOutbox({ limit: 1, retryDelaySeconds: 1 })

      mockPublishAiJob.mockClear()
      mockPublishAiJob.mockResolvedValueOnce({ messageId: '2-0' })

      await query(
        `
          UPDATE workflow_outbox
          SET available_at = NOW()
          WHERE aggregate_id = $1
        `,
        [generated.res.body.analysisRun.id]
      )

      await dispatchPendingWorkflowOutbox({ limit: 1 })

      expect(mockPublishAiJob).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: 'ai.transcription.jobs',
          eventType: 'transcription.requested',
          jobId: `transcription-${generated.res.body.transcript.id}`,
          payload: expect.objectContaining({
            recordingId: uploaded.res.body.recording.id,
            transcriptId: generated.res.body.transcript.id,
            analysisRunId: generated.res.body.analysisRun.id,
          }),
        })
      )

      const outboxResult = await query(
        `
          SELECT status, attempts
          FROM workflow_outbox
          WHERE aggregate_id = $1
        `,
        [generated.res.body.analysisRun.id]
      )
      expect(outboxResult.rows[0]).toMatchObject({
        status: 'dispatched',
        attempts: 2,
      })
    })

    it('allows an attendee participant to view recording metadata', async () => {
      const uploaded = await runHandler(
        uploadRecordingHandler,
        buildRecordingUploadRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
          file: makeFakeFile({
            originalname: 'participant-visible.mp3',
            mimetype: 'audio/mpeg',
          }),
        })
      )

      const { res, nextError } = await runHandler(
        getRecordingHandler,
        buildRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: participantUser.id },
        })
      )

      expect(uploaded.nextError).toBeUndefined()
      expect(nextError).toBeUndefined()
      expect(res.body.recording).toMatchObject({
        id: uploaded.res.body.recording.id,
        meetingId: baseMeeting.id,
        fileName: 'participant-visible.mp3',
      })
    })

    it('rejects a second active recording unless replace is true', async () => {
      await runHandler(
        uploadRecordingHandler,
        buildRecordingUploadRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
          file: makeFakeFile({ originalname: 'first.mp3', mimetype: 'audio/mpeg' }),
        })
      )

      const conflict = await runHandler(
        uploadRecordingHandler,
        buildRecordingUploadRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
          file: makeFakeFile({ originalname: 'second.mp3', mimetype: 'audio/mpeg' }),
        })
      )
      expect(conflict.nextError.statusCode).toBe(409)

      const replace = await runHandler(
        uploadRecordingHandler,
        buildRecordingUploadRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
          file: makeFakeFile({ originalname: 'second.mp3', mimetype: 'audio/mpeg' }),
          body: { replace: 'true' },
        })
      )

      expect(replace.nextError).toBeUndefined()
      expect(replace.res.statusCode).toBe(201)
      expect(replace.res.body.recording.fileName).toBe('second.mp3')
      const countResult = await query(
        `
          SELECT COUNT(*)::int AS active_count
          FROM meeting_recordings
          WHERE meeting_id = $1
            AND archived_at IS NULL
        `,
        [baseMeeting.id]
      )
      expect(countResult.rows[0].active_count).toBe(1)
    })

    it('removes the active recording by archiving it and deleting the object', async () => {
      const uploaded = await runHandler(
        uploadRecordingHandler,
        buildRecordingUploadRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
          file: makeFakeFile({ originalname: 'remove-me.mp3', mimetype: 'audio/mpeg' }),
        })
      )

      const { res, nextError } = await runHandler(
        removeRecordingHandler,
        buildRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
        })
      )

      expect(nextError).toBeUndefined()
      expect(res.statusCode).toBe(204)
      expect(mockRemoveObject).toHaveBeenCalledWith(
        'meeting-audio',
        uploaded.res.body.recording.objectKey
      )

      const getResult = await runHandler(
        getRecordingHandler,
        buildRequest({
          params: { meetingId: baseMeeting.id },
          user: { id: creatorUser.id },
        })
      )
      expect(getResult.res.body.recording).toBeNull()
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
      expect(mockPresignedGetObject).toHaveBeenCalledWith(
        'meeting-files',
        expect.any(String),
        60,
        expect.objectContaining({
          'response-content-disposition': expect.stringMatching(
            /^attachment; filename="agenda\.pdf"/
          ),
          'response-content-type': 'application/pdf',
        })
      )
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
