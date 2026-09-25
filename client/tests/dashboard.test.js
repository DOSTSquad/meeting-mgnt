import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let vite
let DashboardView

before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  })
  const dashboardModule = await vite.ssrLoadModule('/src/features/dashboard/DashboardView.jsx')
  DashboardView = dashboardModule.DashboardView
})

after(async () => {
  await vite?.close()
})

test('new meeting requests appear only in Pending Meetings, including requests ready to confirm', () => {
  for (const canConfirm of [false, true]) {
    const html = renderToStaticMarkup(
      createElement(DashboardView, {
        currentUser: { id: 'owner' },
        data: {
          pendingMeetingRequests: [
            {
              id: 'request-1',
              title: 'New planning request',
              canConfirm,
              status: 'collecting',
              inviteeCounts: { submitted: 1, total: 1 },
            },
          ],
        },
      })
    )
    const pendingSection = html.split('Pending Meetings')[1].split('Pending to review')[0]
    const reviewSection = html.split('Pending to review')[1]
    assert.ok(pendingSection.includes('New planning request'))
    assert.ok(!reviewSection.includes('New planning request'))
    assert.ok(reviewSection.includes('No meetings waiting for review.'))
  }
})

test('invited participants still see meetings sent for review', () => {
  const previousWindow = globalThis.window
  globalThis.window = {
    localStorage: {
      getItem: (key) => (key === 'meeting-confirmation-sent' ? '["meeting-1"]' : null),
    },
  }
  try {
    const html = renderToStaticMarkup(
      createElement(DashboardView, {
        currentUser: { id: 'participant' },
        meetings: [
          {
            id: 'meeting-1',
            ownerId: 'owner',
            title: 'Meeting awaiting participant review',
            status: 'scheduled',
            startsAt: '2099-01-01T10:00:00Z',
            endsAt: '2099-01-01T11:00:00Z',
          },
        ],
      })
    )
    assert.ok(html.split('Pending to review')[1].includes('Meeting awaiting participant review'))
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})
