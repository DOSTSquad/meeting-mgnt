import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const MEETING_ID = '11111111-1111-4111-8111-111111111111'
const OWNER_ID = '22222222-2222-4222-8222-222222222222'
const OUTSIDER_ID = '33333333-3333-4333-8333-333333333333'

const callOrder = []
const mockFindMeetingById = jest.fn()
const mockDeleteMeeting = jest.fn()
const mockListByMeeting = jest.fn()
const mockListSources = jest.fn()
const mockRemoveObject = jest.fn()

jest.unstable_mockModule('../repositories/meeting-repository.js', () => ({
  createMeeting: jest.fn(),
  deleteMeeting: mockDeleteMeeting,
  findMeetingById: mockFindMeetingById,
  listMeetings: jest.fn(),
  updateMeeting: jest.fn(),
}))
jest.unstable_mockModule('../repositories/participant-repository.js', () => ({
  bulkUpsert: jest.fn(),
  listByMeeting: mockListByMeeting,
}))
jest.unstable_mockModule('../repositories/tag-repository.js', () => ({
  createTag: jest.fn(),
  findTagByName: jest.fn(),
}))
jest.unstable_mockModule('../repositories/user-repository.js', () => ({
  findUserById: jest.fn(),
}))
jest.unstable_mockModule('../services/notification-service.js', () => ({
  notifyMeetingCreated: jest.fn(),
}))
jest.unstable_mockModule('../repositories/meeting-storage-repository.js', () => ({
  listStoredObjectSourcesForMeeting: mockListSources,
}))
jest.unstable_mockModule('../services/minio-client.js', () => ({
  removeObject: mockRemoveObject,
}))

const { deleteMeetingById } = await import('../services/meeting-service.js')

const storedSources = {
  objects: [
    { bucket: 'meeting-files', key: `meetings/${MEETING_ID}/file-1` },
    { bucket: 'meeting-audio', key: `meetings/${MEETING_ID}/recording-1` },
  ],
  transcriptIds: ['transcript-1'],
  analysisRunIds: ['analysis-1'],
}

beforeEach(() => {
  callOrder.length = 0
  jest.resetAllMocks()
  mockFindMeetingById.mockResolvedValue({ id: MEETING_ID, ownerId: OWNER_ID })
  mockListByMeeting.mockResolvedValue([])
  mockListSources.mockResolvedValue(storedSources)
  mockDeleteMeeting.mockImplementation(async () => {
    callOrder.push('db-delete')
    return true
  })
  mockRemoveObject.mockImplementation(async () => {
    callOrder.push('remove-object')
  })
})

describe('deleteMeetingById storage cleanup', () => {
  it('removes files, recordings and AI result artifacts after the database delete', async () => {
    await deleteMeetingById(MEETING_ID, OWNER_ID, 'staff')

    expect(mockRemoveObject.mock.calls).toEqual([
      ['meeting-files', `meetings/${MEETING_ID}/file-1`],
      ['meeting-audio', `meetings/${MEETING_ID}/recording-1`],
      ['meeting-ai-results', 'ai-results/transcriptions/transcript-1.json'],
      ['meeting-ai-results', 'ai-results/analysis/analysis-1.json'],
    ])
    expect(callOrder[0]).toBe('db-delete')
    expect(callOrder.slice(1)).toEqual(Array(4).fill('remove-object'))
  })

  it('uses MINIO_BUCKET_AI_RESULTS for the AI result artifacts', async () => {
    process.env.MINIO_BUCKET_AI_RESULTS = 'custom-ai-results'

    try {
      await deleteMeetingById(MEETING_ID, OWNER_ID, 'staff')
    } finally {
      delete process.env.MINIO_BUCKET_AI_RESULTS
    }

    expect(mockRemoveObject).toHaveBeenCalledWith(
      'custom-ai-results',
      'ai-results/analysis/analysis-1.json'
    )
  })

  it('still succeeds when storage removal fails and logs only bucket, key and code', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockRemoveObject.mockRejectedValueOnce(
      Object.assign(new Error('secret-name.pdf is unreachable'), { code: 'ECONNREFUSED' })
    )

    await expect(deleteMeetingById(MEETING_ID, OWNER_ID, 'staff')).resolves.toBeUndefined()

    expect(mockRemoveObject).toHaveBeenCalledTimes(4)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('Failed to remove stored object after delete', {
      bucket: 'meeting-files',
      key: `meetings/${MEETING_ID}/file-1`,
      code: 'ECONNREFUSED',
    })
    warn.mockRestore()
  })

  it('removes nothing when the meeting does not exist', async () => {
    mockFindMeetingById.mockResolvedValue(null)

    await expect(deleteMeetingById(MEETING_ID, OWNER_ID, 'staff')).rejects.toMatchObject({
      statusCode: 404,
    })

    expect(mockDeleteMeeting).not.toHaveBeenCalled()
    expect(mockRemoveObject).not.toHaveBeenCalled()
  })

  it('removes nothing when the caller may not delete the meeting', async () => {
    await expect(deleteMeetingById(MEETING_ID, OUTSIDER_ID, 'staff')).rejects.toMatchObject({
      statusCode: 403,
    })

    expect(mockListSources).not.toHaveBeenCalled()
    expect(mockDeleteMeeting).not.toHaveBeenCalled()
    expect(mockRemoveObject).not.toHaveBeenCalled()
  })

  it('removes nothing when the row was already gone by the time of the delete', async () => {
    mockDeleteMeeting.mockResolvedValue(false)

    await expect(deleteMeetingById(MEETING_ID, OWNER_ID, 'staff')).rejects.toMatchObject({
      statusCode: 404,
    })

    expect(mockRemoveObject).not.toHaveBeenCalled()
  })
})
