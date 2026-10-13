import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const controllerPath = fileURLToPath(
  new URL('../src/features/meetings/useMeetingDetailController.js', import.meta.url)
)

test('meeting detail controller exposes the meeting status updater used by App', async () => {
  const source = await readFile(controllerPath, 'utf8')
  const returnBlock = source.slice(source.lastIndexOf('return {'))

  assert.match(source, /const updateMeetingStatus = useCallback\(/)
  assert.match(returnBlock, /\bupdateMeetingStatus,\s/)
})

test('meeting detail controller exposes participant add and remove handlers used by App', async () => {
  const source = await readFile(controllerPath, 'utf8')
  const returnBlock = source.slice(source.lastIndexOf('return {'))

  assert.match(source, /const addParticipant = useCallback\(/)
  assert.match(source, /await addMeetingParticipants\(getApiClient\(token\), selectedMeetingId,/)
  assert.match(source, /const removeParticipant = useCallback\(/)
  assert.match(
    source,
    /await removeMeetingParticipant\(getApiClient\(token\), selectedMeetingId, userId\)/
  )
  assert.match(source, /participants: \[\s*\.\.\.prev\.participants,/)
  assert.match(source, /participants: prev\.participants\.filter\(/)
  assert.match(returnBlock, /\baddParticipant,\s/)
  assert.match(returnBlock, /\bremoveParticipant,\s/)
})
