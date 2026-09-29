import { describe, expect, it } from '@jest/globals'

import {
  ACCOUNT_ROLES,
  ACTIONS,
  MEETING_ROLES,
  assertCan,
  can,
  getMeetingRole,
} from '../services/permissions.js'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const ORGANIZER_ID = '22222222-2222-4222-8222-222222222222'
const ATTENDEE_ID = '33333333-3333-4333-8333-333333333333'
const OPTIONAL_ID = '44444444-4444-4444-8444-444444444444'
const OUTSIDER_ID = '55555555-5555-4555-8555-555555555555'
const ADMIN_ID = '66666666-6666-4666-8666-666666666666'

const meeting = { id: 'meeting-1', ownerId: OWNER_ID }
const participants = [
  { userId: ORGANIZER_ID, role: 'organizer' },
  { userId: ATTENDEE_ID, role: 'attendee' },
  { userId: OPTIONAL_ID, role: 'optional' },
]

const callers = {
  admin: { callerId: ADMIN_ID, callerRole: 'admin' },
  owner: { callerId: OWNER_ID, callerRole: 'staff' },
  organizer: { callerId: ORGANIZER_ID, callerRole: 'staff' },
  attendee: { callerId: ATTENDEE_ID, callerRole: 'staff' },
  optional: { callerId: OPTIONAL_ID, callerRole: 'staff' },
  outsider: { callerId: OUTSIDER_ID, callerRole: 'staff' },
}

const context = (caller, extra = {}) => ({ ...callers[caller], meeting, participants, ...extra })

const expectedAllowedCallers = {
  'meeting:view': ['admin', 'owner', 'organizer', 'attendee', 'optional'],
  'meeting:manage': ['admin', 'owner', 'organizer'],
  'actionItem:list': ['admin', 'owner', 'organizer', 'attendee', 'optional'],
  'actionItem:create': ['admin', 'owner', 'organizer', 'attendee', 'optional'],
  'actionItem:delete': ['admin', 'owner', 'organizer', 'attendee', 'optional'],
  'actionItem:view': ['admin', 'owner', 'organizer', 'attendee', 'optional'],
  'actionItem:update': ['admin', 'owner', 'organizer', 'attendee', 'optional'],
}

describe('role definitions', () => {
  it('lists the account and meeting roles', () => {
    expect(ACCOUNT_ROLES).toEqual(['staff', 'admin'])
    expect(MEETING_ROLES).toEqual(['owner', 'organizer', 'attendee', 'optional'])
  })

  it('has a rule for every asserted action', () => {
    expect(Object.keys(ACTIONS).sort()).toEqual(
      [...Object.keys(expectedAllowedCallers), 'user:manage'].sort()
    )
  })
})

describe('getMeetingRole', () => {
  it.each([
    ['owner', 'owner'],
    ['organizer', 'organizer'],
    ['attendee', 'attendee'],
    ['optional', 'optional'],
    ['outsider', null],
  ])('resolves %s to %s', (caller, expected) => {
    expect(getMeetingRole(context(caller))).toBe(expected)
  })

  it('does not derive a meeting role from the account role', () => {
    expect(getMeetingRole(context('admin'))).toBeNull()
  })

  it('prefers owner over a stored participant role', () => {
    const ownerAsOrganizer = [{ userId: OWNER_ID, role: 'organizer' }, ...participants]

    expect(getMeetingRole({ ...callers.owner, meeting, participants: ownerAsOrganizer })).toBe(
      'owner'
    )
  })

  it('returns null without a meeting or caller', () => {
    expect(getMeetingRole({ callerId: OWNER_ID })).toBeNull()
    expect(getMeetingRole({ meeting, participants })).toBeNull()
  })
})

describe('can', () => {
  describe.each(Object.entries(expectedAllowedCallers))('%s', (action, allowed) => {
    it.each(Object.keys(callers))('%s', (caller) => {
      expect(can(action, context(caller))).toBe(allowed.includes(caller))
    })
  })

  describe('user:manage', () => {
    it('is limited to admin accounts', () => {
      expect(can('user:manage', { callerId: ADMIN_ID, callerRole: 'admin' })).toBe(true)
      expect(can('user:manage', { callerId: OWNER_ID, callerRole: 'staff' })).toBe(false)
    })
  })

  describe('assignee relation', () => {
    const actionItem = { assigneeId: OUTSIDER_ID }

    it('lets a non-participant assignee view their action item', () => {
      expect(can('actionItem:view', context('outsider', { actionItem }))).toBe(true)
    })

    it('lets a non-participant assignee change only status', () => {
      expect(
        can('actionItem:update', context('outsider', { actionItem, changedFields: ['status'] }))
      ).toBe(true)
    })

    it('rejects a non-participant assignee changing anything else', () => {
      expect(
        can(
          'actionItem:update',
          context('outsider', { actionItem, changedFields: ['status', 'title'] })
        )
      ).toBe(false)
      expect(
        can('actionItem:update', context('outsider', { actionItem, changedFields: ['title'] }))
      ).toBe(false)
      expect(can('actionItem:update', context('outsider', { actionItem }))).toBe(false)
    })

    it('does not extend the assignee relation to list, create or delete', () => {
      for (const action of ['actionItem:list', 'actionItem:create', 'actionItem:delete']) {
        expect(can(action, context('outsider', { actionItem }))).toBe(false)
      }
    })

    it('does not treat other callers as the assignee', () => {
      expect(
        can('actionItem:view', context('outsider', { actionItem: { assigneeId: ADMIN_ID } }))
      ).toBe(false)
    })
  })

  it('throws on an unknown action', () => {
    expect(() => can('meeting:teleport', context('owner'))).toThrow(
      'Unknown permission action: meeting:teleport'
    )
  })
})

describe('assertCan', () => {
  it('returns without throwing when allowed', () => {
    expect(() => assertCan('meeting:manage', context('organizer'), 'nope')).not.toThrow()
  })

  it('throws 403 with the supplied message when denied', () => {
    expect.assertions(2)

    try {
      assertCan('meeting:manage', context('attendee'), 'Only organizers can do this')
    } catch (error) {
      expect(error.statusCode).toBe(403)
      expect(error.message).toBe('Only organizers can do this')
    }
  })

  it('throws 401 when there is no caller', () => {
    expect.assertions(2)

    try {
      assertCan('meeting:view', { callerId: undefined, callerRole: 'admin', meeting, participants })
    } catch (error) {
      expect(error.statusCode).toBe(401)
      expect(error.message).toBe('Authentication required')
    }
  })
})
