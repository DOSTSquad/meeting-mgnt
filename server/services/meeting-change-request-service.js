import { findMeetingById } from '../repositories/meeting-repository.js'
import { findOne } from '../repositories/participant-repository.js'
import {
  createChangeRequest,
  listChangeRequests,
  listMeetingChangeRequests,
  markChangeRequestRead,
} from '../repositories/meeting-change-request-repository.js'

const fail = (statusCode, message) => {
  throw Object.assign(new Error(message), { statusCode })
}

const loadMeeting = async (meetingId, callerId) => {
  if (!callerId) fail(401, 'Authentication required')
  const meeting = await findMeetingById(meetingId)
  if (!meeting) fail(404, 'Meeting not found')
  return meeting
}

export const submitMeetingChangeRequest = async (meetingId, callerId, message) => {
  const meeting = await loadMeeting(meetingId, callerId)
  const participant = await findOne(meetingId, callerId)
  if (
    meeting.ownerId === callerId ||
    !participant ||
    !['attendee', 'optional'].includes(participant.role)
  ) {
    fail(403, 'Only attendees can request a meeting change')
  }
  if (typeof message !== 'string' || !message.trim() || message.trim().length > 2000) {
    fail(400, 'Message must contain 1–2000 characters')
  }
  return createChangeRequest(meetingId, callerId, message.trim(), {
    recipientUserId: meeting.ownerId,
    title: meeting.title,
    detail: `${participant.name || 'An attendee'}: ${message.trim()}`,
  })
}

export const getParticipantChangeRequests = async (meetingId, userId, callerId) => {
  const meeting = await loadMeeting(meetingId, callerId)
  // Being an admin or organizer does not grant access to private attendee messages.
  if (meeting.ownerId !== callerId) fail(403, 'Only the meeting owner can read change requests')
  if (!(await findOne(meetingId, userId))) fail(404, 'Participant not found')
  return listChangeRequests(meetingId, userId)
}

export const getMeetingChangeRequests = async (meetingId, callerId) => {
  const meeting = await loadMeeting(meetingId, callerId)
  if (meeting.ownerId !== callerId) fail(403, 'Only the meeting owner can read change requests')
  return listMeetingChangeRequests(meetingId)
}

export const markMeetingChangeRequestRead = async (meetingId, requestId, callerId) => {
  const meeting = await loadMeeting(meetingId, callerId)
  if (meeting.ownerId !== callerId)
    fail(403, 'Only the meeting owner can mark change requests read')
  const request = await markChangeRequestRead(meetingId, requestId)
  if (!request) fail(404, 'Change request not found')
  return request
}
