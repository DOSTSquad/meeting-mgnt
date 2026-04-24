import {
  createActionItem,
  deleteActionItem,
  listActionItems,
  updateActionItem,
} from '../services/action-item-service.js'

export const list = async (req, res, next) => {
  try {
    const { actionItems } = await listActionItems(
      req.params.meetingId,
      { status: req.query.status, assigneeId: req.query.assigneeId },
      req.user?.id
    )

    res.json({ actionItems })
  } catch (error) {
    next(error)
  }
}

export const create = async (req, res, next) => {
  try {
    const { actionItem } = await createActionItem(
      req.params.meetingId,
      req.body ?? {},
      req.user?.id
    )

    res.status(201).json({ actionItem })
  } catch (error) {
    next(error)
  }
}

export const update = async (req, res, next) => {
  try {
    const { actionItem } = await updateActionItem(
      req.params.id,
      req.body ?? {},
      req.user?.id
    )

    res.json({ actionItem })
  } catch (error) {
    next(error)
  }
}

export const remove = async (req, res, next) => {
  try {
    await deleteActionItem(req.params.id, req.user?.id)

    res.status(204).end()
  } catch (error) {
    next(error)
  }
}
