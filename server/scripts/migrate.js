import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadDotenv } from 'dotenv'

import { runMigrations } from '../db/migrate.js'
import { closePool } from '../db/postgres.js'

loadDotenv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env'),
  override: true,
})

const main = async () => {
  const result = await runMigrations()

  if (result.applied.length === 0) {
    console.log(`No pending migrations. Total known migrations: ${result.total}`)
    return
  }

  console.log(`Applied ${result.applied.length} migration(s):`)
  for (const version of result.applied) {
    console.log(`- ${version}`)
  }
}

try {
  await main()
} finally {
  await closePool()
}
