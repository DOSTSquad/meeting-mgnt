import { describe, expect, it } from '@jest/globals'

import { createApiRateLimiter, getRateLimitConfig, isDevelopmentEnvironment } from '../app.js'

const buildRateLimitRequest = () => ({
  ip: '127.0.0.1',
  headers: {},
  method: 'POST',
  originalUrl: '/api/auth/login',
  app: {
    get: () => false,
  },
})

const createRateLimitResponse = (done) => ({
  statusCode: 200,
  body: undefined,
  headers: {},
  append(name, value) {
    const key = name.toLowerCase()
    this.headers[key] = this.headers[key] ? [].concat(this.headers[key], value) : value
    return this
  },
  end(value) {
    this.body = value
    done('response')
    return this
  },
  getHeader(name) {
    return this.headers[name.toLowerCase()]
  },
  json(value) {
    this.body = value
    done('response')
    return this
  },
  removeHeader(name) {
    delete this.headers[name.toLowerCase()]
  },
  send(value) {
    this.body = value
    done('response')
    return this
  },
  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value
  },
  status(statusCode) {
    this.statusCode = statusCode
    return this
  },
})

const runRateLimiter = async (rateLimiter, request) => {
  let response
  const result = await new Promise((resolve, reject) => {
    response = createRateLimitResponse(resolve)

    rateLimiter(request, response, (error) => {
      if (error) {
        reject(error)
        return
      }

      resolve('next')
    })
  })

  return { result, response }
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
    const rateLimiter = createApiRateLimiter({
      RATE_LIMIT_WINDOW_MS: '60000',
      RATE_LIMIT_MAX: '1',
    })

    const firstResult = await runRateLimiter(rateLimiter, buildRateLimitRequest())
    const secondResult = await runRateLimiter(rateLimiter, buildRateLimitRequest())

    expect(firstResult.result).toBe('next')
    expect(firstResult.response.statusCode).toBe(200)
    expect(secondResult.result).toBe('response')
    expect(secondResult.response.statusCode).toBe(429)
    expect(secondResult.response.body).toEqual({
      error: 'Too many requests, please try again later',
    })
    expect(secondResult.response.headers.ratelimit).toBeTruthy()
  })
})
