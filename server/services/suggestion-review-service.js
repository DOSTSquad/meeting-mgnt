import { transaction } from '../db/postgres.js'
import { insert as insertActionItem } from '../repositories/action-item-repository.js'
import {
  findSuggestionById,
  markSuggestionReviewed,
  updateProposedSuggestion,
} from '../repositories/analysis-suggestion-repository.js'
import { findMeetingById } from '../repositories/meeting-repository.js'
import { listByMeeting } from '../repositories/participant-repository.js'
import { notifyActionItemAssigned } from './notification-service.js'
import { assertCan } from './permissions.js'

const createHttpError = (message, statusCode) => {
  const error = new Error(message)
  error.statusCode = statusCode

  return error
}

const loadMeetingOrThrow = async (meetingId) => {
  const meeting = await findMeetingById(meetingId)

  if (!meeting) {
    throw createHttpError('Meeting not found', 404)
  }

  return meeting
}

const assertCanReview = async (meeting, callerId, callerRole) => {
  const participants = await listByMeeting(meeting.id)

  assertCan(
    'meeting:manage',
    { callerId, callerRole, meeting, participants },
    'Only the meeting creator or an organizer can review suggestions'
  )
}

/**
 * Re-checked at review time, not only when the suggestion was generated.
 * Participants change, and an assignee who has since left the meeting must not
 * receive a task for it.
 */
const assertAssigneeIsParticipant = async (meeting, assigneeId) => {
  if (!assigneeId) {
    return
  }

  const participants = await listByMeeting(meeting.id)
  const isParticipant =
    assigneeId === meeting.ownerId ||
    participants.some((participant) => participant.userId === assigneeId)

  if (!isParticipant) {
    throw createHttpError('Assignee must be a participant in this meeting', 400)
  }
}

const loadProposedSuggestion = async (meetingId, suggestionId) => {
  const suggestion = await findSuggestionById(suggestionId)

  if (!suggestion || suggestion.meetingId !== meetingId) {
    throw createHttpError('Suggestion not found', 404)
  }

  return suggestion
}

export const editSuggestion = async ({ meetingId, suggestionId, input, callerId, callerRole }) => {
  const meeting = await loadMeetingOrThrow(meetingId)
  await assertCanReview(meeting, callerId, callerRole)

  const existing = await loadProposedSuggestion(meetingId, suggestionId)

  if (existing.status !== 'proposed') {
    throw createHttpError(`A ${existing.status} suggestion cannot be edited`, 409)
  }

  await assertAssigneeIsParticipant(meeting, input.assigneeId)

  const suggestion = await updateProposedSuggestion({ id: suggestionId, meetingId, ...input })

  if (!suggestion) {
    // Reviewed between the read above and this write.
    throw createHttpError('Suggestion is no longer proposed', 409)
  }

  return { suggestion }
}

/**
 * Turns a proposal into a real action item.
 *
 * The action item and the suggestion's acceptance commit together, so there is
 * no state where a task exists that no suggestion claims, or a suggestion claims
 * a task that was never written.
 */
export const acceptSuggestion = async ({
  meetingId,
  suggestionId,
  callerId,
  callerRole,
  logger = console,
}) => {
  const meeting = await loadMeetingOrThrow(meetingId)
  await assertCanReview(meeting, callerId, callerRole)

  const existing = await loadProposedSuggestion(meetingId, suggestionId)

  if (existing.status !== 'proposed') {
    // Idempotent rather than an error: a duplicate request returns what already
    // happened, and crucially creates no second task and sends no second
    // notification.
    return { suggestion: existing, actionItem: null, alreadyReviewed: true }
  }

  await assertAssigneeIsParticipant(meeting, existing.assigneeId)

  const result = await transaction(async (client) => {
    const actionItem = await insertActionItem(
      {
        meetingId,
        title: existing.title,
        description: existing.description,
        assigneeId: existing.assigneeId,
        dueDate: existing.dueDate,
        priority: existing.priority,
        createdBy: callerId,
        // Provenance is set here, never taken from the request. A client that
        // could choose `source` could pass off generated content as hand-written,
        // or the reverse.
        source: 'ai',
        sourceRef: existing.analysisRunId,
      },
      client
    )

    const suggestion = await markSuggestionReviewed(
      {
        id: suggestionId,
        meetingId,
        status: 'accepted',
        reviewedBy: callerId,
        acceptedActionItemId: actionItem.id,
      },
      client
    )

    if (!suggestion) {
      // Another request accepted it first. Rolling back discards the action item
      // this attempt created, which is what keeps acceptance exactly-once.
      throw createHttpError('Suggestion is no longer proposed', 409)
    }

    return { suggestion, actionItem }
  })

  // Deliberately after commit and outside the transaction. A notification
  // failure must not undo an action item the reviewer has already been told
  // about; the task exists either way and the assignee can still see it.
  try {
    await notifyActionItemAssigned(result.actionItem)
  } catch (error) {
    logger.error?.('Failed to notify action item assignee', {
      actionItemId: result.actionItem.id,
      message: error.message,
    })
  }

  return { ...result, alreadyReviewed: false }
}

export const rejectSuggestion = async ({ meetingId, suggestionId, callerId, callerRole }) => {
  const meeting = await loadMeetingOrThrow(meetingId)
  await assertCanReview(meeting, callerId, callerRole)

  const existing = await loadProposedSuggestion(meetingId, suggestionId)

  if (existing.status !== 'proposed') {
    return { suggestion: existing, alreadyReviewed: true }
  }

  // Rejected suggestions are kept, with their reviewer and timestamp, so the
  // record shows what was offered and turned down as well as what was taken.
  const suggestion = await markSuggestionReviewed({
    id: suggestionId,
    meetingId,
    status: 'rejected',
    reviewedBy: callerId,
  })

  if (!suggestion) {
    throw createHttpError('Suggestion is no longer proposed', 409)
  }

  return { suggestion, alreadyReviewed: false }
}
