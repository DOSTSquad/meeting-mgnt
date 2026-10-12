import assert from 'node:assert/strict'
import { test } from 'node:test'

import { updateTimeOptionDurations } from '../src/features/meetings/create/timeOptions.js'

test('changing the draft time preserves existing candidate starts on the same date', () => {
  const existingOption = {
    startsAt: '2030-04-15T01:00:00.000Z',
    endsAt: '2030-04-15T02:00:00.000Z',
    sortOrder: 0,
  }

  const updatedOptions = updateTimeOptionDurations([existingOption], {
    startTime: '10:00',
    durationMinutes: 90,
    timezoneName: 'Asia/Manila',
  })

  assert.deepEqual(updatedOptions, [
    {
      ...existingOption,
      endsAt: '2030-04-15T02:30:00.000Z',
    },
  ])
})
