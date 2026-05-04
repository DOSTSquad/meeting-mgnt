import { findMeetingById } from '../repositories/meeting-repository.js'
import { listByMeeting as listParticipantsByMeeting } from '../repositories/participant-repository.js'
import { findUsersByIds } from '../repositories/user-repository.js'
import {
  findById,
  insert,
  listByAssignee,
  listByMeeting,
  remove as removeActionItemRow,
  updateOne,
} from '../repositories/action-item-repository.js'

const createHttpError = (message, statusCode) => {
  const error = new Error(message)
  error.statusCode = statusCode

  return error
}

export const ALLOWED_STATUSES = ['todo', 'in_progress', 'blocked', 'completed', 'cancelled']
export const ALLOWED_PRIORITIES = ['low', 'medium', 'high']

const assertIsParticipant = (meeting, callerId, participants) => {
  if (!callerId) {
    throw createHttpError('Authentication required', 401)
  }

  if (callerId === meeting.createdBy) {
    return
  }

  const isParticipant = participants.some((p) => p.userId === callerId)

  if (!isParticipant) {
    throw createHttpError('Only meeting participants can manage action items', 403)
  }
}

const loadMeetingOrThrow = async (meetingId) => {
  const meeting = await findMeetingById(meetingId)

  if (!meeting) {
    throw createHttpError('Meeting not found', 404)
  }

  return meeting
}

const assertAssigneeExists = async (assigneeId) => {
  if (assigneeId === null || assigneeId === undefined) {
    return
  }

  const found = await findUsersByIds([assigneeId])

  if (found.length === 0) {
    throw createHttpError('Unknown assigneeId', 400)
  }
}

const assertAssigneeIsParticipant = (assigneeId, participants) => {
  if (!assigneeId) {
    return
  }

  const isParticipant = participants.some((participant) => participant.userId === assigneeId)
  if (!isParticipant) {
    throw createHttpError('assigneeId must belong to a meeting participant', 400)
  }
}

export const listActionItems = async (meetingId, { status, assigneeId } = {}, callerId) => {
  const meeting = await loadMeetingOrThrow(meetingId)
  const participants = await listParticipantsByMeeting(meetingId)
  assertIsParticipant(meeting, callerId, participants)

  if (status !== undefined && !ALLOWED_STATUSES.includes(status)) {
    throw createHttpError(`Invalid status: ${status}`, 400)
  }

  const actionItems = await listByMeeting(meetingId, { status, assigneeId })

  return { actionItems }
}

export const listMyActionItems = async (callerId, { status, priority } = {}) => {
  if (!callerId) {
    throw createHttpError('Authentication required', 401)
  }

  if (status !== undefined && !ALLOWED_STATUSES.includes(status)) {
    throw createHttpError(`Invalid status: ${status}`, 400)
  }

  if (priority !== undefined && !ALLOWED_PRIORITIES.includes(priority)) {
    throw createHttpError(`Invalid priority: ${priority}`, 400)
  }

  const actionItems = await listByAssignee(callerId, { status, priority })

  return { actionItems }
}

export const createActionItem = async (meetingId, input, callerId) => {
  const meeting = await loadMeetingOrThrow(meetingId)
  const participants = await listParticipantsByMeeting(meetingId)
  assertIsParticipant(meeting, callerId, participants)

  const {
    title,
    description,
    assigneeId,
    dueDate,
    priority,
    source,
    sourceRef,
  } = input ?? {}

  if (typeof title !== 'string' || title.trim().length === 0) {
    throw createHttpError('title is required', 400)
  }

  const trimmedTitle = title.trim()

  if (trimmedTitle.length > 255) {
    throw createHttpError('title must be 255 characters or fewer', 400)
  }

  if (priority !== undefined && !ALLOWED_PRIORITIES.includes(priority)) {
    throw createHttpError(`Invalid priority: ${priority}`, 400)
  }

  if (assigneeId !== undefined && assigneeId !== null) {
    await assertAssigneeExists(assigneeId)
    assertAssigneeIsParticipant(assigneeId, participants)
  }

  const actionItem = await insert({
    meetingId,
    title: trimmedTitle,
    description: description ?? null,
    assigneeId: assigneeId ?? null,
    dueDate: dueDate ?? null,
    priority: priority ?? 'medium',
    createdBy: callerId,
    source: source ?? 'manual',
    sourceRef: sourceRef ?? null,
  })

  return { actionItem }
}

const loadActionItemOrThrow = async (id) => {
  const actionItem = await findById(id)

  if (!actionItem) {
    throw createHttpError('Action item not found', 404)
  }

  return actionItem
}

export const updateActionItem = async (itemId, input, callerId) => {
  const existing = await loadActionItemOrThrow(itemId)
  const meeting = await loadMeetingOrThrow(existing.meetingId)
  const participants = await listParticipantsByMeeting(existing.meetingId)
  assertIsParticipant(meeting, callerId, participants)

  const { title, description, assigneeId, dueDate, status, priority } = input ?? {}

  const hasUpdate =
    title !== undefined ||
    description !== undefined ||
    assigneeId !== undefined ||
    dueDate !== undefined ||
    status !== undefined ||
    priority !== undefined

  if (!hasUpdate) {
    throw createHttpError('No updates supplied', 400)
  }

  const updates = {}

  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      throw createHttpError('title must be a non-empty string', 400)
    }

    if (title.trim().length > 255) {
      throw createHttpError('title must be 255 characters or fewer', 400)
    }

    updates.title = title.trim()
  }

  if (description !== undefined) {
    updates.description = description
  }

  if (assigneeId !== undefined) {
    if (assigneeId !== null) {
      await assertAssigneeExists(assigneeId)
      assertAssigneeIsParticipant(assigneeId, participants)
    }

    updates.assigneeId = assigneeId
  }

  if (dueDate !== undefined) {
    updates.dueDate = dueDate
  }

  if (status !== undefined) {
    if (!ALLOWED_STATUSES.includes(status)) {
      throw createHttpError(`Invalid status: ${status}`, 400)
    }

    updates.status = status
  }

  if (priority !== undefined) {
    if (!ALLOWED_PRIORITIES.includes(priority)) {
      throw createHttpError(`Invalid priority: ${priority}`, 400)
    }

    updates.priority = priority
  }

  const actionItem = await updateOne(itemId, updates)

  return { actionItem }
}

export const deleteActionItem = async (itemId, callerId) => {
  const existing = await loadActionItemOrThrow(itemId)
  const meeting = await loadMeetingOrThrow(existing.meetingId)
  const participants = await listParticipantsByMeeting(existing.meetingId)
  assertIsParticipant(meeting, callerId, participants)

  await removeActionItemRow(itemId)
}
