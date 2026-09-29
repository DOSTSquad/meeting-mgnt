import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'
import express from 'express'
import jwt from 'jsonwebtoken'

const findUserById = jest.fn()
const updateUser = jest.fn()
const deleteUser = jest.fn()
const listUsers = jest.fn()

jest.unstable_mockModule('../repositories/user-repository.js', () => ({
  createUser: jest.fn(),
  findUserByEmail: jest.fn(),
  findUserById,
  updateUser,
  deleteUser,
  listUsers,
}))

const { requireAuth } = await import('../middleware/auth-middleware.js')
const { requireRole } = await import('../middleware/rbac-middleware.js')
const { default: userRouter } = await import('../routes/user-routes.js')

const JWT_SECRET = 'test-secret'
const ADMIN_ID = '11111111-1111-4111-8111-111111111111'
const STAFF_ID = '22222222-2222-4222-8222-222222222222'
const TARGET_ID = '33333333-3333-4333-8333-333333333333'

const accounts = {
  [ADMIN_ID]: { id: ADMIN_ID, name: 'Admin', email: 'admin@example.com', role: 'admin' },
  [STAFF_ID]: { id: STAFF_ID, name: 'Staff', email: 'staff@example.com', role: 'staff' },
}

const tokenFor = (userId) => jwt.sign({ sub: userId }, JWT_SECRET)

let server
let baseUrl

const request = (method, path, { userId, body } = {}) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { Authorization: `Bearer ${tokenFor(userId)}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET

  const app = express()
  app.use(express.json())
  app.use('/api', requireAuth)
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
  await new Promise((resolve) => server.close(resolve))
})

beforeEach(() => {
  findUserById.mockReset().mockImplementation(async (id) => accounts[id] ?? null)
  updateUser.mockReset().mockResolvedValue({ id: TARGET_ID, role: 'staff' })
  deleteUser.mockReset().mockResolvedValue(true)
  listUsers.mockReset().mockResolvedValue([])
})

describe('requireRole', () => {
  const run = (user, ...roles) => {
    const next = jest.fn()
    requireRole(...roles)({ user }, {}, next)

    return next
  }

  it('calls next without an error when the role matches', () => {
    expect(run({ role: 'admin' }, 'admin')).toHaveBeenCalledWith()
  })

  it('accepts any of several roles', () => {
    expect(run({ role: 'staff' }, 'admin', 'staff')).toHaveBeenCalledWith()
  })

  it('passes a 403 error when the role does not match', () => {
    const next = run({ role: 'staff' }, 'admin')

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'Admin access required' })
    )
  })

  it('passes a 401 error when there is no user', () => {
    const next = run(undefined, 'admin')

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }))
  })
})

describe('GET /api/users', () => {
  it('lets any authenticated user list the directory', async () => {
    const response = await request('GET', '/api/users', { userId: STAFF_ID })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ users: [] })
  })

  it('returns 401 without a token', async () => {
    const response = await request('GET', '/api/users')

    expect(response.status).toBe(401)
  })
})

describe('PUT /api/users/:id', () => {
  it('lets an admin update a user', async () => {
    const response = await request('PUT', `/api/users/${TARGET_ID}`, {
      userId: ADMIN_ID,
      body: { role: 'admin', department: 'ops' },
    })

    expect(response.status).toBe(200)
    expect(updateUser).toHaveBeenCalledWith(
      TARGET_ID,
      expect.objectContaining({ role: 'admin', department: 'ops', passwordHash: undefined })
    )
  })

  it('accepts an empty password as "unchanged"', async () => {
    const response = await request('PUT', `/api/users/${TARGET_ID}`, {
      userId: ADMIN_ID,
      body: { name: 'Renamed', password: '' },
    })

    expect(response.status).toBe(200)
    expect(updateUser).toHaveBeenCalledWith(
      TARGET_ID,
      expect.objectContaining({ passwordHash: undefined })
    )
  })

  it('returns 403 for a staff account and does not touch the user', async () => {
    const response = await request('PUT', `/api/users/${TARGET_ID}`, {
      userId: STAFF_ID,
      body: { role: 'admin' },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Admin access required' })
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('returns 403 to staff before validating the body', async () => {
    const response = await request('PUT', `/api/users/${TARGET_ID}`, {
      userId: STAFF_ID,
      body: { role: 'root' },
    })

    expect(response.status).toBe(403)
  })

  it('returns 401 without a token', async () => {
    const response = await request('PUT', `/api/users/${TARGET_ID}`, { body: { role: 'staff' } })

    expect(response.status).toBe(401)
  })

  it('returns 400 for a role outside staff/admin', async () => {
    const response = await request('PUT', `/api/users/${TARGET_ID}`, {
      userId: ADMIN_ID,
      body: { role: 'root' },
    })

    expect(response.status).toBe(400)
    expect((await response.json()).details).toEqual([expect.objectContaining({ field: 'role' })])
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('returns 400 for a malformed id, email or short password', async () => {
    const badId = await request('PUT', '/api/users/not-a-uuid', {
      userId: ADMIN_ID,
      body: { role: 'staff' },
    })
    const badEmail = await request('PUT', `/api/users/${TARGET_ID}`, {
      userId: ADMIN_ID,
      body: { email: 'nope' },
    })
    const shortPassword = await request('PUT', `/api/users/${TARGET_ID}`, {
      userId: ADMIN_ID,
      body: { password: 'short' },
    })

    expect([badId.status, badEmail.status, shortPassword.status]).toEqual([400, 400, 400])
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('returns 400 when an admin edits their own account', async () => {
    const response = await request('PUT', `/api/users/${ADMIN_ID}`, {
      userId: ADMIN_ID,
      body: { role: 'staff' },
    })

    expect(response.status).toBe(400)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('returns 404 when the user does not exist', async () => {
    updateUser.mockResolvedValue(null)

    const response = await request('PUT', `/api/users/${TARGET_ID}`, {
      userId: ADMIN_ID,
      body: { role: 'staff' },
    })

    expect(response.status).toBe(404)
  })
})

describe('DELETE /api/users/:id', () => {
  it('lets an admin delete a user', async () => {
    const response = await request('DELETE', `/api/users/${TARGET_ID}`, { userId: ADMIN_ID })

    expect(response.status).toBe(204)
    expect(deleteUser).toHaveBeenCalledWith(TARGET_ID)
  })

  it('returns 403 for a staff account', async () => {
    const response = await request('DELETE', `/api/users/${TARGET_ID}`, { userId: STAFF_ID })

    expect(response.status).toBe(403)
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('returns 401 without a token', async () => {
    const response = await request('DELETE', `/api/users/${TARGET_ID}`)

    expect(response.status).toBe(401)
  })

  it('returns 400 for a malformed id', async () => {
    const response = await request('DELETE', '/api/users/not-a-uuid', { userId: ADMIN_ID })

    expect(response.status).toBe(400)
  })

  it('returns 400 when an admin deletes themselves', async () => {
    const response = await request('DELETE', `/api/users/${ADMIN_ID}`, { userId: ADMIN_ID })

    expect(response.status).toBe(400)
    expect(deleteUser).not.toHaveBeenCalled()
  })
})
