const buildUrl = ({ req, page, limit, baseQuery }) => {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(baseQuery)) {
    if (key === 'page' || key === 'limit') {
      continue
    }

    if (value === undefined || value === null) {
      continue
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, String(item))
      }
    } else {
      params.append(key, String(value))
    }
  }

  params.set('limit', String(limit))
  params.set('page', String(page))

  const host = req.get('host')
  const rawPath = `${req.baseUrl ?? ''}${req.path ?? ''}`
  const basePath = rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath

  return `${req.protocol}://${host}${basePath}?${params.toString()}`
}

export const buildLinkHeader = ({ req, page, limit, total }) => {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const baseQuery = { ...(req.query ?? {}) }

  const links = [
    `<${buildUrl({ req, page: 1, limit, baseQuery })}>; rel="first"`,
    `<${buildUrl({ req, page: totalPages, limit, baseQuery })}>; rel="last"`,
  ]

  if (page > 1) {
    links.push(`<${buildUrl({ req, page: page - 1, limit, baseQuery })}>; rel="prev"`)
  }

  if (page < totalPages) {
    links.push(`<${buildUrl({ req, page: page + 1, limit, baseQuery })}>; rel="next"`)
  }

  return links.join(', ')
}
