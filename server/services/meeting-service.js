import {
  createMeeting,
  deleteMeeting,
  findMeetingById,
  listMeetings,
  updateMeeting,
} from '../repositories/meeting-repository.js'

const createHttpError = (message, statusCode) => {
  const error = new Error(message)
  error.statusCode = statusCode

  return error
}

export const ALLOWED_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled']

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
    department,
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

  return createMeeting({
    title,
    description: description ?? null,
    startsAt: toDate(startsAt),
    endsAt: toDate(endsAt),
    timezoneName,
    location: location ?? null,
    status: status ?? 'scheduled',
    department: department ?? null,
    createdBy: userId,
  })
}

export const getMeetingById = async (id) => {
  const meeting = await findMeetingById(id)

  if (!meeting) {
    throw createHttpError('Meeting not found', 404)
  }

  return meeting
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
    'department',
  ]) {
    if (input[field] !== undefined) {
      updates[field] = input[field]
    }
  }

  if (updates.timezoneName !== undefined) {
    validateTimezone(updates.timezoneName)
  }

  if (updates.status !== undefined && !ALLOWED_STATUSES.includes(updates.status)) {
    throw createHttpError(`Invalid status: ${updates.status}`, 400)
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
  page = 1,
  limit = 20,
  from,
  to,
  status,
  department,
} = {}) => {
  if (status && !ALLOWED_STATUSES.includes(status)) {
    throw createHttpError(`Invalid status: ${status}`, 400)
  }

  return listMeetings({
    page,
    limit,
    from: from ? toDate(from) : undefined,
    to: to ? toDate(to) : undefined,
    status,
    department,
  })
}
