import { describe, expect, it, jest } from '@jest/globals'

import {
  buildResultLines,
  decideAdminAction,
  isPasswordAcceptable,
  parseArgs,
  resolveAdminPassword,
  runCreateAdmin,
} from '../scripts/create-admin-logic.js'

const STAFF = { id: 'staff-1', email: 'sam@example.org', role: 'staff' }
const ADMIN = { id: 'admin-1', email: 'ada@example.org', role: 'admin' }

const createDeps = (overrides = {}) => ({
  findUserByEmail: jest.fn().mockResolvedValue(null),
  existsAdmin: jest.fn().mockResolvedValue(false),
  promoteToAdmin: jest.fn().mockResolvedValue(undefined),
  createAdmin: jest.fn().mockResolvedValue(undefined),
  generatePassword: () => 'generated-password-123',
  ...overrides,
})

const run = (argv, { env = {}, deps = createDeps() } = {}) =>
  runCreateAdmin({ argv, env, deps }).then((result) => ({ ...result, deps }))

describe('parseArgs', () => {
  it('reads --email and --name as separate or inline values', () => {
    expect(parseArgs(['--email', 'a@b.co', '--name', 'Ada Lovelace'])).toMatchObject({
      email: 'a@b.co',
      name: 'Ada Lovelace',
    })
    expect(parseArgs(['--email=a@b.co', '--name=Ada'])).toMatchObject({
      email: 'a@b.co',
      name: 'Ada',
    })
  })

  it('defaults the name and leaves promote off', () => {
    expect(parseArgs([])).toEqual({
      email: null,
      name: 'Administrator',
      promote: false,
      help: false,
    })
  })

  it('accepts --promote and --help', () => {
    expect(parseArgs(['--promote', '--help'])).toMatchObject({ promote: true, help: true })
  })

  it.each([[['--nope']], [['--email']], [['--email', '--promote']], [['stray']]])(
    'rejects %j',
    (argv) => {
      expect(() => parseArgs(argv)).toThrow()
    }
  )
})

describe('resolveAdminPassword', () => {
  it('uses ADMIN_PASSWORD when it is set', () => {
    const generate = () => {
      throw new Error('should not generate')
    }

    expect(resolveAdminPassword({ ADMIN_PASSWORD: 'chosen-by-operator' }, generate)).toEqual({
      password: 'chosen-by-operator',
      generated: false,
    })
  })

  it('generates a 20 character password that differs on every call when it is not set', () => {
    const first = resolveAdminPassword({})
    const second = resolveAdminPassword({})

    expect(first.generated).toBe(true)
    expect(first.password).toMatch(/^[A-Za-z0-9_-]{20}$/)
    expect(first.password).not.toBe(second.password)
  })

  it('accepts only passwords of at least 8 characters', () => {
    expect(isPasswordAcceptable('1234567')).toBe(false)
    expect(isPasswordAcceptable('12345678')).toBe(true)
  })
})

describe('decideAdminAction', () => {
  it.each([
    ['creates a missing account', { email: 'a@b.co', existingUser: null }, 'create'],
    ['keeps an existing admin', { email: 'a@b.co', existingUser: ADMIN }, 'exists'],
    ['refuses a staff account by default', { email: 'a@b.co', existingUser: STAFF }, 'refuse'],
    [
      'promotes a staff account when asked',
      { email: 'a@b.co', existingUser: STAFF, promote: true },
      'promote',
    ],
    ['accepts an existing admin without an email', { email: null, anyAdminExists: true }, 'exists'],
    [
      'asks for an email when no admin exists',
      { email: null, anyAdminExists: false },
      'need-email',
    ],
  ])('%s', (_label, input, action) => {
    expect(decideAdminAction({ existingUser: null, anyAdminExists: false, ...input })).toEqual({
      action,
    })
  })
})

describe('buildResultLines', () => {
  it('prints a generated password once, before the status line, for a created account', () => {
    const lines = buildResultLines({
      status: 'created',
      email: 'ada@example.org',
      password: 'generated-password-123',
      generated: true,
    })

    expect(lines.filter((line) => line.includes('generated-password-123'))).toEqual([
      'admin-password: generated-password-123',
    ])
    expect(lines.at(-1)).toBe('admin-account: created')
  })

  it.each([
    ['an operator-supplied password', { status: 'created', generated: false }],
    ['an existing account', { status: 'exists', generated: true }],
    ['a promotion', { status: 'promoted', generated: true }],
  ])('does not print the password for %s', (_label, input) => {
    const lines = buildResultLines({
      email: 'ada@example.org',
      password: 'secret-value-123',
      ...input,
    })

    expect(lines.join('\n')).not.toContain('secret-value-123')
    expect(lines.at(-1)).toBe(`admin-account: ${input.status}`)
  })
})

describe('runCreateAdmin', () => {
  it('creates an administrator with a generated password and reports it once', async () => {
    const { exitCode, out, err, deps } = await run(['--email', 'Ada@Example.org', '--name', 'Ada'])

    expect(exitCode).toBe(0)
    expect(err).toEqual([])
    expect(deps.createAdmin).toHaveBeenCalledWith({
      name: 'Ada',
      email: 'ada@example.org',
      password: 'generated-password-123',
    })
    expect(out).toContain('admin-password: generated-password-123')
    expect(out.at(-1)).toBe('admin-account: created')
  })

  it('creates the account with ADMIN_PASSWORD and prints no password', async () => {
    const { exitCode, out, deps } = await run(['--email', 'ada@example.org'], {
      env: { ADMIN_PASSWORD: 'operator-chosen-1' },
    })

    expect(exitCode).toBe(0)
    expect(deps.createAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'operator-chosen-1' })
    )
    expect(out.join('\n')).not.toContain('operator-chosen-1')
    expect(out.at(-1)).toBe('admin-account: created')
  })

  it('rejects a short ADMIN_PASSWORD without echoing it', async () => {
    const { exitCode, out, err, deps } = await run(['--email', 'ada@example.org'], {
      env: { ADMIN_PASSWORD: 'short' },
    })

    expect(exitCode).toBe(1)
    expect(deps.createAdmin).not.toHaveBeenCalled()
    expect([...out, ...err].join('\n')).not.toContain('short')
    expect(err.join('\n')).toMatch(/at least 8 characters/)
  })

  it('is idempotent for an existing administrator and never generates a password', async () => {
    const deps = createDeps({
      findUserByEmail: jest.fn().mockResolvedValue(ADMIN),
      generatePassword: () => {
        throw new Error('should not generate')
      },
    })
    const { exitCode, out } = await run(['--email', ADMIN.email], { deps })

    expect(exitCode).toBe(0)
    expect(deps.createAdmin).not.toHaveBeenCalled()
    expect(out.at(-1)).toBe('admin-account: exists')
    expect(out.join('\n')).not.toContain('admin-password')
  })

  it('refuses to touch an existing staff account without --promote', async () => {
    const deps = createDeps({ findUserByEmail: jest.fn().mockResolvedValue(STAFF) })
    const { exitCode, err } = await run(['--email', STAFF.email], { deps })

    expect(exitCode).toBe(1)
    expect(err.join('\n')).toMatch(/--promote/)
    expect(deps.promoteToAdmin).not.toHaveBeenCalled()
    expect(deps.createAdmin).not.toHaveBeenCalled()
  })

  it('promotes an existing staff account with --promote and keeps its password', async () => {
    const deps = createDeps({ findUserByEmail: jest.fn().mockResolvedValue(STAFF) })
    const { exitCode, out } = await run(['--email', STAFF.email, '--promote'], { deps })

    expect(exitCode).toBe(0)
    expect(deps.promoteToAdmin).toHaveBeenCalledWith(STAFF.id)
    expect(deps.createAdmin).not.toHaveBeenCalled()
    expect(out.at(-1)).toBe('admin-account: promoted')
  })

  it('exits 0 without an email when an administrator already exists', async () => {
    const deps = createDeps({ existsAdmin: jest.fn().mockResolvedValue(true) })
    const { exitCode, out } = await run([], { deps })

    expect(exitCode).toBe(0)
    expect(out.at(-1)).toBe('admin-account: exists')
  })

  it('exits 2 without an email when no administrator exists', async () => {
    const { exitCode, out, err } = await run([])

    expect(exitCode).toBe(2)
    expect(out).toEqual([])
    expect(err.join('\n')).toMatch(/--email/)
  })

  it('rejects an invalid email before touching the database', async () => {
    const { exitCode, deps } = await run(['--email', 'not-an-email'])

    expect(exitCode).toBe(1)
    expect(deps.findUserByEmail).not.toHaveBeenCalled()
  })

  it('reports usage errors and exits 1', async () => {
    const { exitCode, err } = await run(['--bogus'])

    expect(exitCode).toBe(1)
    expect(err.join('\n')).toMatch(/Unknown argument: --bogus/)
  })

  it('prints usage and exits 0 for --help', async () => {
    const { exitCode, out } = await run(['--help'])

    expect(exitCode).toBe(0)
    expect(out.join('\n')).toMatch(/ADMIN_PASSWORD/)
  })

  it('turns a database failure into exit 1 without leaking the password', async () => {
    const deps = createDeps({
      createAdmin: jest.fn().mockRejectedValue(new Error('connection refused')),
    })
    const { exitCode, out, err } = await run(['--email', 'ada@example.org'], { deps })

    expect(exitCode).toBe(1)
    expect(err.join('\n')).toMatch(/connection refused/)
    expect([...out, ...err].join('\n')).not.toContain('generated-password-123')
  })
})
