import { describe, expect, it } from '@jest/globals'

import { createApp, getRateLimitConfig, isDevelopmentEnvironment } from '../app.js'

const closeServer = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })

const withTestServer = async (app, callback) => {
  const server = app.listen(0)

  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
    })

    const address = server.address()
    const baseUrl = `http://127.0.0.1:${address.port}`

    return await callback(baseUrl)
  } finally {
    await closeServer(server)
  }
}

describe('app environment gates', () => {
  it('enables development-only routes only in development', () => {
    expect(isDevelopmentEnvironment('development')).toBe(true)
    expect(isDevelopmentEnvironment('test')).toBe(false)
    expect(isDevelopmentEnvironment('production')).toBe(false)
    expect(isDevelopmentEnvironment()).toBe(process.env.NODE_ENV === 'development')
  })
})

describe('API rate limiting', () => {
  it('uses configured positive rate limit values with safe defaults', () => {
    expect(
      getRateLimitConfig({
        RATE_LIMIT_WINDOW_MS: '60000',
        RATE_LIMIT_MAX: '25',
      })
    ).toEqual({
      windowMs: 60000,
      limit: 25,
    })

    expect(
      getRateLimitConfig({
        RATE_LIMIT_WINDOW_MS: '0',
        RATE_LIMIT_MAX: 'not-a-number',
      })
    ).toEqual({
      windowMs: 900000,
      limit: 100,
    })
  })

  it('returns 429 after the API request limit is exceeded', async () => {
    const previousWindowMs = process.env.RATE_LIMIT_WINDOW_MS
    const previousMax = process.env.RATE_LIMIT_MAX

    process.env.RATE_LIMIT_WINDOW_MS = '60000'
    process.env.RATE_LIMIT_MAX = '1'

    try {
      await withTestServer(createApp(), async (baseUrl) => {
        const requestOptions = {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        }

        const firstResponse = await fetch(`${baseUrl}/api/auth/login`, requestOptions)
        const secondResponse = await fetch(`${baseUrl}/api/auth/login`, requestOptions)

        expect(firstResponse.status).toBe(400)
        expect(secondResponse.status).toBe(429)
        expect(await secondResponse.json()).toEqual({
          error: 'Too many requests, please try again later',
        })
        expect(secondResponse.headers.get('ratelimit')).toBeTruthy()
      })
    } finally {
      if (previousWindowMs === undefined) {
        delete process.env.RATE_LIMIT_WINDOW_MS
      } else {
        process.env.RATE_LIMIT_WINDOW_MS = previousWindowMs
      }

      if (previousMax === undefined) {
        delete process.env.RATE_LIMIT_MAX
      } else {
        process.env.RATE_LIMIT_MAX = previousMax
      }
    }
  })
})
