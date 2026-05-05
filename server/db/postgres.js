import { Pool } from 'pg'

let pool

const getDatabaseUrl = () => {
  if (!process.env.DATABASE_URL) {
    const error = new Error('DATABASE_URL is not configured')
    error.statusCode = 500
    throw error
  }

  return process.env.DATABASE_URL
}

export const getPool = () => {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
    })
  }

  return pool
}

export const query = (text, params) => getPool().query(text, params)

export const transaction = async (callback) => {
  const client = await getPool().connect()

  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')

    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export const closePool = async () => {
  if (!pool) {
    return
  }

  const currentPool = pool
  pool = undefined
  await currentPool.end()
}
