export const ACCOUNT_ROLES = ['staff', 'admin']
export const MEETING_ROLES = ['owner', 'organizer', 'attendee', 'optional']

const MANAGER_MEETING_ROLES = ['owner', 'organizer']

const isAssignee = ({ callerId, actionItem }) =>
  Boolean(callerId) && actionItem?.assigneeId === callerId

const changesOnlyStatus = ({ changedFields = [] }) =>
  changedFields.length === 1 && changedFields[0] === 'status'

const viewRule = { account: ['admin'], meeting: MEETING_ROLES }

// A caller is allowed when their account role, their meeting role, or the optional
// relation predicate (assignee, ...) matches the action's rule.
export const ACTIONS = {
  'user:manage': { account: ['admin'], meeting: [] },
  'meeting:view': viewRule,
  'meeting:manage': { account: ['admin'], meeting: MANAGER_MEETING_ROLES },
  'actionItem:list': viewRule,
  'actionItem:create': viewRule,
  'actionItem:delete': viewRule,
  'actionItem:view': { ...viewRule, relation: isAssignee },
  'actionItem:update': {
    ...viewRule,
    relation: (context) => isAssignee(context) && changesOnlyStatus(context),
  },
}

const createHttpError = (message, statusCode) => {
  const error = new Error(message)
  error.statusCode = statusCode

  return error
}

export const getMeetingRole = ({ callerId, meeting, participants = [] }) => {
  if (!callerId || !meeting) {
    return null
  }

  if (meeting.ownerId === callerId) {
    return 'owner'
  }

  const participant = participants.find((candidate) => candidate.userId === callerId)

  return participant?.role ?? null
}

export const can = (action, context) => {
  const rule = ACTIONS[action]

  if (!rule) {
    throw new Error(`Unknown permission action: ${action}`)
  }

  if (rule.account.includes(context.callerRole)) {
    return true
  }

  if (rule.meeting.includes(getMeetingRole(context))) {
    return true
  }

  return Boolean(rule.relation?.(context))
}

export const assertCan = (action, context, message = 'Forbidden') => {
  if (!context.callerId) {
    throw createHttpError('Authentication required', 401)
  }

  if (!can(action, context)) {
    throw createHttpError(message, 403)
  }
}
