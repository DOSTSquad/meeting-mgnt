import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse } from 'dotenv'

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

const createResponseRecorder = () => {
  const response = {
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
  }

  return response
}

test.before(async () => {
  process.env.JWT_SECRET = TEST_SECRET
  process.env.JWT_EXPIRES_IN = '1h'
  process.env.DATABASE_URL = projectEnv.DATABASE_URL

  if (runDatabaseTests) {
    await query(
      `
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'staff',
          department TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
    )
  }
})

test.beforeEach(async () => {
  if (runDatabaseTests) {
    await query('TRUNCATE TABLE users')
  }
})

test.after(async () => {
  if (runDatabaseTests) {
    await closePool()
  }
})

test(
  'registerUser hashes passwords and returns a token plus sanitized user',
  { skip: !runDatabaseTests },
  async () => {
    const result = await registerUser({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
    })

    assert.equal(typeof result.token, 'string')
    assert.equal(result.user.name, 'Test User')
    assert.equal(result.user.email, 'test@example.com')
    assert.equal(result.user.role, 'staff')
    assert.equal(result.user.department, null)
    assert.equal(typeof result.user.id, 'string')
    assert.equal(typeof result.user.createdAt, 'string')

    const storedUserResult = await query(
      'SELECT name, email, password_hash, role, department FROM users WHERE email = $1',
      ['test@example.com']
    )

    assert.equal(storedUserResult.rows.length, 1)
    assert.equal(storedUserResult.rows[0].name, 'Test User')
    assert.equal(storedUserResult.rows[0].email, 'test@example.com')
    assert.equal(storedUserResult.rows[0].role, 'staff')
    assert.equal(storedUserResult.rows[0].department, null)
    assert.notEqual(storedUserResult.rows[0].password_hash, 'password123')
  }
)

test('registerUser rejects duplicate email addresses', { skip: !runDatabaseTests }, async () => {
  await registerUser({
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123',
  })

  await assert.rejects(
    registerUser({
      name: 'Another User',
      email: 'test@example.com',
      password: 'password123',
    }),
    (error) => {
      assert.equal(error.statusCode, 409)
      assert.equal(error.message, 'A user with this email already exists')
      return true
    }
  )
})

test(
  'loginUser returns a token for valid credentials and rejects invalid ones',
  { skip: !runDatabaseTests },
  async () => {
    await registerUser({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
    })

    const success = await loginUser({
      email: 'test@example.com',
      password: 'password123',
    })

    assert.equal(typeof success.token, 'string')
    assert.equal(success.user.email, 'test@example.com')
    assert.equal(success.user.role, 'staff')

    await assert.rejects(
      loginUser({
        email: 'test@example.com',
        password: 'wrong-password',
      }),
      (error) => {
        assert.equal(error.statusCode, 401)
        assert.equal(error.message, 'Invalid email or password')
        return true
      }
    )
  }
)

test(
  'getUserForToken returns the sanitized user for a valid token',
  { skip: !runDatabaseTests },
  async () => {
    const registration = await registerUser({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
    })

    const user = await getUserForToken(registration.token)

    assert.equal(user.email, 'test@example.com')
    assert.equal(user.name, 'Test User')
    assert.equal(user.role, 'staff')
    assert.equal(user.department, null)
  }
)

test('requireAuth returns 401 JSON when no bearer token is provided', async () => {
  const req = {
    path: '/meetings',
    get() {
      return undefined
    },
  }
  const res = createResponseRecorder()
  let nextCalled = false

  await requireAuth(req, res, () => {
    nextCalled = true
  })

  assert.equal(nextCalled, false)
  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.body, {
    error: 'Authorization token is required',
  })
})

test(
  'requireAuth attaches the user and calls next for a valid bearer token',
  { skip: !runDatabaseTests },
  async () => {
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
    let nextCalled = false

    await requireAuth(req, res, () => {
      nextCalled = true
    })

    assert.equal(nextCalled, true)
    assert.equal(req.user.email, 'test@example.com')
    assert.equal(req.user.role, 'staff')
    assert.equal(res.body, null)
  }
)
