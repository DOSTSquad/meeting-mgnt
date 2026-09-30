import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'
import express from 'express'
import jwt from 'jsonwebtoken'

const createUser = jest.fn()
const findUserByEmail = jest.fn()
const findUserById = jest.fn()

jest.unstable_mockModule('../repositories/user-repository.js', () => ({
  createUser,
  findUserByEmail,
  findUserById,
  updateUser: jest.fn(),
  deleteUser: jest.fn(),
  listUsers: jest.fn(),
}))

const { requireAuth } = await import('../middleware/auth-middleware.js')
const { default: authRouter } = await import('../routes/auth-routes.js')
const { default: userRouter } = await import('../routes/user-routes.js')

const JWT_SECRET = 'test-secret'
const ADMIN_ID = '11111111-1111-4111-8111-111111111111'
const STAFF_ID = '22222222-2222-4222-8222-222222222222'

const accounts = {
  [ADMIN_ID]: { id: ADMIN_ID, name: 'Admin', email: 'admin@example.com', role: 'admin' },
  [STAFF_ID]: { id: STAFF_ID, name: 'Staff', email: 'staff@example.com', role: 'staff' },
}

const newAccount = { name: '  Sam Rivera ', email: 'Sam@Example.com', password: 'long-enough-1' }

let server
let baseUrl

const request = (method, path, { userId, body } = {}) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { Authorization: `Bearer ${jwt.sign({ sub: userId }, JWT_SECRET)}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET

  const app = express()
  app.use(express.json())
  app.use('/api', requireAuth)
  app.use('/api/auth', authRouter)
  app.use('/api/users', userRouter)
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode || 500).json({ error: error.message })
  })

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(async () => {
  delete process.env.SELF_REGISTRATION_ENABLED
  await new Promise((resolve) => server.close(resolve))
})

beforeEach(() => {
  delete process.env.SELF_REGISTRATION_ENABLED
  findUserById.mockReset().mockImplementation(async (id) => accounts[id] ?? null)
  findUserByEmail.mockReset().mockResolvedValue(null)
  createUser.mockReset().mockImplementation(async ({ name, email, role = 'staff' }) => ({
    id: '44444444-4444-4444-8444-444444444444',
    name: name.trim(),
    email: email.toLowerCase(),
    role,
    department: null,
    createdAt: '2026-10-01T00:00:00.000Z',
  }))
})

describe('POST /api/auth/register', () => {
  it('is closed by default', async () => {
    const response = await request('POST', '/api/auth/register', { body: newAccount })

    expect(response.status).toBe(403)
    expect((await response.json()).error).toMatch(/administrator/i)
    expect(createUser).not.toHaveBeenCalled()
  })

  it('stays closed for any value other than "true"', async () => {
    process.env.SELF_REGISTRATION_ENABLED = 'false'

    const response = await request('POST', '/api/auth/register', { body: newAccount })

    expect(response.status).toBe(403)
  })

  it('is closed before the body is validated', async () => {
    const response = await request('POST', '/api/auth/register', { body: {} })

    expect(response.status).toBe(403)
  })

  it('creates a staff account and returns a token when opened', async () => {
    process.env.SELF_REGISTRATION_ENABLED = 'true'

    const response = await request('POST', '/api/auth/register', {
      body: { ...newAccount, role: 'admin' },
    })
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload.token).toEqual(expect.any(String))
    expect(payload.user).toMatchObject({ email: 'sam@example.com', role: 'staff' })
    expect(createUser.mock.calls[0][0].role).toBeUndefined()
  })
})

describe('POST /api/users', () => {
  it('lets an admin create a staff account by default', async () => {
    const response = await request('POST', '/api/users', { userId: ADMIN_ID, body: newAccount })
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload.user).toMatchObject({
      name: 'Sam Rivera',
      email: 'sam@example.com',
      role: 'staff',
    })
    expect(payload).not.toHaveProperty('token')
    expect(createUser).toHaveBeenCalledTimes(1)

    const stored = createUser.mock.calls[0][0]
    expect(stored.passwordHash).toEqual(expect.any(String))
    expect(stored.passwordHash).not.toContain(newAccount.password)
  })

  it('lets an admin create another admin', async () => {
    const response = await request('POST', '/api/users', {
      userId: ADMIN_ID,
      body: { ...newAccount, role: 'admin' },
    })

    expect(response.status).toBe(201)
    expect((await response.json()).user.role).toBe('admin')
  })

  it('answers 409 for a duplicate email', async () => {
    findUserByEmail.mockResolvedValue({ id: 'existing' })

    const response = await request('POST', '/api/users', { userId: ADMIN_ID, body: newAccount })

    expect(response.status).toBe(409)
    expect(createUser).not.toHaveBeenCalled()
  })

  it.each([
    ['a missing name', { ...newAccount, name: '  ' }],
    ['an invalid email', { ...newAccount, email: 'not-an-email' }],
    ['a short password', { ...newAccount, password: 'short' }],
    ['an unknown role', { ...newAccount, role: 'superuser' }],
  ])('answers 400 for %s', async (_label, body) => {
    const response = await request('POST', '/api/users', { userId: ADMIN_ID, body })

    expect(response.status).toBe(400)
    expect(createUser).not.toHaveBeenCalled()
  })

  it('answers 403 to a staff account', async () => {
    const response = await request('POST', '/api/users', { userId: STAFF_ID, body: newAccount })

    expect(response.status).toBe(403)
    expect(createUser).not.toHaveBeenCalled()
  })

  it('answers 401 without a token', async () => {
    const response = await request('POST', '/api/users', { body: newAccount })

    expect(response.status).toBe(401)
    expect(createUser).not.toHaveBeenCalled()
  })
})
