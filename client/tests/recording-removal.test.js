import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isRemoveDialogOpen } from '../src/features/meetings/recordingRemoval.js'

test('the dialog is open only for the recording it was opened on', () => {
  assert.equal(isRemoveDialogOpen({ id: 'a' }, 'a'), true)
})

test('the dialog closes when the recording is replaced by another one', () => {
  assert.equal(isRemoveDialogOpen({ id: 'b' }, 'a'), false)
})

test('the dialog closes when the recording is removed', () => {
  assert.equal(isRemoveDialogOpen(null, 'a'), false)
  assert.equal(isRemoveDialogOpen(undefined, 'a'), false)
})

test('the dialog stays closed until Remove is clicked', () => {
  assert.equal(isRemoveDialogOpen({ id: 'a' }, null), false)
  assert.equal(isRemoveDialogOpen({}, null), false)
})
