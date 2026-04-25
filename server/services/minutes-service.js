import { findMeetingById } from '../repositories/meeting-repository.js'
import { listByMeeting as listParticipantsByMeeting } from '../repositories/participant-repository.js'
import {
  findById,
  findByMeetingId,
  updateBodyWithVersion,
} from '../repositories/minutes-repository.js'

const createHttpError = (message, statusCode) => {
  const error = new Error(message)
  error.statusCode = statusCode

  return error
}

export const DEFAULT_TEMPLATE_BODY =
  '# Meeting Minutes\n\n## Attendees\n\n## Agenda\n\n## Discussion\n\n## Decisions\n\n## Action Items\n'

export const MAX_BODY_BYTES = 256 * 1024

const assertIsParticipant = (meeting, callerId, participants) => {
  if (!callerId) {
    throw createHttpError('Authentication required', 401)
  }

  if (callerId === meeting.createdBy) {
    return
  }

  const isParticipant = participants.some((p) => p.userId === callerId)

  if (!isParticipant) {
    throw createHttpError('Only meeting participants can access minutes', 403)
  }
}

const loadMeetingOrThrow = async (meetingId) => {
  const meeting = await findMeetingById(meetingId)

  if (!meeting) {
    throw createHttpError('Meeting not found', 404)
  }

  return meeting
}

export const getMinutesForMeeting = async (meetingId, callerId) => {
  const meeting = await loadMeetingOrThrow(meetingId)
  const participants = await listParticipantsByMeeting(meetingId)
  assertIsParticipant(meeting, callerId, participants)

  const minutes = await findByMeetingId(meetingId)

  if (!minutes) {
    throw createHttpError(
      'Minutes record missing for meeting; data invariant violation',
      500
    )
  }

  return { minutes }
}

export const updateMinutes = async (minutesId, input, callerId) => {
  const existing = await findById(minutesId)

  if (!existing) {
    throw createHttpError('Minutes not found', 404)
  }

  const meeting = await loadMeetingOrThrow(existing.meetingId)
  const participants = await listParticipantsByMeeting(existing.meetingId)
  assertIsParticipant(meeting, callerId, participants)

  if (meeting.status === 'archived') {
    throw createHttpError('Cannot edit minutes for an archived meeting', 403)
  }

  const { body } = input ?? {}

  if (typeof body !== 'string') {
    throw createHttpError('body must be a string', 400)
  }

  const byteLength = Buffer.byteLength(body, 'utf8')

  if (byteLength > MAX_BODY_BYTES) {
    throw createHttpError(
      'body exceeds 256 KB limit; attach large content as a file instead',
      413
    )
  }

  const minutes = await updateBodyWithVersion(minutesId, body, callerId)

  return { minutes }
}
