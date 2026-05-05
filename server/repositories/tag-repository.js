import { query } from '../db/postgres.js'

const mapTag = (row) => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at.toISOString(),
})

export const listTags = async () => {
  const result = await query(
    `
      SELECT id, name, created_at
      FROM tags
      ORDER BY name ASC
    `
  )

  return result.rows.map(mapTag)
}

export const findTagByName = async (name) => {
  const result = await query(
    `
      SELECT id, name, created_at
      FROM tags
      WHERE LOWER(name) = LOWER($1)
      LIMIT 1
    `,
    [name.trim()]
  )

  return result.rows[0] ? mapTag(result.rows[0]) : null
}

export const createTag = async (name) => {
  const result = await query(
    `
      INSERT INTO tags (name)
      VALUES ($1)
      ON CONFLICT (name) DO UPDATE
      SET name = EXCLUDED.name
      RETURNING id, name, created_at
    `,
    [name.trim()]
  )

  return mapTag(result.rows[0])
}
