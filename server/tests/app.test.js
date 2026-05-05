import { describe, expect, it } from '@jest/globals'

import { isDevelopmentEnvironment } from '../app.js'

describe('app environment gates', () => {
  it('enables development-only routes only in development', () => {
    expect(isDevelopmentEnvironment('development')).toBe(true)
    expect(isDevelopmentEnvironment('test')).toBe(false)
    expect(isDevelopmentEnvironment('production')).toBe(false)
    expect(isDevelopmentEnvironment()).toBe(process.env.NODE_ENV === 'development')
  })
})
