import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'
import bcrypt from 'bcryptjs'
import express from 'express'
import jwt from 'jsonwebtoken'

const findUserById = jest.fn()
const updateUser = jest.fn()

jest.unstable_mockModule('../repositories/user-repository.js', () => ({
  createUser: jest.fn(),
  findUserByEmail: jest.fn(),
  findUserById,
  updateUser,
  deleteUser: jest.fn(),
  listUsers: jest.fn(),
}))

const { requireAuth } = await import('../middleware/auth-middleware.js')
const { default: authRouter } = await import('../routes/auth-routes.js')

const JWT_SECRET = 'test-secret'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const CURRENT_PASSWORD = 'current-pass-1'
const NEW_PASSWORD = 'brand-new-pass-2'

let account
let server
let baseUrl

const changePassword = (body, { authenticated = true } = {}) =>
  fetch(`${baseUrl}/api/auth/me/password`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(authenticated
        ? { Authorization: `Bearer ${jwt.sign({ sub: USER_ID }, JWT_SECRET)}` }
        : {}),
    },
    body: JSON.stringify(body),
  })

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET
  account = {
    id: USER_ID,
    name: 'Staff',
    email: 'staff@example.com',
    role: 'staff',
    passwordHash: bcrypt.hashSync(CURRENT_PASSWORD, 4),
  }

  const app = express()
  app.use(express.json())
  app.use('/api', requireAuth)
  app.use('/api/auth', authRouter)
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
  findUserById.mockReset().mockImplementation(async (id) => (id === USER_ID ? account : null))
  updateUser.mockReset().mockResolvedValue({ id: USER_ID })
})

describe('PUT /api/auth/me/password', () => {
  it('replaces the stored hash and returns no body', async () => {
    const response = await changePassword({
      currentPassword: CURRENT_PASSWORD,
      newPassword: NEW_PASSWORD,
    })

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(updateUser).toHaveBeenCalledTimes(1)

    const [id, changes] = updateUser.mock.calls[0]
    expect(id).toBe(USER_ID)
    expect(Object.keys(changes)).toEqual(['passwordHash'])
    expect(changes.passwordHash).not.toBe(account.passwordHash)
    expect(bcrypt.compareSync(NEW_PASSWORD, changes.passwordHash)).toBe(true)
  })

  it('answers 403 and changes nothing when the current password is wrong', async () => {
    const response = await changePassword({
      currentPassword: 'not-the-password',
      newPassword: NEW_PASSWORD,
    })

    expect(response.status).toBe(403)
    expect((await response.json()).error).toBe('Current password is incorrect')
    expect(updateUser).not.toHaveBeenCalled()
  })

  it.each([
    ['a missing current password', { newPassword: NEW_PASSWORD }],
    ['a missing new password', { currentPassword: CURRENT_PASSWORD }],
    ['a short new password', { currentPassword: CURRENT_PASSWORD, newPassword: 'short' }],
    [
      'a new password equal to the current one',
      { currentPassword: CURRENT_PASSWORD, newPassword: CURRENT_PASSWORD },
    ],
  ])('answers 400 for %s', async (_label, body) => {
    const response = await changePassword(body)

    expect(response.status).toBe(400)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('answers 401 without a token', async () => {
    const response = await changePassword(
      { currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD },
      { authenticated: false }
    )

    expect(response.status).toBe(401)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('never puts a password in an error response', async () => {
    const response = await changePassword({
      currentPassword: 'not-the-password',
      newPassword: NEW_PASSWORD,
    })
    const text = JSON.stringify(await response.json())

    expect(text).not.toContain(NEW_PASSWORD)
    expect(text).not.toContain('not-the-password')
  })
})
