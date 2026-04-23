import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, beforeAll, beforeEach, afterAll, it, expect, jest } from '@jest/globals'
import { parse } from 'dotenv'

import { runMigrations } from '../db/migrate.js'
import { closePool, query } from '../db/postgres.js'
import { requireAuth } from '../middleware/auth-middleware.js'
import { getUserForToken, loginUser, registerUser } from '../services/auth-service.js'

const TEST_SECRET = 'test-secret'
const serverDir = fileURLToPath(new URL('../', import.meta.url))
const repoRoot = path.resolve(serverDir, '..')
const envPath = existsSync(path.join(repoRoot, '.env'))
  ? path.join(repoRoot, '.env')
  : path.join(repoRoot, '.env.example')
const projectEnv = parse(readFileSync(envPath))
const runDatabaseTests = process.env.RUN_DB_TESTS === 'true' && Boolean(projectEnv.DATABASE_URL)

const createResponseRecorder = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code
    return this
  },
  json(payload) {
    this.body = payload
    return this
  },
})

beforeAll(async () => {
  process.env.JWT_SECRET = TEST_SECRET
  process.env.JWT_EXPIRES_IN = '1h'
  process.env.DATABASE_URL = projectEnv.DATABASE_URL

  if (!runDatabaseTests) {
    return
  }

  await runMigrations()
})

beforeEach(async () => {
  if (!runDatabaseTests) {
    return
  }

  await query('TRUNCATE TABLE users CASCADE')
})

afterAll(async () => {
  if (!runDatabaseTests) {
    return
  }

  await closePool()
})

const dbDescribe = runDatabaseTests ? describe : describe.skip

dbDescribe('DB-backed auth service', () => {
  it('registerUser hashes passwords and returns a token plus sanitized user', async () => {
    const result = await registerUser({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
    })

    expect(typeof result.token).toBe('string')
    expect(result.user.name).toBe('Test User')
    expect(result.user.email).toBe('test@example.com')
    expect(result.user.role).toBe('staff')
    expect(result.user.department).toBeNull()
    expect(typeof result.user.id).toBe('string')
    expect(typeof result.user.createdAt).toBe('string')

    const storedUserResult = await query(
      'SELECT name, email, password_hash, role, department FROM users WHERE email = $1',
      ['test@example.com']
    )

    expect(storedUserResult.rows).toHaveLength(1)
    expect(storedUserResult.rows[0].name).toBe('Test User')
    expect(storedUserResult.rows[0].email).toBe('test@example.com')
    expect(storedUserResult.rows[0].role).toBe('staff')
    expect(storedUserResult.rows[0].department).toBeNull()
    expect(storedUserResult.rows[0].password_hash).not.toBe('password123')
  })

  it('registerUser rejects duplicate email addresses', async () => {
    await registerUser({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
    })

    await expect(
      registerUser({
        name: 'Another User',
        email: 'test@example.com',
        password: 'password123',
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'A user with this email already exists',
    })
  })

  it('loginUser returns a token for valid credentials and rejects invalid ones', async () => {
    await registerUser({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
    })

    const success = await loginUser({
      email: 'test@example.com',
      password: 'password123',
    })

    expect(typeof success.token).toBe('string')
    expect(success.user.email).toBe('test@example.com')
    expect(success.user.role).toBe('staff')

    await expect(
      loginUser({
        email: 'test@example.com',
        password: 'wrong-password',
      })
    ).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid email or password',
    })
  })

  it('getUserForToken returns the sanitized user for a valid token', async () => {
    const registration = await registerUser({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
    })

    const user = await getUserForToken(registration.token)

    expect(user.email).toBe('test@example.com')
    expect(user.name).toBe('Test User')
    expect(user.role).toBe('staff')
    expect(user.department).toBeNull()
  })
})

describe('Auth middleware', () => {
  it('requireAuth returns 401 JSON when no bearer token is provided', async () => {
    const req = {
      path: '/meetings',
      get() {
        return undefined
      },
    }
    const res = createResponseRecorder()
    const next = jest.fn()

    await requireAuth(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({
      error: 'Authorization token is required',
    })
  })

  const maybeIt = runDatabaseTests ? it : it.skip

  maybeIt('requireAuth attaches the user and calls next for a valid bearer token', async () => {
    const registration = await registerUser({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
    })

    const req = {
      path: '/auth/me',
      get(headerName) {
        if (headerName === 'authorization') {
          return `Bearer ${registration.token}`
        }

        return undefined
      },
    }
    const res = createResponseRecorder()
    const next = jest.fn()

    await requireAuth(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(req.user.email).toBe('test@example.com')
    expect(req.user.role).toBe('staff')
    expect(res.body).toBeNull()
  })
})
