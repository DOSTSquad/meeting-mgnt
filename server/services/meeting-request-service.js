import {
  confirmMeetingRequest,
  createMeetingRequest,
  findInvitee,
  findMeetingRequestById,
  findUserMeetingConflict,
  listInvitees,
  listInviteeResponses,
  listTimeOptions,
  optionBelongsToRequest,
  replaceInviteeResponses,
  replaceInvitees,
  replaceTimeOptions,
} from '../repositories/meeting-request-repository.js'
import { bulkUpsert } from '../repositories/participant-repository.js'
import { findUserByEmail } from '../repositories/user-repository.js'
import { createMeetingForUser } from './meeting-service.js'

const createHttpError = (message, statusCode) => {
  const error = new Error(message)
  error.statusCode = statusCode

  return error
}

export const ALLOWED_MEETING_REQUEST_STATUSES = [
  'draft',
  'collecting_availability',
  'ready_to_confirm',
  'confirmed',
  'cancelled',
]

const toDate = (value) => (value instanceof Date ? value : new Date(value))

const normalizeEmail = (email) => String(email).trim().toLowerCase()

const validateTimezone = (value) => {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value })
  } catch (error) {
    if (error instanceof RangeError) {
      throw createHttpError(`Invalid timezoneName: ${value}`, 400)
    }

    throw error
  }
}

const validateTimeRange = (startsAt, endsAt) => {
  const start = toDate(startsAt)
  const end = toDate(endsAt)

  if (start < new Date()) {
    throw createHttpError('startsAt must be in the future', 400)
  }

  if (!(end > start)) {
    throw createHttpError('endsAt must be after startsAt', 400)
  }
}

const validateFutureDateTime = (value, fieldName) => {
  if (value && toDate(value) < new Date()) {
    throw createHttpError(`${fieldName} must be in the future`, 400)
  }
}

const assertCreator = (meetingRequest, callerId) => {
  if (!callerId) {
    throw createHttpError('Authentication required', 401)
  }

  if (meetingRequest.createdBy !== callerId) {
    throw createHttpError('Only the request creator can manage this meeting request', 403)
  }
}

const loadRequestOrThrow = async (requestId) => {
  const meetingRequest = await findMeetingRequestById(requestId)

  if (!meetingRequest) {
    throw createHttpError('Meeting request not found', 404)
  }

  return meetingRequest
}

const getRequestDetail = async (requestId) => {
  const meetingRequest = await loadRequestOrThrow(requestId)
  const timeOptions = await listTimeOptions(requestId)
  const invitees = await listInvitees(requestId)

  return { meetingRequest, timeOptions, invitees }
}

export const createRequestForUser = async (input, callerId) => {
  if (!callerId) {
    throw createHttpError('Authentication required', 401)
  }

  const {
    title,
    description,
    durationMinutes = 60,
    timezoneName = 'UTC',
    responseDeadline,
  } = input ?? {}

  if (!title || !title.trim()) {
    throw createHttpError('Title is required', 400)
  }

  const numericDuration = Number(durationMinutes)
  if (!Number.isInteger(numericDuration) || numericDuration <= 0 || numericDuration > 1440) {
    throw createHttpError('durationMinutes must be between 1 and 1440', 400)
  }

  validateTimezone(timezoneName)
  validateFutureDateTime(responseDeadline, 'responseDeadline')

  const meetingRequest = await createMeetingRequest({
    title,
    description: description ?? null,
    durationMinutes: numericDuration,
    timezoneName,
    responseDeadline: responseDeadline ? toDate(responseDeadline) : null,
    createdBy: callerId,
  })

  return { meetingRequest }
}

export const getRequestForUser = async (requestId, callerId) => {
  const detail = await getRequestDetail(requestId)
  assertCreator(detail.meetingRequest, callerId)

  return detail
}

export const getInviteeRequestForUser = async (requestId, inviteeId, callerId) => {
  if (!callerId) {
    throw createHttpError('Authentication required', 401)
  }

  const meetingRequest = await loadRequestOrThrow(requestId)
  const invitee = await findInvitee(requestId, inviteeId)

  if (!invitee) {
    throw createHttpError('Invitee not found', 404)
  }

  if (meetingRequest.createdBy !== callerId && invitee.userId !== callerId) {
    throw createHttpError('Only the invitee or request creator can view this request', 403)
  }

  const timeOptions = await listTimeOptions(requestId)
  const responses = await listInviteeResponses(inviteeId)

  return { meetingRequest, invitee, timeOptions, responses }
}

export const replaceTimeOptionsForRequest = async (requestId, input, callerId) => {
  const meetingRequest = await loadRequestOrThrow(requestId)
  assertCreator(meetingRequest, callerId)

  if (meetingRequest.status === 'confirmed') {
    throw createHttpError('Confirmed meeting requests cannot be changed', 409)
  }

  const { timeOptions } = input ?? {}
  if (!Array.isArray(timeOptions) || timeOptions.length === 0) {
    throw createHttpError('timeOptions must be a non-empty array', 400)
  }

  const normalized = timeOptions.map((option, index) => {
    const startsAt = option?.startsAt
    const endsAt = option?.endsAt

    if (!startsAt || !endsAt) {
      throw createHttpError(`timeOptions[${index}] requires startsAt and endsAt`, 400)
    }

    validateTimeRange(startsAt, endsAt)

    return {
      startsAt: toDate(startsAt),
      endsAt: toDate(endsAt),
      sortOrder: Number.isInteger(option.sortOrder) ? option.sortOrder : index,
    }
  })

  for (const [index, option] of normalized.entries()) {
    const conflict = await findUserMeetingConflict(callerId, option.startsAt, option.endsAt)
    if (conflict) {
      throw createHttpError(
        `timeOptions[${index}] overlaps with existing meeting "${conflict.title}"`,
        409
      )
    }
  }

  const updatedTimeOptions = await replaceTimeOptions(requestId, normalized)

  return { timeOptions: updatedTimeOptions }
}

export const replaceInviteesForRequest = async (requestId, input, callerId) => {
  const meetingRequest = await loadRequestOrThrow(requestId)
  assertCreator(meetingRequest, callerId)

  if (meetingRequest.status === 'confirmed') {
    throw createHttpError('Confirmed meeting requests cannot be changed', 409)
  }

  const { invitees } = input ?? {}
  if (!Array.isArray(invitees) || invitees.length === 0) {
    throw createHttpError('invitees must be a non-empty array', 400)
  }

  const seenEmails = new Set()
  const normalized = []

  for (const [index, invitee] of invitees.entries()) {
    const email = normalizeEmail(invitee?.email)
    if (!email) {
      throw createHttpError(`invitees[${index}].email is required`, 400)
    }

    if (seenEmails.has(email)) {
      continue
    }

    seenEmails.add(email)
    const user = await findUserByEmail(email)

    normalized.push({
      email,
      userId: user?.id ?? null,
      name: invitee.name ?? user?.name ?? null,
    })
  }

  const updatedInvitees = await replaceInvitees(requestId, normalized)

  return { invitees: updatedInvitees }
}

export const submitAvailabilityForInvitee = async (requestId, inviteeId, input, callerId) => {
  if (!callerId) {
    throw createHttpError('Authentication required', 401)
  }

  const meetingRequest = await loadRequestOrThrow(requestId)
  const invitee = await findInvitee(requestId, inviteeId)

  if (!invitee) {
    throw createHttpError('Invitee not found', 404)
  }

  if (['confirmed', 'cancelled'].includes(meetingRequest.status)) {
    throw createHttpError('Closed meeting requests cannot accept availability', 409)
  }

  if (meetingRequest.createdBy !== callerId && invitee.userId !== callerId) {
    throw createHttpError('Only the invitee or request creator can submit this availability', 403)
  }

  const { responses } = input ?? {}
  if (!Array.isArray(responses) || responses.length === 0) {
    throw createHttpError('responses must be a non-empty array', 400)
  }

  const normalized = []
  const seenOptionIds = new Set()

  for (const [index, response] of responses.entries()) {
    if (!response?.timeOptionId) {
      throw createHttpError(`responses[${index}].timeOptionId is required`, 400)
    }

    if (typeof response.isAvailable !== 'boolean') {
      throw createHttpError(`responses[${index}].isAvailable must be boolean`, 400)
    }

    if (seenOptionIds.has(response.timeOptionId)) {
      continue
    }

    const belongsToRequest = await optionBelongsToRequest(requestId, response.timeOptionId)
    if (!belongsToRequest) {
      throw createHttpError(`Unknown timeOptionId: ${response.timeOptionId}`, 400)
    }

    seenOptionIds.add(response.timeOptionId)
    normalized.push({
      timeOptionId: response.timeOptionId,
      isAvailable: response.isAvailable,
    })
  }

  const availabilityResponses = await replaceInviteeResponses(requestId, inviteeId, normalized)

  return { responses: availabilityResponses }
}

export const confirmRequestForUser = async (requestId, input, callerId) => {
  const meetingRequest = await loadRequestOrThrow(requestId)
  assertCreator(meetingRequest, callerId)

  if (meetingRequest.status === 'confirmed') {
    throw createHttpError('Meeting request is already confirmed', 409)
  }

  const { timeOptionId, location, tag } = input ?? {}
  if (!timeOptionId) {
    throw createHttpError('timeOptionId is required', 400)
  }

  const timeOptions = await listTimeOptions(requestId)
  const selectedOption = timeOptions.find((option) => option.id === timeOptionId)

  if (!selectedOption) {
    throw createHttpError('Time option not found', 404)
  }

  const meeting = await createMeetingForUser(
    {
      title: meetingRequest.title,
      description: meetingRequest.description,
      startsAt: selectedOption.startsAt,
      endsAt: selectedOption.endsAt,
      timezoneName: meetingRequest.timezoneName,
      location: location ?? null,
      tag: tag ?? null,
      status: 'scheduled',
    },
    callerId
  )

  const invitees = await listInvitees(requestId)
  const participantIds = invitees
    .map((invitee) => invitee.userId)
    .filter((userId) => userId && userId !== callerId)

  if (participantIds.length > 0) {
    await bulkUpsert({
      meetingId: meeting.id,
      userIds: participantIds,
      role: 'attendee',
      addedBy: callerId,
    })
  }

  const meetingRequestAfterConfirm = await confirmMeetingRequest({
    requestId,
    timeOptionId,
    meetingId: meeting.id,
  })

  return { meeting, meetingRequest: meetingRequestAfterConfirm }
}
