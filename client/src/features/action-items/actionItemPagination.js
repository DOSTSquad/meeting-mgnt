const PAGE_SIZE = 10

export const getActionItemPage = (items, requestedPage) => {
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const page = Math.max(1, Math.min(requestedPage, pageCount))
  const offset = (page - 1) * PAGE_SIZE
  return {
    items: items.slice(offset, offset + PAGE_SIZE),
    page,
    pageCount,
    start: items.length ? offset + 1 : 0,
    end: Math.min(offset + PAGE_SIZE, items.length),
  }
}
