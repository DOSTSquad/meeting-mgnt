import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { getActionItemPage } from '../src/features/action-items/actionItemPagination.js'

let vite
let ActionItemsSummary
before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  })
  const module = await vite.ssrLoadModule('/src/features/action-items/ActionItemsSummary.jsx')
  ActionItemsSummary = module.ActionItemsSummary
})
after(async () => {
  await vite?.close()
})

test('summary charts and counts exclude completed and cancelled work', () => {
  const active = [
    { status: 'todo', priority: 'high' },
    { status: 'in_progress', priority: 'medium' },
  ]
  const closed = [
    { status: 'completed', priority: 'high', dueDate: '2000-01-01' },
    { status: 'cancelled', priority: 'low', dueDate: '2000-01-01' },
  ]
  const render = (items) =>
    renderToStaticMarkup(createElement(ActionItemsSummary, { actionItems: items }))
  assert.equal(render([...active, ...closed]), render(active))
  assert.equal(render(closed), render([]))
  assert.ok(render(active).includes('2 active action items by status'))
  assert.ok(!render(active).includes('completed'))
})

test('pagination shows ten per page with no omissions or repeats and a partial last page', () => {
  const items = Array.from({ length: 23 }, (_, id) => ({ id }))
  const pages = [1, 2, 3].map((page) => getActionItemPage(items, page))
  assert.deepEqual(
    pages.map((page) => page.items.length),
    [10, 10, 3]
  )
  assert.deepEqual(
    pages.flatMap((page) => page.items),
    items
  )
  assert.deepEqual(
    pages.map(({ start, end }) => [start, end]),
    [
      [1, 10],
      [11, 20],
      [21, 23],
    ]
  )
  assert.equal(pages[2].pageCount, 3)
})

test('pagination handles empty results, exact boundaries, and shrinking filtered results', () => {
  assert.deepEqual(getActionItemPage([], 5), { items: [], page: 1, pageCount: 1, start: 0, end: 0 })
  const items = Array.from({ length: 20 }, (_, id) => ({ id }))
  assert.equal(getActionItemPage(items, 3).page, 2)
  assert.equal(getActionItemPage(items, 2).items.length, 10)
  assert.equal(getActionItemPage(items.slice(0, 3), 2).page, 1)
  assert.deepEqual(getActionItemPage(items.slice(0, 3), 2).items, items.slice(0, 3))
})
