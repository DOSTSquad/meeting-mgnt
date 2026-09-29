import { findMeetingById } from '../repositories/meeting-repository.js'
import {
  createDraftMinute,
  findMinuteByMeetingId,
  updateMinute,
} from '../repositories/minute-repository.js'
import { listByMeeting } from '../repositories/participant-repository.js'
import { findUsersByIds } from '../repositories/user-repository.js'
import { assertCan } from './permissions.js'

const createHttpError = (message, statusCode) => {
  const error = new Error(message)
  error.statusCode = statusCode

  return error
}

export const ALLOWED_MINUTE_STATUSES = ['draft', 'approved', 'published']

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const loadMeetingOrThrow = async (meetingId) => {
  const meeting = await findMeetingById(meetingId)

  if (!meeting) {
    throw createHttpError('Meeting not found', 404)
  }

  return meeting
}

const assertCanAccessMeeting = async (meeting, callerId, callerRole) => {
  const participants = await listByMeeting(meeting.id)

  assertCan(
    'meeting:view',
    { callerId, callerRole, meeting, participants },
    'You do not have access to this meeting'
  )
}

const assertCanManageMinutes = async (meeting, callerId, callerRole) => {
  const participants = await listByMeeting(meeting.id)

  assertCan(
    'meeting:manage',
    { callerId, callerRole, meeting, participants },
    'Only the meeting creator or an organizer can update minutes'
  )
}

const assertValidNullableUuid = (field, value) => {
  if (value === null || value === undefined) {
    return
  }

  if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
    throw createHttpError(`${field} must be a UUID or null`, 400)
  }
}

const assertReferencedUsersExist = async (updates) => {
  const userIds = ['facilitatorId', 'recorderId']
    .map((field) => updates[field])
    .filter((value) => value !== undefined && value !== null)

  if (userIds.length === 0) {
    return
  }

  const uniqueIds = Array.from(new Set(userIds))
  const users = await findUsersByIds(uniqueIds)
  const foundIds = new Set(users.map((user) => user.id))
  const missingIds = uniqueIds.filter((id) => !foundIds.has(id))

  if (missingIds.length > 0) {
    throw createHttpError(`Unknown userIds: ${missingIds.join(', ')}`, 400)
  }
}

export const getMinutesForMeeting = async (meetingId, callerId, callerRole) => {
  const meeting = await loadMeetingOrThrow(meetingId)
  await assertCanAccessMeeting(meeting, callerId, callerRole)

  const existing = await findMinuteByMeetingId(meetingId)

  return {
    minutes: existing ?? (await createDraftMinute({ meetingId, preparedBy: callerId })),
  }
}

export const updateMinutesForMeeting = async ({
  meetingId,
  minuteId,
  input,
  callerId,
  callerRole,
}) => {
  const meeting = await loadMeetingOrThrow(meetingId)
  await assertCanManageMinutes(meeting, callerId, callerRole)

  const updates = {}

  for (const field of [
    'content',
    'keyDiscussions',
    'decisions',
    'facilitatorId',
    'recorderId',
    'generatedFromTranscriptId',
    'status',
  ]) {
    if (input[field] !== undefined) {
      updates[field] = input[field]
    }
  }

  if (Object.keys(updates).length === 0) {
    throw createHttpError('No updates supplied', 400)
  }

  for (const field of ['content', 'keyDiscussions', 'decisions']) {
    if (updates[field] !== undefined && typeof updates[field] !== 'string') {
      throw createHttpError(`${field} must be a string`, 400)
    }
  }

  assertValidNullableUuid('facilitatorId', updates.facilitatorId)
  assertValidNullableUuid('recorderId', updates.recorderId)
  assertValidNullableUuid('generatedFromTranscriptId', updates.generatedFromTranscriptId)
  await assertReferencedUsersExist(updates)

  if (updates.status !== undefined && !ALLOWED_MINUTE_STATUSES.includes(updates.status)) {
    throw createHttpError(`Invalid status: ${updates.status}`, 400)
  }

  const existing = await findMinuteByMeetingId(meetingId)
  const targetMinuteId = minuteId ?? existing?.id

  if (!targetMinuteId) {
    const created = await createDraftMinute({ meetingId, preparedBy: callerId })
    const minutes = await updateMinute({
      meetingId,
      minuteId: created.id,
      updates,
      updatedBy: callerId,
    })

    return { minutes }
  }

  const minutes = await updateMinute({
    meetingId,
    minuteId: targetMinuteId,
    updates,
    updatedBy: callerId,
  })

  if (!minutes) {
    throw createHttpError('Minutes not found', 404)
  }

  return { minutes }
}
