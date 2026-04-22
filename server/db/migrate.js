import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPool } from './postgres.js'

const dbDir = fileURLToPath(new URL('.', import.meta.url))
const migrationsDir = path.join(dbDir, 'migrations')

const getMigrationFiles = async () => {
  const entries = await readdir(migrationsDir, { withFileTypes: true })

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort()
}

const ensureMigrationTable = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

const getAppliedVersions = async (client) => {
  const result = await client.query('SELECT version FROM schema_migrations')

  return new Set(result.rows.map((row) => row.version))
}

const applyMigration = async (client, filename) => {
  const fullPath = path.join(migrationsDir, filename)
  const sql = await readFile(fullPath, 'utf8')

  await client.query('BEGIN')

  try {
    await client.query(sql)
    await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [filename])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

export const runMigrations = async () => {
  const pool = getPool()
  const client = await pool.connect()

  try {
    await ensureMigrationTable(client)

    const appliedVersions = await getAppliedVersions(client)
    const migrationFiles = await getMigrationFiles()
    const pending = migrationFiles.filter((filename) => !appliedVersions.has(filename))

    for (const filename of pending) {
      await applyMigration(client, filename)
    }

    return {
      total: migrationFiles.length,
      applied: pending,
    }
  } finally {
    client.release()
  }
}
