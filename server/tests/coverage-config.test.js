import { fileURLToPath } from 'node:url'

import { describe, expect, it } from '@jest/globals'
import { loadNycConfig } from '@istanbuljs/load-nyc-config'

describe('Jest coverage configuration dependency compatibility', () => {
  it('loads YAML coverage settings through the overridden parser', async () => {
    const cwd = fileURLToPath(new URL('../', import.meta.url))
    const nycrcPath = fileURLToPath(new URL('./fixtures/coverage-config.yml', import.meta.url))

    const config = await loadNycConfig({ cwd, nycrcPath })

    expect(config).toMatchObject({
      all: true,
      extension: ['.js'],
      include: ['services/**/*.js'],
      exclude: ['tests/**/*.test.js'],
    })
  })
})
