import { findMeetingById } from '../repositories/meeting-repository.js'
import {
  bulkUpsert,
  countOrganizers,
  listByMeeting,
  remove as removeParticipantRow,
  updateOne,
} from '../repositories/participant-repository.js'
import { findUsersByIds } from '../repositories/user-repository.js'

const createHttpError = (message, statusCode) => {
  const error = new Error(message)
  error.statusCode = statusCode

  return error
}

export const ALLOWED_ROLES = ['organizer', 'attendee', 'optional']
export const ALLOWED_RSVP = ['pending', 'accepted', 'declined']

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const assertManagePermission = (meeting, callerId, participants) => {
  if (!callerId) {
    throw createHttpError('Authentication required', 401)
  }

  if (callerId === meeting.createdBy) {
    return
  }

  const isOrganizer = participants.some(
    (participant) => participant.userId === callerId && participant.role === 'organizer'
  )

  if (!isOrganizer) {
    throw createHttpError('Only the meeting creator or an organizer can manage participants', 403)
  }
}

const loadMeetingOrThrow = async (meetingId) => {
  const meeting = await findMeetingById(meetingId)

  if (!meeting) {
    throw createHttpError('Meeting not found', 404)
  }

  return meeting
}

export const listParticipantsForMeeting = async (meetingId) => {
  await loadMeetingOrThrow(meetingId)

  const participants = await listByMeeting(meetingId)

  return { participants }
}

export const addParticipantsToMeeting = async (meetingId, input, callerId) => {
  const meeting = await loadMeetingOrThrow(meetingId)

  const { userIds, role = 'attendee' } = input ?? {}

  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw createHttpError('userIds must be a non-empty array', 400)
  }

  const dedupedUserIds = Array.from(new Set(userIds))

  for (const userId of dedupedUserIds) {
    if (typeof userId !== 'string' || !UUID_REGEX.test(userId)) {
      throw createHttpError(`Invalid userId: ${userId}`, 400)
    }
  }

  if (!ALLOWED_ROLES.includes(role)) {
    throw createHttpError(`Invalid role: ${role}`, 400)
  }

  const currentParticipants = await listByMeeting(meetingId)
  assertManagePermission(meeting, callerId, currentParticipants)

  const foundUsers = await findUsersByIds(dedupedUserIds)
  const foundIds = new Set(foundUsers.map((user) => user.id))
  const missingIds = dedupedUserIds.filter((id) => !foundIds.has(id))

  if (missingIds.length > 0) {
    throw createHttpError(`Unknown userIds: ${missingIds.join(', ')}`, 400)
  }

  const participants = await bulkUpsert({
    meetingId,
    userIds: dedupedUserIds,
    role,
    addedBy: callerId,
  })

  return { participants }
}

export const updateParticipant = async (meetingId, userId, input, callerId) => {
  const meeting = await loadMeetingOrThrow(meetingId)

  const currentParticipants = await listByMeeting(meetingId)
  assertManagePermission(meeting, callerId, currentParticipants)

  const target = currentParticipants.find((participant) => participant.userId === userId)

  if (!target) {
    throw createHttpError('Participant not found', 404)
  }

  const { role, rsvpStatus } = input ?? {}

  if (role === undefined && rsvpStatus === undefined) {
    throw createHttpError('No updates supplied', 400)
  }

  if (role !== undefined && !ALLOWED_ROLES.includes(role)) {
    throw createHttpError(`Invalid role: ${role}`, 400)
  }

  if (rsvpStatus !== undefined && !ALLOWED_RSVP.includes(rsvpStatus)) {
    throw createHttpError(`Invalid rsvpStatus: ${rsvpStatus}`, 400)
  }

  if (role !== undefined && target.role === 'organizer' && role !== 'organizer') {
    const organizerCount = await countOrganizers(meetingId)

    if (organizerCount === 1) {
      throw createHttpError('Cannot demote the last organizer', 400)
    }
  }

  const participant = await updateOne(meetingId, userId, { role, rsvpStatus })

  return { participant }
}

export const removeParticipant = async (meetingId, userId, callerId) => {
  const meeting = await loadMeetingOrThrow(meetingId)

  const currentParticipants = await listByMeeting(meetingId)
  assertManagePermission(meeting, callerId, currentParticipants)

  const target = currentParticipants.find((participant) => participant.userId === userId)

  if (!target) {
    throw createHttpError('Participant not found', 404)
  }

  if (target.role === 'organizer') {
    const organizerCount = await countOrganizers(meetingId)

    if (organizerCount === 1) {
      throw createHttpError('Cannot remove the last organizer', 400)
    }
  }

  await removeParticipantRow(meetingId, userId)
}
