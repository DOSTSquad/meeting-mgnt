import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  AI_STATUS_POLL_INTERVAL_MS,
  getAiStatusLabel,
  shouldPollAiStatus,
} from '../src/features/meetings/aiStatus.js'

const meeting = (aiStatus) => ({ id: String(aiStatus), aiStatus })

test('labels processing and failed statuses and nothing else', () => {
  assert.equal(getAiStatusLabel('processing'), 'Generating minutes…')
  assert.equal(getAiStatusLabel('failed'), 'Minutes generation failed')
  assert.equal(getAiStatusLabel(null), null)
  assert.equal(getAiStatusLabel(undefined), null)
  assert.equal(getAiStatusLabel('ready_for_review'), null)
})

test('polls the meeting list only while some meeting is processing', () => {
  assert.equal(
    shouldPollAiStatus({
      isMeetingListShown: true,
      meetings: [meeting(null), meeting('processing')],
    }),
    true
  )
  assert.equal(
    shouldPollAiStatus({ isMeetingListShown: true, meetings: [meeting(null), meeting('failed')] }),
    false
  )
  assert.equal(shouldPollAiStatus({ isMeetingListShown: true, meetings: [] }), false)
})

test('does not poll when the meeting list is not on screen', () => {
  assert.equal(
    shouldPollAiStatus({ isMeetingListShown: false, meetings: [meeting('processing')] }),
    false
  )
})

test('tolerates meetings without aiStatus and a missing list', () => {
  assert.equal(
    shouldPollAiStatus({ isMeetingListShown: true, meetings: [{ id: 'legacy' }] }),
    false
  )
  assert.equal(shouldPollAiStatus({ isMeetingListShown: true, meetings: undefined }), false)
})

test('polls every 15 seconds', () => {
  assert.equal(AI_STATUS_POLL_INTERVAL_MS, 15000)
})
