import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let vite
let MeetingDetailView
let RemoveRecordingDialog
let formatDateOnly

before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  })
  const module = await vite.ssrLoadModule('/src/features/meetings/MeetingDetailView.jsx')
  MeetingDetailView = module.MeetingDetailView
  RemoveRecordingDialog = (
    await vite.ssrLoadModule('/src/features/meetings/RemoveRecordingDialog.jsx')
  ).RemoveRecordingDialog
  formatDateOnly = (await vite.ssrLoadModule('/src/utils/date.js')).formatDateOnly
})

after(async () => {
  await vite?.close()
})

const REMOVE_DIALOG_TITLE = 'Remove recording?'
const CONSENT_TEXT =
  'I confirm every participant has been told about, and agreed to, this recording.'
const UPLOADED_AT = '2026-05-01T10:00:00Z'
const CONSENT_AT = '2026-05-01T09:58:00Z'

const buildRecording = (consentConfirmedAt) => ({
  id: 'recording',
  fileName: 'standup.m4a',
  sizeBytes: 2048,
  status: 'uploaded',
  createdAt: UPLOADED_AT,
  consentConfirmedAt,
})

const render = ({ recording, canManageMeeting = true, pendingRecordingFile = null } = {}) =>
  renderToStaticMarkup(
    createElement(MeetingDetailView, {
      currentUserId: 'owner',
      canManageMeeting,
      pendingMaterialFiles: [],
      pendingRecordingFile,
      detail: {
        meeting: {
          id: 'meeting',
          ownerId: 'owner',
          title: 'Planning',
          status: 'scheduled',
          startsAt: '2099-01-01T10:00:00Z',
          endsAt: '2099-01-01T11:00:00Z',
        },
        participants: [{ userId: 'owner', name: 'Meeting Owner', role: 'organizer' }],
        files: [],
        actionItems: [],
        recording,
      },
    })
  )

test('without a recording the consent checkbox sits directly above the upload dropzone', () => {
  const html = render()

  assert.ok(html.includes(CONSENT_TEXT))
  assert.ok(html.includes('Upload optional recording'))
  assert.ok(html.indexOf(CONSENT_TEXT) < html.indexOf('Upload optional recording'))
  assert.ok(html.includes('Required before you can upload a recording.'))
  assert.ok(!html.includes('replace'))
})

test('with a recording there is no consent checkbox and no Replace button', () => {
  const html = render({ recording: buildRecording(CONSENT_AT) })

  assert.ok(html.includes('standup.m4a'))
  assert.ok(html.includes('Process Recording'))
  assert.ok(html.includes('Remove'))
  assert.ok(!html.includes(CONSENT_TEXT))
  assert.ok(!html.includes('Replace'))
  assert.ok(!html.includes('Upload optional recording'))
})

test('the recording card shows when consent was confirmed, using the upload date format', () => {
  const html = render({ recording: buildRecording(CONSENT_AT) })

  assert.ok(
    html.includes(
      `Uploaded ${formatDateOnly(UPLOADED_AT)} · 2 KB · Consent confirmed ${formatDateOnly(CONSENT_AT)}`
    )
  )
})

test('a recording from before consent existed shows no consent text', () => {
  const html = render({ recording: buildRecording(null) })

  assert.ok(html.includes(`Uploaded ${formatDateOnly(UPLOADED_AT)}`))
  assert.ok(!html.includes('Consent confirmed'))
})

test('members who cannot manage the meeting never see the consent checkbox', () => {
  assert.ok(!render({ canManageMeeting: false }).includes(CONSENT_TEXT))
  assert.ok(
    !render({ canManageMeeting: false, recording: buildRecording(CONSENT_AT) }).includes(
      CONSENT_TEXT
    )
  )
})

test('the consent checkbox is hidden while an upload is in flight', () => {
  const html = render({ pendingRecordingFile: { name: 'standup.m4a' } })

  assert.ok(!html.includes(CONSENT_TEXT))
  assert.ok(!html.includes('Upload optional recording'))
})

test('the card renders no remove dialog until Remove is clicked', () => {
  const html = render({ recording: buildRecording(CONSENT_AT) })

  assert.match(html, /aria-haspopup="dialog"[^>]*>Remove<\/button>/)
  assert.ok(!html.includes('remove-recording-title'))
  assert.ok(!html.includes(REMOVE_DIALOG_TITLE))
})

const renderDialog = (isRemoving) =>
  renderToStaticMarkup(
    createElement(RemoveRecordingDialog, {
      fileName: 'standup.m4a',
      isRemoving,
      onConfirm: () => {},
      onClose: () => {},
    })
  )

test('the remove dialog names the file and what is deleted with it', () => {
  const html = renderDialog(false)

  assert.match(html, /<dialog[^>]*aria-labelledby="remove-recording-title"/)
  assert.match(html, /<h2 id="remove-recording-title"[^>]*>Remove recording\?<\/h2>/)
  assert.ok(html.includes('standup.m4a'))
  assert.ok(html.includes('transcript and AI analysis'))
  assert.ok(html.includes('This cannot be undone.'))
  assert.ok(html.includes('aria-label="Close remove recording"'))
})

test('the remove dialog offers Cancel and a red Remove recording button, both enabled', () => {
  const html = renderDialog(false)

  assert.ok(html.indexOf('>Cancel</button>') < html.indexOf('>Remove recording</button>'))
  assert.ok(html.includes('bg-rose-600'))
  assert.ok(!html.includes('disabled=""'))
})

test('while the removal request is in flight every dialog button is disabled', () => {
  const html = renderDialog(true)

  assert.equal(html.split('disabled=""').length - 1, 3)
  assert.ok(html.includes('>Removing...</button>'))
  assert.ok(!html.includes('>Remove recording</button>'))
})
