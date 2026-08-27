import { createOneTag, listAllTags } from '../services/tag-service.js'

export const list = async (req, res, next) => {
  try {
    const { tags } = await listAllTags(req.user?.id)
    res.json({ tags })
  } catch (error) {
    next(error)
  }
}

export const create = async (req, res, next) => {
  try {
    const { tag } = await createOneTag(req.user?.id, req.body ?? {})
    res.status(201).json({ tag })
  } catch (error) {
    next(error)
  }
}
