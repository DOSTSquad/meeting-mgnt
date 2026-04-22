import { query } from '../db/postgres.js'

const USER_COLUMNS = `
  id,
  name,
  email,
  password_hash,
  role,
  department,
  created_at
`

const mapUser = (row) => {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    department: row.department,
    createdAt: row.created_at.toISOString(),
  }
}

const normalizeEmail = (email) => email.trim().toLowerCase()

export const createUser = async ({
  name,
  email,
  passwordHash,
  role = 'staff',
  department = null,
}) => {
  const result = await query(
    `
      INSERT INTO users (name, email, password_hash, role, department)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING ${USER_COLUMNS}
    `,
    [name.trim(), normalizeEmail(email), passwordHash, role, department]
  )

  return mapUser(result.rows[0])
}

export const findUserByEmail = async (email) => {
  const result = await query(
    `
      SELECT ${USER_COLUMNS}
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [normalizeEmail(email)]
  )

  return mapUser(result.rows[0])
}

export const findUserById = async (id) => {
  const result = await query(
    `
      SELECT ${USER_COLUMNS}
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  )

  return mapUser(result.rows[0])
}
