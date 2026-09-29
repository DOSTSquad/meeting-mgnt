import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const findMeetingById = jest.fn()
const deleteMeeting = jest.fn()
const updateMeeting = jest.fn()
const listByMeeting = jest.fn()
const bulkUpsert = jest.fn()
const removeParticipantRow = jest.fn()
const findUsersByIds = jest.fn()
const findMinuteByMeetingId = jest.fn()
const updateMinute = jest.fn()
const findActiveRecordingByMeetingId = jest.fn()
const archiveRecording = jest.fn()
const findLatestTranscriptByRecordingId = jest.fn()
const findLatestAnalysisRunByRecordingId = jest.fn()
const findActionItemById = jest.fn()
const insertActionItem = jest.fn()
const updateActionItem = jest.fn()
const removeActionItem = jest.fn()
const listActionItemsByMeeting = jest.fn()
const findFileById = jest.fn()
const createFile = jest.fn()
const deleteFile = jest.fn()
const listFilesByMeeting = jest.fn()

jest.unstable_mockModule('../db/postgres.js', () => ({
  transaction: jest.fn(async (callback) => callback({ query: jest.fn() })),
}))
jest.unstable_mockModule('../repositories/meeting-repository.js', () => ({
  createMeeting: jest.fn(),
  deleteMeeting,
  findMeetingById,
  listMeetings: jest.fn(),
  updateMeeting,
}))
jest.unstable_mockModule('../repositories/participant-repository.js', () => ({
  bulkUpsert,
  countOrganizers: jest.fn(),
  listByMeeting,
  remove: removeParticipantRow,
  updateOne: jest.fn(),
}))
jest.unstable_mockModule('../repositories/tag-repository.js', () => ({
  createTag: jest.fn(),
  findTagByName: jest.fn(),
}))
jest.unstable_mockModule('../repositories/user-repository.js', () => ({
  findUserById: jest.fn(),
  findUsersByIds,
}))
jest.unstable_mockModule('../repositories/minute-repository.js', () => ({
  createDraftMinute: jest.fn(),
  findMinuteByMeetingId,
  updateMinute,
}))
jest.unstable_mockModule('../repositories/recording-repository.js', () => ({
  archiveRecording,
  createRecording: jest.fn(),
  findActiveRecordingByMeetingId,
  lockActiveRecordingById: jest.fn(),
  updateRecordingStatus: jest.fn(),
}))
jest.unstable_mockModule('../repositories/transcript-repository.js', () => ({
  createTranscript: jest.fn(),
  findLatestTranscriptByRecordingId,
}))
jest.unstable_mockModule('../repositories/analysis-run-repository.js', () => ({
  createAnalysisRun: jest.fn(),
  findLatestAnalysisRunByRecordingId,
}))
jest.unstable_mockModule('../repositories/workflow-outbox-repository.js', () => ({
  createWorkflowOutboxEvent: jest.fn(),
}))
jest.unstable_mockModule('../repositories/action-item-repository.js', () => ({
  findById: findActionItemById,
  insert: insertActionItem,
  listByAssignee: jest.fn(),
  listByMeeting: listActionItemsByMeeting,
  listByMeetingOwner: jest.fn(),
  remove: removeActionItem,
  updateOne: updateActionItem,
}))
jest.unstable_mockModule('../repositories/file-repository.js', () => ({
  createFile,
  deleteFile,
  findFileById,
  listFilesByMeeting,
}))
jest.unstable_mockModule('../services/minio-client.js', () => ({
  BUCKET_AUDIO: 'meeting-audio',
  BUCKET_FILES: 'meeting-files',
  getObject: jest.fn(async () => ({ pipe: jest.fn() })),
  presignedGetObject: jest.fn(async () => 'https://minio.local/presigned'),
  putObject: jest.fn(),
  removeObject: jest.fn(),
}))
jest.unstable_mockModule('../services/notification-service.js', () => ({
  notifyMeetingCreated: jest.fn(),
  notifyActionItemAssigned: jest.fn(),
}))

const { deleteMeetingById, getMeetingById, updateMeetingById } =
  await import('../services/meeting-service.js')
const { addParticipantsToMeeting, listParticipantsForMeeting, removeParticipant } =
  await import('../services/participant-service.js')
const { deleteFileById, getDownloadStream, getDownloadUrl, listFiles, uploadFile } =
  await import('../services/file-service.js')
const { getMinutesForMeeting, updateMinutesForMeeting } =
  await import('../services/minute-service.js')
const { archiveRecordingForMeeting, getRecordingForMeeting } =
  await import('../services/recording-service.js')
const {
  createActionItem,
  deleteActionItem,
  getActionItem,
  listActionItems,
  updateActionItem: updateActionItemById,
} = await import('../services/action-item-service.js')

const MEETING_ID = '11111111-1111-4111-8111-111111111111'
const OWNER_ID = '22222222-2222-4222-8222-222222222222'
const ORGANIZER_ID = '33333333-3333-4333-8333-333333333333'
const ATTENDEE_ID = '44444444-4444-4444-8444-444444444444'
const OUTSIDER_ID = '55555555-5555-4555-8555-555555555555'
const ADMIN_ID = '66666666-6666-4666-8666-666666666666'
const ITEM_ID = '77777777-7777-4777-8777-777777777777'
const NEW_USER_ID = '88888888-8888-4888-8888-888888888888'
const FILE_ID = '99999999-9999-4999-8999-999999999999'

const admin = { callerId: ADMIN_ID, callerRole: 'admin' }
const owner = { callerId: OWNER_ID, callerRole: 'staff' }
const organizer = { callerId: ORGANIZER_ID, callerRole: 'staff' }
const attendee = { callerId: ATTENDEE_ID, callerRole: 'staff' }
const outsider = { callerId: OUTSIDER_ID, callerRole: 'staff' }

const meeting = { id: MEETING_ID, ownerId: OWNER_ID, status: 'scheduled' }
const recording = {
  id: 'recording-1',
  meetingId: MEETING_ID,
  bucketName: 'meeting-audio',
  objectKey: 'meetings/recording-1',
}
const fileRow = {
  id: FILE_ID,
  meetingId: MEETING_ID,
  fileName: 'agenda.pdf',
  mimeType: 'application/pdf',
  bucketName: 'meeting-files',
  objectKey: `meetings/${MEETING_ID}/files/${FILE_ID}`,
}
const upload = {
  originalname: 'agenda.pdf',
  mimetype: 'application/pdf',
  size: 3,
  buffer: Buffer.from('pdf'),
}
const actionItem = { id: ITEM_ID, meetingId: MEETING_ID, assigneeId: ATTENDEE_ID, status: 'todo' }

beforeEach(() => {
  findMeetingById.mockReset().mockResolvedValue(meeting)
  deleteMeeting.mockReset().mockResolvedValue(true)
  updateMeeting.mockReset().mockResolvedValue({ ...meeting, title: 'Renamed' })
  listByMeeting.mockReset().mockResolvedValue([
    { userId: ORGANIZER_ID, role: 'organizer' },
    { userId: ATTENDEE_ID, role: 'attendee' },
  ])
  bulkUpsert.mockReset().mockResolvedValue([])
  removeParticipantRow.mockReset().mockResolvedValue(undefined)
  findUsersByIds.mockReset().mockImplementation(async (ids) => ids.map((id) => ({ id })))
  findMinuteByMeetingId.mockReset().mockResolvedValue({ id: 'minute-1', meetingId: MEETING_ID })
  updateMinute.mockReset().mockResolvedValue({ id: 'minute-1', content: 'Notes' })
  findActiveRecordingByMeetingId.mockReset().mockResolvedValue(recording)
  archiveRecording.mockReset().mockResolvedValue({ ...recording, status: 'archived' })
  findLatestTranscriptByRecordingId.mockReset().mockResolvedValue(null)
  findLatestAnalysisRunByRecordingId.mockReset().mockResolvedValue(null)
  findActionItemById.mockReset().mockResolvedValue(actionItem)
  insertActionItem.mockReset().mockResolvedValue(actionItem)
  updateActionItem.mockReset().mockResolvedValue({ ...actionItem, status: 'completed' })
  removeActionItem.mockReset().mockResolvedValue(undefined)
  listActionItemsByMeeting.mockReset().mockResolvedValue([actionItem])
  findFileById.mockReset().mockResolvedValue(fileRow)
  createFile.mockReset().mockResolvedValue(fileRow)
  deleteFile.mockReset().mockResolvedValue(undefined)
  listFilesByMeeting.mockReset().mockResolvedValue([fileRow])
})

const forbidden = { statusCode: 403 }

// Each entry runs one service call as the given caller. `denied` is a staff caller who must be
// refused: an outsider for view-level operations, an attendee for manage-level ones.
const operations = [
  {
    name: 'meeting read',
    denied: outsider,
    run: (c) => getMeetingById(MEETING_ID, c.callerId, c.callerRole),
  },
  {
    name: 'meeting update',
    denied: attendee,
    run: (c) =>
      updateMeetingById(MEETING_ID, { title: 'Renamed' }, c.callerId, undefined, c.callerRole),
  },
  {
    name: 'meeting delete',
    denied: attendee,
    run: (c) => deleteMeetingById(MEETING_ID, c.callerId, c.callerRole),
  },
  {
    name: 'participants list',
    denied: outsider,
    run: (c) => listParticipantsForMeeting(MEETING_ID, c.callerId, c.callerRole),
  },
  {
    name: 'participants add',
    denied: attendee,
    run: (c) =>
      addParticipantsToMeeting(MEETING_ID, { userIds: [NEW_USER_ID] }, c.callerId, c.callerRole),
  },
  {
    name: 'participants remove',
    denied: attendee,
    run: (c) => removeParticipant(MEETING_ID, ATTENDEE_ID, c.callerId, c.callerRole),
  },
  {
    name: 'files list',
    denied: outsider,
    run: (c) => listFiles(MEETING_ID, c.callerId, c.callerRole),
  },
  {
    name: 'file upload',
    denied: outsider,
    run: (c) => uploadFile(MEETING_ID, c.callerId, upload, undefined, 'file', c.callerRole),
  },
  {
    name: 'file download url',
    denied: outsider,
    run: (c) => getDownloadUrl(FILE_ID, c.callerId, c.callerRole),
  },
  {
    name: 'file download stream',
    denied: outsider,
    run: (c) => getDownloadStream(FILE_ID, c.callerId, c.callerRole),
  },
  {
    name: 'file delete',
    denied: attendee,
    run: (c) => deleteFileById(FILE_ID, c.callerId, c.callerRole),
  },
  {
    name: 'minutes read',
    denied: outsider,
    run: (c) => getMinutesForMeeting(MEETING_ID, c.callerId, c.callerRole),
  },
  {
    name: 'minutes update',
    denied: attendee,
    run: (c) =>
      updateMinutesForMeeting({
        meetingId: MEETING_ID,
        input: { content: 'Notes' },
        callerId: c.callerId,
        callerRole: c.callerRole,
      }),
  },
  {
    name: 'recording read',
    denied: outsider,
    run: (c) => getRecordingForMeeting(MEETING_ID, c.callerId, c.callerRole),
  },
  {
    name: 'recording archive',
    denied: attendee,
    run: (c) => archiveRecordingForMeeting(MEETING_ID, c.callerId, c.callerRole),
  },
  {
    name: 'action items list',
    denied: outsider,
    run: (c) => listActionItems(MEETING_ID, {}, c.callerId, c.callerRole),
  },
  {
    name: 'action item read',
    denied: outsider,
    run: (c) => getActionItem(ITEM_ID, c.callerId, c.callerRole),
  },
  {
    name: 'action item create',
    denied: outsider,
    run: (c) => createActionItem(MEETING_ID, { title: 'Follow up' }, c.callerId, c.callerRole),
  },
  {
    name: 'action item update',
    denied: outsider,
    run: (c) => updateActionItemById(ITEM_ID, { title: 'Renamed' }, c.callerId, c.callerRole),
  },
  {
    name: 'action item delete',
    denied: outsider,
    run: (c) => deleteActionItem(ITEM_ID, c.callerId, c.callerRole),
  },
]

describe.each(operations)('$name', ({ run, denied }) => {
  it('is allowed for an admin who is not part of the meeting', async () => {
    await run(admin)
  })

  it('is refused for a staff account without the required meeting role', async () => {
    await expect(run(denied)).rejects.toMatchObject(forbidden)
  })

  it('is allowed for the meeting owner', async () => {
    await run(owner)
  })
})

describe('manage-level operations', () => {
  it.each(operations.filter((operation) => operation.denied === attendee))(
    '$name is allowed for an organizer',
    async ({ run }) => {
      await run(organizer)
    }
  )
})

describe('unauthenticated callers', () => {
  it('are rejected with 401 even when the role is admin', async () => {
    await expect(getMeetingById(MEETING_ID, undefined, 'admin')).rejects.toMatchObject({
      statusCode: 401,
    })
  })
})
