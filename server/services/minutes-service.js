import { findMeetingById } from '../repositories/meeting-repository.js'
import { listByMeeting as listParticipantsByMeeting } from '../repositories/participant-repository.js'
import {
  findById,
  findByMeetingId,
  updateBodyWithVersion,
} from '../repositories/minutes-repository.js'

export const DEFAULT_MINUTES_TEMPLATE = `# Meeting Minutes

## Attendees

- 

## Agenda

- 

## Discussion

-

## Decisions

-

## Action Items

- [ ] 
`

export const MINUTES_BODY_MAX_BYTES = 256 * 1024
export const MINUTES_BODY_TOO_LARGE_MESSAGE =
  'Minutes body must be 256 KB or smaller. Upload transcript-sized content as a meeting file instead.'

const createHttpError = (message, statusCode) => {
  const error = new Error(message)
  error.statusCode = statusCode

  return error
}

const assertIsParticipant = (meeting, callerId, participants) => {
  if (!callerId) {
    throw createHttpError('Authentication required', 401)
  }

  if (callerId === meeting.createdBy) {
    return
  }

  const isParticipant = participants.some((participant) => participant.userId === callerId)

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

const validateBody = (body) => {
  if (typeof body !== 'string') {
    throw createHttpError('body must be a string', 400)
  }

  if (Buffer.byteLength(body, 'utf8') > MINUTES_BODY_MAX_BYTES) {
    throw createHttpError(MINUTES_BODY_TOO_LARGE_MESSAGE, 413)
  }
}

export const getMinutesForMeeting = async (meetingId, callerId) => {
  const meeting = await loadMeetingOrThrow(meetingId)
  const participants = await listParticipantsByMeeting(meetingId)
  assertIsParticipant(meeting, callerId, participants)

  const minutes = await findByMeetingId(meetingId)

  if (!minutes) {
    throw createHttpError('Minutes not found', 404)
  }

  return { minutes }
}

export const updateMinutes = async (id, input, callerId) => {
  if (!callerId) {
    throw createHttpError('Authentication required', 401)
  }

  const existing = await findById(id)

  if (!existing) {
    throw createHttpError('Minutes not found', 404)
  }

  const meeting = await loadMeetingOrThrow(existing.meetingId)
  const participants = await listParticipantsByMeeting(existing.meetingId)
  assertIsParticipant(meeting, callerId, participants)

  if (meeting.status === 'archived') {
    throw createHttpError('Archived meeting minutes are read-only', 403)
  }

  validateBody(input?.body)

  const minutes = await updateBodyWithVersion(id, input.body, callerId)

  return { minutes }
}
