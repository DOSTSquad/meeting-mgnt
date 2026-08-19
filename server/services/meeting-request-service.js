import { createHash, randomBytes } from 'node:crypto'

import {
  confirmMeetingRequest,
  createMeetingRequest,
  findInvitee,
  findInviteeByInvitationTokenHash,
  findMeetingRequestById,
  findUserMeetingConflict,
  listInvitees,
  listEmailedInvitees,
  listInviteeResponses,
  listTimeOptions,
  markInvitationEmailSent,
  optionBelongsToRequest,
  replaceInviteeResponses,
  replaceInvitees,
  replaceTimeOptions,
  saveInvitationToken,
  updateMeetingRequest,
} from '../repositories/meeting-request-repository.js'
import { bulkUpsert, listByMeeting } from '../repositories/participant-repository.js'
import { findUserByEmail, findUserById } from '../repositories/user-repository.js'
import { createMeetingForUser, updateMeetingById } from './meeting-service.js'
import { sendMeetingConfirmation, sendMeetingInvitation } from './email-service.js'
import {
  notifyMeetingCreated,
  notifyMeetingRequestConfirmed,
  notifyMeetingRequestInvited,
} from './notification-service.js'
import { hasResponseDeadlinePassed } from '../utils/meeting-requests.js'

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

const hashInvitationToken = (token) => createHash('sha256').update(token).digest('hex')

const getInvitationExpiry = (responseDeadline) => {
  const configuredDays = Number.parseInt(process.env.INVITATION_TOKEN_TTL_DAYS, 10)
  const ttlDays = Number.isInteger(configuredDays) && configuredDays > 0 ? configuredDays : 7
  const ttlExpiry = Date.now() + ttlDays * 24 * 60 * 60 * 1000

  return new Date(Math.min(new Date(responseDeadline).getTime(), ttlExpiry))
}

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
  if (!value) {
    throw createHttpError(`${fieldName} is required`, 400)
  }

  if (value && toDate(value) < new Date()) {
    throw createHttpError(`${fieldName} must be in the future`, 400)
  }
}

const validateTimeOptionsAfterDeadline = (timeOptions, responseDeadline) => {
  const deadline = toDate(responseDeadline)

  timeOptions.forEach((option, index) => {
    if (toDate(option.startsAt) <= deadline) {
      throw createHttpError(`timeOptions[${index}].startsAt must be after responseDeadline`, 400)
    }
  })
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
    tag,
    durationMinutes = 60,
    timezoneName = 'UTC',
    responseDeadline,
    ownerId = callerId,
  } = input ?? {}

  if (!title || !title.trim()) {
    throw createHttpError('Title is required', 400)
  }

  const normalizedTag = tag?.trim() || null
  if (!normalizedTag) {
    throw createHttpError('tag is required', 400)
  }
  if (normalizedTag.length > 100) {
    throw createHttpError('tag must be at most 100 characters', 400)
  }

  const numericDuration = Number(durationMinutes)
  if (!Number.isInteger(numericDuration) || numericDuration <= 0 || numericDuration > 1440) {
    throw createHttpError('durationMinutes must be between 1 and 1440', 400)
  }

  validateTimezone(timezoneName)
  validateFutureDateTime(responseDeadline, 'responseDeadline')

  const owner = await findUserById(ownerId)
  if (!owner) {
    throw createHttpError('Unknown ownerId', 400)
  }

  const meetingRequest = await createMeetingRequest({
    title,
    description: description ?? null,
    tag: normalizedTag,
    durationMinutes: numericDuration,
    timezoneName,
    responseDeadline: toDate(responseDeadline),
    ownerId,
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

const getInviteeRequestByToken = async (token) => {
  const invitee = token ? await findInviteeByInvitationTokenHash(hashInvitationToken(token)) : null

  if (!invitee) {
    throw createHttpError('Invitation is invalid or has expired', 404)
  }

  const meetingRequest = await loadRequestOrThrow(invitee.meetingRequestId)
  const timeOptions = await listTimeOptions(meetingRequest.id)
  const responses = await listInviteeResponses(invitee.id)

  return { meetingRequest, invitee, timeOptions, responses }
}

export const getPublicInvitationByToken = async (token) => {
  const { meetingRequest, invitee, timeOptions, responses } = await getInviteeRequestByToken(token)

  return {
    meetingRequest: {
      id: meetingRequest.id,
      title: meetingRequest.title,
      description: meetingRequest.description,
      durationMinutes: meetingRequest.durationMinutes,
      timezoneName: meetingRequest.timezoneName,
      responseDeadline: meetingRequest.responseDeadline,
      status: meetingRequest.status,
      availabilityClosed: meetingRequest.availabilityClosed,
    },
    invitee: {
      email: invitee.email,
      name: invitee.name,
      responseStatus: invitee.responseStatus,
      respondedAt: invitee.respondedAt,
    },
    timeOptions: timeOptions.map(({ id, startsAt, endsAt, sortOrder }) => ({
      id,
      startsAt,
      endsAt,
      sortOrder,
    })),
    responses,
  }
}

export const sendInvitationsForRequest = async (
  requestId,
  callerId,
  sendInvitation = sendMeetingInvitation
) => {
  const meetingRequest = await loadRequestOrThrow(requestId)
  assertCreator(meetingRequest, callerId)

  if (['confirmed', 'cancelled'].includes(meetingRequest.status)) {
    throw createHttpError('Closed meeting requests cannot send invitations', 409)
  }

  if (hasResponseDeadlinePassed(meetingRequest.responseDeadline)) {
    throw createHttpError('Response deadline has passed', 409)
  }

  const timeOptions = await listTimeOptions(requestId)
  const invitees = await listInvitees(requestId)
  if (timeOptions.length === 0 || invitees.length === 0) {
    throw createHttpError('Meeting requests require time options and invitees before sending', 409)
  }
  validateTimeOptionsAfterDeadline(timeOptions, meetingRequest.responseDeadline)

  for (const invitee of invitees) {
    const invitationToken = randomBytes(32).toString('base64url')
    await saveInvitationToken(
      invitee.id,
      hashInvitationToken(invitationToken),
      getInvitationExpiry(meetingRequest.responseDeadline)
    )
    await sendInvitation({ meetingRequest, invitee, invitationToken })
    await markInvitationEmailSent(invitee.id)
  }

  return { sentCount: invitees.length }
}

export const updateRequestForUser = async (requestId, input, callerId) => {
  const meetingRequest = await loadRequestOrThrow(requestId)
  assertCreator(meetingRequest, callerId)

  if (['confirmed', 'cancelled'].includes(meetingRequest.status)) {
    throw createHttpError('Closed meeting requests cannot be changed', 409)
  }

  if (input?.ownerId !== undefined && input.ownerId !== meetingRequest.ownerId) {
    throw createHttpError('Meeting owner cannot be changed', 409)
  }

  const {
    title,
    description,
    tag,
    durationMinutes = 60,
    timezoneName = 'UTC',
    responseDeadline,
  } = input ?? {}

  if (!title || !title.trim()) {
    throw createHttpError('Title is required', 400)
  }

  const normalizedTag = tag?.trim() || null
  if (!normalizedTag) {
    throw createHttpError('tag is required', 400)
  }
  if (normalizedTag.length > 100) {
    throw createHttpError('tag must be at most 100 characters', 400)
  }

  const numericDuration = Number(durationMinutes)
  if (!Number.isInteger(numericDuration) || numericDuration <= 0 || numericDuration > 1440) {
    throw createHttpError('durationMinutes must be between 1 and 1440', 400)
  }

  validateTimezone(timezoneName)
  validateFutureDateTime(responseDeadline, 'responseDeadline')
  validateTimeOptionsAfterDeadline(await listTimeOptions(requestId), responseDeadline)

  const updatedRequest = await updateMeetingRequest(requestId, {
    title: title.trim(),
    description: description ?? null,
    tag: normalizedTag,
    durationMinutes: numericDuration,
    timezoneName,
    responseDeadline: toDate(responseDeadline),
  })

  return { meetingRequest: updatedRequest }
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

  validateTimeOptionsAfterDeadline(normalized, meetingRequest.responseDeadline)

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

  if (
    meetingRequest.ownerId !== meetingRequest.createdBy &&
    !normalized.some((invitee) => invitee.userId === meetingRequest.ownerId)
  ) {
    const owner = await findUserById(meetingRequest.ownerId)
    if (!owner) {
      throw createHttpError('Meeting owner not found', 400)
    }

    normalized.push({ userId: owner.id, email: owner.email, name: owner.name })
  }

  const updatedInvitees = await replaceInvitees(requestId, normalized)

  await notifyMeetingRequestInvited(meetingRequest, updatedInvitees)

  return { invitees: updatedInvitees }
}

const saveAvailability = async (meetingRequest, invitee, input) => {
  if (['confirmed', 'cancelled'].includes(meetingRequest.status)) {
    throw createHttpError('Closed meeting requests cannot accept availability', 409)
  }

  if (hasResponseDeadlinePassed(meetingRequest.responseDeadline)) {
    throw createHttpError('Response deadline has passed', 409)
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

    const belongsToRequest = await optionBelongsToRequest(meetingRequest.id, response.timeOptionId)
    if (!belongsToRequest) {
      throw createHttpError(`Unknown timeOptionId: ${response.timeOptionId}`, 400)
    }

    seenOptionIds.add(response.timeOptionId)
    normalized.push({
      timeOptionId: response.timeOptionId,
      isAvailable: response.isAvailable,
    })
  }

  const availabilityResponses = await replaceInviteeResponses(
    meetingRequest.id,
    invitee.id,
    normalized
  )

  return { responses: availabilityResponses }
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

  if (meetingRequest.createdBy !== callerId && invitee.userId !== callerId) {
    throw createHttpError('Only the invitee or request creator can submit this availability', 403)
  }

  return saveAvailability(meetingRequest, invitee, input)
}

export const submitPublicAvailabilityByToken = async (token, input) => {
  const { meetingRequest, invitee } = await getInviteeRequestByToken(token)

  return saveAvailability(meetingRequest, invitee, input)
}

export const confirmRequestForUser = async (
  requestId,
  input,
  callerId,
  sendConfirmation = sendMeetingConfirmation
) => {
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
      tag: tag ?? meetingRequest.tag ?? null,
      status: 'scheduled',
      ownerId: meetingRequest.ownerId,
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

    await notifyMeetingCreated(meeting, participantIds)
  }

  const meetingRequestAfterConfirm = await confirmMeetingRequest({
    requestId,
    timeOptionId,
    meetingId: meeting.id,
  })

  await notifyMeetingRequestConfirmed(meetingRequestAfterConfirm, meeting, [
    callerId,
    ...participantIds,
  ])

  const emailedInvitees = await listEmailedInvitees(requestId)
  const meetingParticipants = await listByMeeting(meeting.id)
  const organizer =
    meetingParticipants.find((participant) => participant.userId === meeting.ownerId) ??
    meetingParticipants.find((participant) => participant.userId === callerId)
  const confirmationRecipients = [organizer, ...emailedInvitees].filter(Boolean)
  const uniqueConfirmationRecipients = [
    ...new Map(
      confirmationRecipients.map((recipient) => [recipient.email.trim().toLowerCase(), recipient])
    ).values(),
  ]
  const emailResults = await Promise.allSettled(
    uniqueConfirmationRecipients.map((invitee) => sendConfirmation({ meeting, invitee, organizer }))
  )
  const failedEmailCount = emailResults.filter((result) => result.status === 'rejected').length

  if (failedEmailCount > 0) {
    console.error('Meeting confirmation email delivery failed', {
      meetingRequestId: requestId,
      failedCount: failedEmailCount,
    })
  }

  return {
    meeting,
    meetingRequest: meetingRequestAfterConfirm,
    emailDelivery: {
      sentCount: uniqueConfirmationRecipients.length - failedEmailCount,
      failedCount: failedEmailCount,
    },
  }
}

export const terminateRequestForUser = async (requestId, callerId, deliverCalendar) => {
  const meetingRequest = await loadRequestOrThrow(requestId)
  assertCreator(meetingRequest, callerId)

  if (meetingRequest.confirmedMeetingId) {
    await updateMeetingById(
      meetingRequest.confirmedMeetingId,
      { status: 'cancelled' },
      meetingRequest.ownerId,
      deliverCalendar
    )
  }

  const terminatedRequest = await confirmMeetingRequest({
    requestId,
    timeOptionId: null,
    meetingId: null,
    status: 'cancelled',
  })

  return { meetingRequest: terminatedRequest }
}
