import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'

import { requireAuth } from './middleware/auth-middleware.js'
import authRouter from './routes/auth-routes.js'

const HEALTH_TIMEOUT_MS = 1500

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

  app.use(express.json())
  app.use(cors())

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

  app.use('/api/auth', authRouter)
  app.use('/api', requireAuth)

  app.use((req, res) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` })
  })

  app.use((error, _req, res, _next) => {
    const statusCode = error.statusCode || 500
    const message = statusCode >= 500 ? 'Internal server error' : error.message || 'Request failed'

    if (statusCode >= 500) {
      console.error(error)
    }

    res.status(statusCode).json({ error: message })
  })

  return app
}
