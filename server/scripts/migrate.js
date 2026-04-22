import 'dotenv/config'

import { runMigrations } from '../db/migrate.js'
import { closePool } from '../db/postgres.js'

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
