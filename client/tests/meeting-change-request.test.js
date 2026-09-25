import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let vite
let MeetingDetailView

before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  })
  const module = await vite.ssrLoadModule('/src/features/meetings/MeetingDetailView.jsx')
  MeetingDetailView = module.MeetingDetailView
})

after(async () => {
  await vite?.close()
})

const render = (
  currentUserId,
  canManageMeeting = false,
  inbox = { items: [], status: 'ready', error: '' }
) =>
  renderToStaticMarkup(
    createElement(MeetingDetailView, {
      currentUserId,
      changeRequestInbox: inbox,
      canManageMeeting,
      pendingMaterialFiles: [],
      detail: {
        meeting: {
          id: 'meeting',
          ownerId: 'owner',
          title: 'Planning',
          status: 'scheduled',
          startsAt: '2099-01-01T10:00:00Z',
          endsAt: '2099-01-01T11:00:00Z',
        },
        participants: [
          { userId: 'owner', name: 'Meeting Owner', role: 'organizer' },
          { userId: 'attendee', name: 'Invited Attendee', role: 'attendee' },
          { userId: 'optional', name: 'Optional Attendee', role: 'optional' },
        ],
        files: [],
        actionItems: [],
      },
    })
  )

test('attendees and optional participants see Request to change beside the review control', () => {
  for (const userId of ['attendee', 'optional']) {
    const html = render(userId)
    assert.ok(html.includes('Request to change'))
    assert.ok(html.includes('Mark meeting detail as reviewed'))
    assert.ok(!html.includes('Read change requests from'))
  }
})

test('only the owner sees an inbox button beside Send review request and a closed dialog', () => {
  const ownerHtml = render('owner', true)
  assert.ok(ownerHtml.includes('aria-label="Change requests, 0 unread messages"'))
  assert.ok(ownerHtml.indexOf('Send review request') < ownerHtml.indexOf('aria-haspopup="dialog"'))
  assert.match(ownerHtml, /<dialog[^>]*aria-labelledby="change-inbox-title"/)
  assert.doesNotMatch(ownerHtml, /<dialog[^>]*\bopen(?:=|\s|>)/)
  assert.ok(ownerHtml.includes('No change requests yet.'))
  assert.ok(!ownerHtml.includes('Read change requests from'))
  assert.ok(!ownerHtml.includes('Request to change'))
  const adminHtml = render('admin', true)
  assert.ok(!adminHtml.includes('Change request inbox'))
  assert.ok(!adminHtml.includes('Request to change'))
  assert.ok(!render('outsider').includes('Request to change'))
})

test('owner inbox displays all messages without changing attendee review status', () => {
  const inbox = {
    status: 'ready',
    error: '',
    items: [
      {
        id: 'request-2',
        userId: 'attendee',
        senderName: 'Invited Attendee',
        message: 'Change the location',
        createdAt: '2026-09-25T10:00:00Z',
      },
      {
        id: 'request-1',
        userId: 'attendee',
        senderName: 'Invited Attendee',
        message: 'Move the meeting <script>alert(1)</script>',
        createdAt: '2026-09-24T10:00:00Z',
      },
    ],
  }
  const html = render('owner', true, inbox)
  assert.ok(html.includes('aria-label="Change requests, 2 unread messages"'))
  assert.ok(html.includes('Close change request inbox'))
  assert.ok(html.includes('Change the location'))
  assert.ok(html.includes('Move the meeting &lt;script&gt;'))
  assert.ok(!html.includes('Request for changing'))
  assert.ok(html.includes('0/2 reviewed'))
  assert.ok(html.includes('Not reviewed'))
  assert.ok(!render('admin', true, inbox).includes('Change the location'))
  assert.ok(!render('attendee', false, inbox).includes('Change the location'))
})
test('inbox renders loading and retryable errors', () => {
  assert.ok(
    render('owner', true, { items: [], status: 'loading', error: '' }).includes(
      'Loading messages...'
    )
  )
  const html = render('owner', true, {
    items: [],
    status: 'error',
    error: 'Unable to load change requests.',
  })
  assert.ok(html.includes('Use Refresh to try again.'))
  assert.ok(!html.includes('No change requests yet.'))
})

test('reviewed attendees remain reviewed and counted after sending a change request', () => {
  const previousWindow = globalThis.window
  globalThis.window = {
    localStorage: {
      getItem: (key) => (key === 'meeting-confirmation:meeting:attendee:confirmed' ? '1' : null),
    },
  }
  try {
    const html = render('owner', true, {
      status: 'ready',
      error: '',
      items: [
        {
          id: 'request-1',
          userId: 'attendee',
          senderName: 'Invited Attendee',
          message: 'Please change the location',
          createdAt: '2026-09-25T10:00:00Z',
        },
      ],
    })
    assert.ok(html.includes('1/2 reviewed'))
    assert.ok(html.includes('Reviewed'))
    assert.ok(html.includes('Not reviewed'))
    assert.ok(!html.includes('Request for changing'))
    assert.ok(html.includes('Please change the location'))
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})

test('badge counts only unread requests, disappears when all read, and messages sort newest first', () => {
  const older = {
    id: 'older',
    userId: 'attendee',
    senderName: 'Invited Attendee',
    message: 'Older message',
    createdAt: '2026-09-24T10:00:00Z',
    readAt: null,
  }
  const newer = {
    ...older,
    id: 'newer',
    message: 'Newer message',
    createdAt: '2026-09-25T10:00:00Z',
    readAt: '2026-09-25T11:00:00Z',
  }
  const html = render('owner', true, { items: [older, newer], status: 'ready', error: '' })
  assert.ok(html.includes('Change requests, 1 unread messages'))
  assert.ok(html.indexOf('Newer message') < html.indexOf('Older message'))
  assert.equal(html.split('Mark as read').length - 1, 1)
  assert.ok(!html.includes('lucide-bell'))
  const allRead = render('owner', true, {
    items: [{ ...older, readAt: newer.readAt }, newer],
    status: 'ready',
    error: '',
  })
  assert.ok(allRead.includes('Change requests, 0 unread messages'))
  assert.ok(!allRead.includes('motion-safe:animate-pulse'))
  assert.ok(!allRead.includes('Mark as read'))
  assert.ok(allRead.includes('Older message'))
})
