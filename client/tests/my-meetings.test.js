import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let vite
let MyMeetingsView
before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  })
  const module = await vite.ssrLoadModule('/src/features/meetings/MyMeetingsView.jsx')
  MyMeetingsView = module.MyMeetingsView
})
after(async () => {
  await vite?.close()
})

const renderMeetings = (count) =>
  renderToStaticMarkup(
    createElement(MyMeetingsView, {
      meetings: Array.from({ length: count }, (_, index) => ({
        id: String(index),
        title: `Meeting ${index + 1}`,
        startsAt: new Date(Date.UTC(2099, 0, index + 1)).toISOString(),
        endsAt: new Date(Date.UTC(2099, 0, index + 1, 1)).toISOString(),
        status: 'scheduled',
      })),
      currentUser: { id: 'owner', name: 'Owner' },
    })
  )

test('owner page shows only ten meetings, newest first, with pagination', () => {
  const html = renderMeetings(23)
  assert.equal((html.match(/<details\b/g) || []).length, 10)
  assert.ok(html.includes('Meeting 23'))
  assert.ok(html.includes('Meeting 14'))
  assert.ok(!html.includes('Meeting 13'))
  assert.ok(html.indexOf('Meeting 23') < html.indexOf('Meeting 14'))
  assert.ok(html.includes('Meeting owner pagination'))
  assert.match(html, /<button[^>]*disabled=""[^>]*>Previous<\/button>/)
  assert.match(html, /<button(?![^>]*disabled=)[^>]*>Next<\/button>/)
})

test('empty and single-page results do not show pagination', () => {
  for (const count of [0, 1, 10]) {
    const html = renderMeetings(count)
    assert.equal((html.match(/<details\b/g) || []).length, count)
    assert.ok(!html.includes('Meeting owner pagination'))
  }
  assert.ok(renderMeetings(0).includes('No matching meetings found.'))
})
