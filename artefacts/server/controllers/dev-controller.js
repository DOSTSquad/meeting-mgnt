import { query } from '../db/postgres.js'

export const resetMeetingItems = async (_req, res, next) => {
  try {
    await query('TRUNCATE TABLE meetings RESTART IDENTITY CASCADE')
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
}
