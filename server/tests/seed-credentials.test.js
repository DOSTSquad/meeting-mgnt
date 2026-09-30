import { describe, expect, it } from '@jest/globals'

import {
  assertSeedAllowed,
  formatSeedCredentialSummary,
  resolveSeedPassword,
  shouldResetCredentials,
} from '../scripts/seed-credentials.js'

describe('assertSeedAllowed', () => {
  it('refuses to run in production', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'production' })).toThrow(/NODE_ENV=production/)
  })

  it.each([[{}], [{ NODE_ENV: 'development' }], [{ NODE_ENV: 'test' }]])('allows %j', (env) => {
    expect(() => assertSeedAllowed(env)).not.toThrow()
  })
})

describe('resolveSeedPassword', () => {
  it('uses SEED_PASSWORD when it is set', () => {
    const generate = () => {
      throw new Error('should not generate')
    }

    expect(resolveSeedPassword({ SEED_PASSWORD: 'chosen-by-operator' }, generate)).toEqual({
      password: 'chosen-by-operator',
      generated: false,
    })
  })

  it('generates a password of at least 16 characters when it is not set', () => {
    const { password, generated } = resolveSeedPassword({})

    expect(generated).toBe(true)
    expect(password).toMatch(/^[A-Za-z0-9_-]{16,}$/)
  })

  it('generates a different password on every call', () => {
    expect(resolveSeedPassword({}).password).not.toBe(resolveSeedPassword({}).password)
  })

  it('treats an empty SEED_PASSWORD as unset', () => {
    expect(resolveSeedPassword({ SEED_PASSWORD: '' }).generated).toBe(true)
  })
})

describe('shouldResetCredentials', () => {
  it('is on only for the exact string "true"', () => {
    expect(shouldResetCredentials({ SEED_RESET_PASSWORDS: 'true' })).toBe(true)
    expect(shouldResetCredentials({ SEED_RESET_PASSWORDS: 'false' })).toBe(false)
    expect(shouldResetCredentials({ SEED_RESET_PASSWORDS: '1' })).toBe(false)
    expect(shouldResetCredentials({})).toBe(false)
  })
})

describe('formatSeedCredentialSummary', () => {
  it('prints a generated password once, next to the accounts that use it', () => {
    const lines = formatSeedCredentialSummary({
      password: 'Zq81-generated_pw',
      generated: true,
      appliedEmails: ['a@seed.local', 'b@seed.local'],
      keptEmails: [],
    })

    expect(lines.filter((line) => line.includes('Zq81-generated_pw'))).toHaveLength(1)
    expect(lines).toContain('  - a@seed.local')
    expect(lines).toContain('  - b@seed.local')
  })

  it('never prints a password that came from SEED_PASSWORD', () => {
    const lines = formatSeedCredentialSummary({
      password: 'chosen-by-operator',
      generated: false,
      appliedEmails: ['a@seed.local'],
      keptEmails: [],
    })

    expect(lines.join('\n')).not.toContain('chosen-by-operator')
    expect(lines.join('\n')).toContain('SEED_PASSWORD')
  })

  it('lists existing accounts separately and does not attach the password to them', () => {
    const lines = formatSeedCredentialSummary({
      password: 'Zq81-generated_pw',
      generated: true,
      appliedEmails: ['new@seed.local'],
      keptEmails: ['old@seed.local'],
    })
    const keptIndex = lines.findIndex((line) => line.includes('kept their password'))

    expect(keptIndex).toBeGreaterThan(lines.findIndex((line) => line.includes('Zq81-generated_pw')))
    expect(lines.slice(keptIndex + 1)).toEqual(['  - old@seed.local'])
  })

  it('prints no password line when every account already existed', () => {
    const lines = formatSeedCredentialSummary({
      password: 'Zq81-generated_pw',
      generated: true,
      appliedEmails: [],
      keptEmails: ['old@seed.local'],
    })

    expect(lines.join('\n')).not.toContain('Zq81-generated_pw')
  })
})
