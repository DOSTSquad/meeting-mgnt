import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { validationResult } from 'express-validator'

const MEETING_ID = '11111111-1111-4111-8111-111111111111'
const OWNER_ID = '22222222-2222-4222-8222-222222222222'

const mockCreateRecording = jest.fn()
const mockFindActiveRecording = jest.fn()
const mockPutObject = jest.fn()

jest.unstable_mockModule('../db/postgres.js', () => ({
  query: jest.fn(),
  transaction: jest.fn(async (callback) => callback({ query: jest.fn() })),
}))
jest.unstable_mockModule('../repositories/meeting-repository.js', () => ({
  findMeetingById: jest.fn(async () => ({ id: MEETING_ID, ownerId: OWNER_ID })),
}))
jest.unstable_mockModule('../repositories/participant-repository.js', () => ({
  listByMeeting: jest.fn(async () => []),
}))
jest.unstable_mockModule('../repositories/recording-repository.js', () => ({
  archiveRecording: jest.fn(),
  createRecording: mockCreateRecording,
  findActiveRecordingByMeetingId: mockFindActiveRecording,
  lockActiveRecordingById: jest.fn(),
  updateRecordingStatus: jest.fn(),
}))
jest.unstable_mockModule('../repositories/transcript-repository.js', () => ({
  createTranscript: jest.fn(),
  findLatestTranscriptByRecordingId: jest.fn(),
}))
jest.unstable_mockModule('../repositories/analysis-run-repository.js', () => ({
  createAnalysisRun: jest.fn(),
  findLatestAnalysisRunByRecordingId: jest.fn(),
}))
jest.unstable_mockModule('../repositories/workflow-outbox-repository.js', () => ({
  createWorkflowOutboxEvent: jest.fn(),
}))
jest.unstable_mockModule('../services/minio-client.js', () => ({
  BUCKET_AUDIO: 'meeting-audio',
  putObject: mockPutObject,
  removeObject: jest.fn(),
}))

const { uploadRecordingForMeeting } = await import('../services/recording-service.js')
const { recordingConsentValidator } = await import('../routes/recording-routes.js')

const audioFile = {
  originalname: 'standup.mp3',
  mimetype: 'audio/mpeg',
  size: 1024,
  buffer: Buffer.alloc(8),
}

const upload = (overrides = {}) =>
  uploadRecordingForMeeting({
    meetingId: MEETING_ID,
    callerId: OWNER_ID,
    callerRole: 'staff',
    file: audioFile,
    ...overrides,
  })

beforeEach(() => {
  jest.clearAllMocks()
  mockFindActiveRecording.mockResolvedValue(null)
  mockCreateRecording.mockImplementation(async (recording) => ({ ...recording }))
})

describe('uploadRecordingForMeeting consent', () => {
  it('rejects an upload that does not confirm consent', async () => {
    await expect(upload()).rejects.toMatchObject({ statusCode: 400 })
    await expect(upload({ consentConfirmed: 'true' })).rejects.toMatchObject({ statusCode: 400 })

    expect(mockPutObject).not.toHaveBeenCalled()
    expect(mockCreateRecording).not.toHaveBeenCalled()
  })

  it('still answers 403 to a caller who may not manage recordings', async () => {
    await expect(upload({ callerId: 'someone-else' })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('stores who confirmed consent and when', async () => {
    const before = Date.now()

    await upload({ consentConfirmed: true })

    const [stored] = mockCreateRecording.mock.calls[0]
    expect(stored.consentConfirmedBy).toBe(OWNER_ID)
    expect(stored.consentConfirmedAt).toBeInstanceOf(Date)
    expect(stored.consentConfirmedAt.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('requires consent again when replacing a recording', async () => {
    mockFindActiveRecording.mockResolvedValue({
      id: 'old',
      bucketName: 'meeting-audio',
      objectKey: 'k',
    })

    await expect(upload({ replace: true })).rejects.toMatchObject({ statusCode: 400 })
    await expect(upload({ replace: true, consentConfirmed: true })).resolves.toBeDefined()
  })
})

describe('recordingConsentValidator', () => {
  const validate = async (body) => {
    const req = { body }
    await Promise.all(recordingConsentValidator.map((chain) => chain.run(req)))

    return validationResult(req).array()
  }

  it('accepts the multipart string "true" and the boolean true', async () => {
    expect(await validate({ consentConfirmed: 'true' })).toEqual([])
    expect(await validate({ consentConfirmed: true })).toEqual([])
  })

  it.each([
    [{}],
    [{ consentConfirmed: 'false' }],
    [{ consentConfirmed: 'yes' }],
    [{ consentConfirmed: '' }],
  ])('rejects %j', async (body) => {
    const errors = await validate(body)

    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('consentConfirmed')
  })
})
