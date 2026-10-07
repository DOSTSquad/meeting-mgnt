import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let vite
let RepositoryView

before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  })
  const module = await vite.ssrLoadModule('/src/features/meetings/RepositoryView.jsx')
  RepositoryView = module.RepositoryView
})

after(async () => {
  await vite?.close()
})

const buildMeeting = (title, aiStatus) => ({
  id: title,
  title,
  aiStatus,
  startsAt: '2099-01-01T10:00:00Z',
  endsAt: '2099-01-01T11:00:00Z',
  status: 'scheduled',
  ownerName: 'Owner',
  participantNames: ['Owner'],
  participantCount: 1,
  fileCount: 0,
  fileNames: [],
})

const render = (meetings) =>
  renderToStaticMarkup(
    createElement(RepositoryView, {
      meetings,
      search: '',
      onSearch: () => {},
      onOpenMeeting: () => {},
    })
  )

const rowFor = (html, title) => {
  const rows = html.split('<button type="button"').filter((chunk) => chunk.includes(title))
  assert.equal(rows.length, 1, `expected exactly one row for ${title}`)
  return rows[0]
}

test('shows a spinning blue loader beside a meeting whose minutes are generating', () => {
  const row = rowFor(render([buildMeeting('Planning', 'processing')]), 'Planning')

  assert.ok(row.includes('aria-label="Generating minutes…"'))
  assert.ok(row.includes('title="Generating minutes…"'))
  assert.ok(row.includes('animate-spin'))
  assert.ok(row.includes('text-blue-600'))
})

test('shows a red alert icon beside a meeting whose minutes generation failed', () => {
  const row = rowFor(render([buildMeeting('Retro', 'failed')]), 'Retro')

  assert.ok(row.includes('aria-label="Minutes generation failed"'))
  assert.ok(row.includes('text-rose-600'))
  assert.ok(!row.includes('animate-spin'))
})

test('shows no status icon when aiStatus is null or absent', () => {
  const absent = buildMeeting('Standup')
  delete absent.aiStatus
  const html = render([buildMeeting('Planning', null), absent])

  assert.ok(!html.includes('Generating minutes'))
  assert.ok(!html.includes('Minutes generation failed'))
  assert.ok(!html.includes('animate-spin'))
})

test('only the meetings with an in-flight or failed run get an icon', () => {
  const html = render([
    buildMeeting('Planning', 'processing'),
    buildMeeting('Retro', 'failed'),
    buildMeeting('Standup', null),
  ])

  assert.equal(html.split('aria-label="Generating minutes…"').length - 1, 1)
  assert.equal(html.split('aria-label="Minutes generation failed"').length - 1, 1)
  assert.ok(!rowFor(html, 'Standup').includes('role="img"'))
})
