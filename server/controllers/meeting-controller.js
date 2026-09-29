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
    const meeting = await createMeetingForUser(
      req.body ?? {},
      req.user?.id,
      req.app?.locals?.deliverMeetingCalendar,
      req.user?.role
    )

    res.status(201).json({ meeting })
  } catch (error) {
    next(error)
  }
}

export const list = async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1)
    const limit = Number(req.query.limit ?? 20)
    const { from, to, status, q, scope } = req.query
    const listsEveryMeeting = req.user?.role === 'admin' && scope !== 'mine'

    const { rows, total } = await listMeetingsForQuery({
      userId: listsEveryMeeting ? null : req.user?.id,
      callerRole: req.user?.role,
      page,
      limit,
      from,
      to,
      status,
      q,
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
    const meeting = await getMeetingById(req.params.id, req.user?.id, req.user?.role)

    res.json({ meeting })
  } catch (error) {
    next(error)
  }
}

export const update = async (req, res, next) => {
  try {
    const meeting = await updateMeetingById(
      req.params.id,
      req.body ?? {},
      req.user?.id,
      req.app?.locals?.deliverMeetingCalendar,
      req.user?.role
    )

    res.json({ meeting })
  } catch (error) {
    next(error)
  }
}

export const remove = async (req, res, next) => {
  try {
    await deleteMeetingById(req.params.id, req.user?.id, req.user?.role)

    res.status(204).end()
  } catch (error) {
    next(error)
  }
}
