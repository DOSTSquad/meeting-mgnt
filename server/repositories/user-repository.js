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

export const findUsersByIds = async (ids) => {
  if (!ids || ids.length === 0) {
    return []
  }

  const result = await query(
    `
      SELECT ${USER_COLUMNS}
      FROM users
      WHERE id = ANY($1)
    `,
    [ids]
  )

  return result.rows.map(mapUser)
}

export const listUsers = async () => {
  const result = await query(
    `
      SELECT id, name, email, role, department, created_at
      FROM users
      ORDER BY name ASC, email ASC
    `
  )

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    department: row.department,
    createdAt: row.created_at.toISOString(),
  }))
}

export const updateUser = async (id, { name, email, role, department, passwordHash }) => {
  const result = await query(
    `UPDATE users SET name=COALESCE($2,name), email=COALESCE($3,email), role=COALESCE($4,role), department=COALESCE($5,department), password_hash=COALESCE($6,password_hash) WHERE id=$1 RETURNING id,name,email,role,department,created_at`,
    [id, name?.trim() || null, email?.trim().toLowerCase() || null, role || null, department ?? null, passwordHash || null]
  )
  return result.rows[0] ? { ...result.rows[0], createdAt: result.rows[0].created_at.toISOString() } : null
}

export const deleteUser = async (id) => {
  const result = await query('DELETE FROM users WHERE id=$1 RETURNING id', [id])
  return result.rowCount > 0
}
