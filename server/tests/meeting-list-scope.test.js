import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const listMeetingsForQuery = jest.fn()

jest.unstable_mockModule('../services/meeting-service.js', () => ({
  createMeetingForUser: jest.fn(),
  deleteMeetingById: jest.fn(),
  getMeetingById: jest.fn(),
  listMeetingsForQuery,
  updateMeetingById: jest.fn(),
}))

const { list } = await import('../controllers/meeting-controller.js')

const USER_ID = '11111111-1111-4111-8111-111111111111'

const listAs = async (user, query = {}) => {
  const req = {
    user,
    query,
    protocol: 'http',
    baseUrl: '/api/meetings',
    path: '/',
    get: () => 'localhost',
  }
  const res = { set: jest.fn(), json: jest.fn() }
  const next = jest.fn()

  await list(req, res, next)

  expect(next).not.toHaveBeenCalled()
}

beforeEach(() => {
  listMeetingsForQuery.mockReset().mockResolvedValue({ rows: [], total: 0 })
})

describe('GET /api/meetings scope', () => {
  it('lists every meeting for an admin by default', async () => {
    await listAs({ id: USER_ID, role: 'admin' })

    expect(listMeetingsForQuery).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, callerRole: 'admin' })
    )
  })

  it('lists every meeting for an admin with scope=all', async () => {
    await listAs({ id: USER_ID, role: 'admin' }, { scope: 'all' })

    expect(listMeetingsForQuery).toHaveBeenCalledWith(expect.objectContaining({ userId: null }))
  })

  it('limits an admin to meetings they own or attend with scope=mine', async () => {
    await listAs({ id: USER_ID, role: 'admin' }, { scope: 'mine' })

    expect(listMeetingsForQuery).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID }))
  })

  it.each([undefined, 'all', 'mine'])('always limits a staff account (scope=%s)', async (scope) => {
    await listAs({ id: USER_ID, role: 'staff' }, { scope })

    expect(listMeetingsForQuery).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID }))
  })
})
