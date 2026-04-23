import { buildLinkHeader } from '../middleware/pagination.js'
import {
  createMeetingForUser,
  deleteMeetingById,
  getMeetingById,
  listMeetingsForQuery,
  updateMeetingById,
} from '../services/meeting-service.js'

export const create = async (req, res, next) => {
  try {
    const meeting = await createMeetingForUser(req.body ?? {}, req.user?.id)

    res.status(201).json({ meeting })
  } catch (error) {
    next(error)
  }
}

export const list = async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1)
    const limit = Number(req.query.limit ?? 20)
    const { from, to, status, department } = req.query

    const { rows, total } = await listMeetingsForQuery({
      page,
      limit,
      from,
      to,
      status,
      department,
    })

    res.set('X-Total-Count', String(total))
    res.set('Link', buildLinkHeader({ req, page, limit, total }))
    res.json({ meetings: rows })
  } catch (error) {
    next(error)
  }
}

export const getOne = async (req, res, next) => {
  try {
    const meeting = await getMeetingById(req.params.id)

    res.json({ meeting })
  } catch (error) {
    next(error)
  }
}

export const update = async (req, res, next) => {
  try {
    const meeting = await updateMeetingById(req.params.id, req.body ?? {})

    res.json({ meeting })
  } catch (error) {
    next(error)
  }
}

export const remove = async (req, res, next) => {
  try {
    await deleteMeetingById(req.params.id)

    res.status(204).end()
  } catch (error) {
    next(error)
  }
}
