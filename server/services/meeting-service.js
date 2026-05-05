import {
  createMeeting,
  deleteMeeting,
  findMeetingById,
  listMeetings,
  updateMeeting,
} from '../repositories/meeting-repository.js'
import { bulkUpsert } from '../repositories/participant-repository.js'
import { listByMeeting } from '../repositories/participant-repository.js'
import { createTag, findTagByName } from '../repositories/tag-repository.js'

const createHttpError = (message, statusCode) => {
  const error = new Error(message)
  error.statusCode = statusCode

  return error
}

export const ALLOWED_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled', 'archived']

const ALLOWED_TRANSITIONS = {
  scheduled: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: ['archived'],
  cancelled: ['archived'],
  archived: [],
}

const assertValidTransition = (from, to) => {
  if (from === to) {
    return
  }

  const allowed = ALLOWED_TRANSITIONS[from] ?? []

  if (!allowed.includes(to)) {
    throw createHttpError(`Invalid status transition: ${from} → ${to}`, 400)
  }
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

const toDate = (value) => (value instanceof Date ? value : new Date(value))

const validateTimeRange = (startsAt, endsAt) => {
  const start = toDate(startsAt)
  const end = toDate(endsAt)

  if (!(end > start)) {
    throw createHttpError('endsAt must be after startsAt', 400)
  }
}

export const createMeetingForUser = async (input, userId) => {
  if (!userId) {
    throw createHttpError('Authentication required', 401)
  }

  const {
    title,
    description,
    startsAt,
    endsAt,
    timezoneName = 'UTC',
    location,
    status,
    tag,
  } = input

  if (!title || !title.trim()) {
    throw createHttpError('Title is required', 400)
  }

  if (!startsAt || !endsAt) {
    throw createHttpError('startsAt and endsAt are required', 400)
  }

  validateTimeRange(startsAt, endsAt)
  validateTimezone(timezoneName)

  if (status && !ALLOWED_STATUSES.includes(status)) {
    throw createHttpError(`Invalid status: ${status}`, 400)
  }

  let tagId = null
  if (tag !== undefined && tag !== null && String(tag).trim()) {
    const existingTag = await findTagByName(String(tag))
    tagId = existingTag ? existingTag.id : (await createTag(String(tag))).id
  }

  const meeting = await createMeeting({
    title,
    description: description ?? null,
    startsAt: toDate(startsAt),
    endsAt: toDate(endsAt),
    timezoneName,
    location: location ?? null,
    status: status ?? 'scheduled',
    tagId,
    createdBy: userId,
  })

  await bulkUpsert({
    meetingId: meeting.id,
    userIds: [userId],
    role: 'organizer',
    addedBy: userId,
  })

  return meeting
}

export const getMeetingById = async (id) => {
  const meeting = await findMeetingById(id)

  if (!meeting) {
    throw createHttpError('Meeting not found', 404)
  }

  const participants = await listByMeeting(id)

  return { ...meeting, participants }
}

export const updateMeetingById = async (id, input) => {
  const existing = await findMeetingById(id)

  if (!existing) {
    throw createHttpError('Meeting not found', 404)
  }

  const updates = {}

  for (const field of [
    'title',
    'description',
    'startsAt',
    'endsAt',
    'timezoneName',
    'location',
    'status',
    'tag',
  ]) {
    if (input[field] !== undefined) {
      updates[field] = input[field]
    }
  }

  if (updates.timezoneName !== undefined) {
    validateTimezone(updates.timezoneName)
  }

  if (updates.tag !== undefined) {
    const tagValue = updates.tag
    if (tagValue === null || String(tagValue).trim() === '') {
      updates.tagId = null
    } else {
      const existingTag = await findTagByName(String(tagValue))
      updates.tagId = existingTag ? existingTag.id : (await createTag(String(tagValue))).id
    }
    delete updates.tag
  }

  if (updates.status !== undefined) {
    if (!ALLOWED_STATUSES.includes(updates.status)) {
      throw createHttpError(`Invalid status: ${updates.status}`, 400)
    }

    assertValidTransition(existing.status, updates.status)
  }

  const startsAt = updates.startsAt ?? existing.startsAt
  const endsAt = updates.endsAt ?? existing.endsAt

  if (updates.startsAt !== undefined || updates.endsAt !== undefined) {
    validateTimeRange(startsAt, endsAt)
  }

  if (updates.startsAt !== undefined) {
    updates.startsAt = toDate(updates.startsAt)
  }

  if (updates.endsAt !== undefined) {
    updates.endsAt = toDate(updates.endsAt)
  }

  return updateMeeting(id, updates)
}

export const deleteMeetingById = async (id) => {
  const removed = await deleteMeeting(id)

  if (!removed) {
    throw createHttpError('Meeting not found', 404)
  }
}

export const listMeetingsForQuery = async ({
  userId,
  page = 1,
  limit = 20,
  from,
  to,
  status,
  q,
} = {}) => {
  if (!userId) {
    throw createHttpError('Authentication required', 401)
  }

  if (status && !ALLOWED_STATUSES.includes(status)) {
    throw createHttpError(`Invalid status: ${status}`, 400)
  }

  const trimmedQ = typeof q === 'string' ? q.trim() : undefined

  if (trimmedQ !== undefined && trimmedQ.length > 200) {
    throw createHttpError('q must be 200 characters or fewer', 400)
  }

  return listMeetings({
    userId,
    page,
    limit,
    from: from ? toDate(from) : undefined,
    to: to ? toDate(to) : undefined,
    status,
    q: trimmedQ && trimmedQ.length > 0 ? trimmedQ : undefined,
  })
}
