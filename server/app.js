// Must stay first: ESM hoists imports above ordinary statements, so loading .env
// anywhere below this line would run after the whole import graph had already
// read process.env. See server/load-env.js.
import './load-env.js'

import cors from 'cors'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'

import { requireAuth } from './middleware/auth-middleware.js'
import authRouter from './routes/auth-routes.js'
import dashboardRouter from './routes/dashboard-routes.js'
import devRouter from './routes/dev-routes.js'
import meetingRequestRouter from './routes/meeting-request-routes.js'
import meetingRouter from './routes/meeting-routes.js'
import minuteRouter from './routes/minute-routes.js'
import participantRouter from './routes/participant-routes.js'
import publicInvitationRouter from './routes/public-invitation-routes.js'
import recordingRouter from './routes/recording-routes.js'
import workflowEventsRouter from './routes/workflow-events-routes.js'
import tagRouter from './routes/tag-routes.js'
import userRouter from './routes/user-routes.js'
import { fileRouter, meetingFileRouter } from './routes/file-routes.js'
import { actionItemRouter, meetingActionItemRouter } from './routes/action-item-routes.js'
import { deliverMeetingCalendar } from './services/meeting-calendar-service.js'

const HEALTH_TIMEOUT_MS = 1500
const DEFAULT_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000
const DEFAULT_RATE_LIMIT_MAX = 100

export const isDevelopmentEnvironment = (environment = process.env.NODE_ENV) =>
  environment === 'development'

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export const getRateLimitConfig = (environment = process.env) => ({
  windowMs: parsePositiveInteger(environment.RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT_WINDOW_MS),
  limit: parsePositiveInteger(environment.RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX),
})

const getTrustProxySetting = (value = process.env.TRUST_PROXY) => {
  if (!value || value === 'false') {
    return false
  }

  if (value === 'true') {
    return 'loopback'
  }

  const parsed = Number.parseInt(value, 10)

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : value
}

export const createApiRateLimiter = (environment = process.env) => {
  const { windowMs, limit } = getRateLimitConfig(environment)

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: 'Too many requests, please try again later',
    },
  })
}

const checkTcpDependency = ({ name, host, port }) =>
  new Promise((resolve) => {
    if (!host || !port) {
      resolve({
        name,
        status: 'misconfigured',
        detail: 'Missing host or port configuration',
      })
      return
    }

    const socket = net.createConnection({ host, port: Number(port) })
    let settled = false

    const finish = (result) => {
      if (settled) {
        return
      }

      settled = true
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(HEALTH_TIMEOUT_MS)
    socket.once('connect', () => {
      finish({ name, status: 'ok' })
    })
    socket.once('timeout', () => {
      finish({
        name,
        status: 'error',
        detail: `Timed out after ${HEALTH_TIMEOUT_MS}ms`,
      })
    })
    socket.once('error', (error) => {
      finish({
        name,
        status: 'error',
        detail: error.message,
      })
    })
  })

const checkHttpDependency = ({ name, protocol, hostname, port, path }) =>
  new Promise((resolve) => {
    if (!hostname || !port) {
      resolve({
        name,
        status: 'misconfigured',
        detail: 'Missing host or port configuration',
      })
      return
    }

    const client = protocol === 'https:' ? https : http
    const request = client.request(
      {
        protocol,
        hostname,
        port: Number(port),
        path,
        method: 'GET',
        timeout: HEALTH_TIMEOUT_MS,
      },
      (response) => {
        response.resume()

        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 400) {
          resolve({ name, status: 'ok' })
          return
        }

        resolve({
          name,
          status: 'error',
          detail: `Unexpected status code ${response.statusCode ?? 'unknown'}`,
        })
      }
    )

    request.once('timeout', () => {
      request.destroy(new Error(`Timed out after ${HEALTH_TIMEOUT_MS}ms`))
    })
    request.once('error', (error) => {
      resolve({
        name,
        status: 'error',
        detail: error.message,
      })
    })
    request.end()
  })

const getPostgresCheck = () => {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    return {
      name: 'postgres',
      status: 'misconfigured',
      detail: 'DATABASE_URL is not set',
    }
  }

  try {
    const { hostname, port } = new URL(databaseUrl)

    return checkTcpDependency({
      name: 'postgres',
      host: hostname,
      port: port || 5432,
    })
  } catch {
    return {
      name: 'postgres',
      status: 'misconfigured',
      detail: 'DATABASE_URL is invalid',
    }
  }
}

const getRedisCheck = () => {
  const redisUrl = process.env.REDIS_URL

  if (!redisUrl) {
    return {
      name: 'redis',
      status: 'misconfigured',
      detail: 'REDIS_URL is not set',
    }
  }

  try {
    const { hostname, port } = new URL(redisUrl)

    return checkTcpDependency({
      name: 'redis',
      host: hostname,
      port: port || 6379,
    })
  } catch {
    return {
      name: 'redis',
      status: 'misconfigured',
      detail: 'REDIS_URL is invalid',
    }
  }
}

const getMinioCheck = () => {
  const protocol = process.env.MINIO_USE_SSL === 'true' ? 'https:' : 'http:'

  return checkHttpDependency({
    name: 'minio',
    protocol,
    hostname: process.env.MINIO_ENDPOINT,
    port: process.env.MINIO_PORT || 9000,
    path: '/minio/health/live',
  })
}

const getHealthChecks = async () => {
  const checks = await Promise.all([getPostgresCheck(), getRedisCheck(), getMinioCheck()])
  const healthy = checks.every((check) => check.status === 'ok')

  return {
    status: healthy ? 'ok' : 'degraded',
    checks,
  }
}

export const createApp = () => {
  const app = express()

  app.locals.deliverMeetingCalendar = deliverMeetingCalendar

  app.set('trust proxy', getTrustProxySetting())
  app.use(express.json())
  app.use(cors({ exposedHeaders: ['Link', 'RateLimit', 'RateLimit-Policy', 'X-Total-Count'] }))

  app.get('/health/live', (_req, res) => {
    res.json({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
    })
  })

  app.get('/health/ready', async (_req, res) => {
    const health = await getHealthChecks()

    res.status(health.status === 'ok' ? 200 : 503).json(health)
  })

  app.get('/health', async (_req, res) => {
    const health = await getHealthChecks()

    res.status(health.status === 'ok' ? 200 : 503).json({
      ...health,
      uptimeSeconds: Math.round(process.uptime()),
    })
  })

  app.use('/api', createApiRateLimiter())
  app.use('/api/auth', authRouter)
  app.use('/api/public/invitations', publicInvitationRouter)
  app.use('/api', requireAuth)
  app.use('/api', dashboardRouter)
  if (isDevelopmentEnvironment()) {
    app.use('/api/dev', devRouter)
  }
  app.use('/api/tags', tagRouter)
  app.use('/api/users', userRouter)
  app.use('/api/meeting-requests', meetingRequestRouter)
  app.use('/api/meetings', meetingRouter)
  app.use('/api/meetings/:meetingId/minutes', minuteRouter)
  app.use('/api/meetings/:meetingId/recording', recordingRouter)
  app.use('/api/meetings/:meetingId/workflow', workflowEventsRouter)
  app.use('/api/meetings/:meetingId/participants', participantRouter)
  app.use('/api/meetings/:meetingId/files', meetingFileRouter)
  app.use('/api/files', fileRouter)
  app.use('/api/meetings/:meetingId/action-items', meetingActionItemRouter)
  app.use('/api/action-items', actionItemRouter)

  app.use((req, res) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` })
  })

  const databaseErrorCodes = new Set([
    '28P01', // invalid_password
    '28000', // invalid_authorization_specification
    '3D000', // invalid_catalog_name (database does not exist)
    '57P03', // cannot_connect_now
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'EHOSTUNREACH',
  ])

  app.use((error, _req, res, _next) => {
    const isDatabaseUnavailableError = databaseErrorCodes.has(error.code)
    const statusCode = error.statusCode || (isDatabaseUnavailableError ? 503 : 500)
    const message =
      statusCode >= 500
        ? isDatabaseUnavailableError
          ? 'Database unavailable'
          : 'Internal server error'
        : error.message || 'Request failed'

    console.error('Request failed', {
      method: _req.method,
      path: _req.originalUrl,
      statusCode,
      code: error.code,
      message: error.message,
    })

    res.status(statusCode).json({ error: message })
  })

  return app
}
