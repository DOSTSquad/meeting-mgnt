import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getNotificationPath } from '../src/features/notifications/notificationTarget.js'

test('meeting change-request notifications open the detail without a blocking inbox modal', () => {
  assert.equal(
    getNotificationPath({
      entityType: 'meeting',
      entityId: 'meeting-1',
      type: 'meeting_change_requested',
    }),
    '/meetings/meeting-1'
  )
})

test('notification paths preserve the existing action-item and invitation targets', () => {
  assert.equal(
    getNotificationPath({ entityType: 'action_item', entityId: 'action-item-1' }),
    '/action-items?item=action-item-1'
  )
  assert.equal(
    getNotificationPath({
      entityType: 'meeting_request',
      entityId: 'request-1',
      type: 'meeting_request_invited',
    }),
    '/dashboard'
  )
})
