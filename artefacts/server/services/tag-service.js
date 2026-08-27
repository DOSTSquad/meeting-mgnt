import { createTag, listTags } from '../repositories/tag-repository.js'

const createHttpError = (message, statusCode) => {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

export const listAllTags = async (callerId) => {
  if (!callerId) {
    throw createHttpError('Authentication required', 401)
  }

  const tags = await listTags()
  return { tags }
}

export const createOneTag = async (callerId, input) => {
  if (!callerId) {
    throw createHttpError('Authentication required', 401)
  }

  const name = input?.name?.trim()
  if (!name) {
    throw createHttpError('Tag name is required', 400)
  }

  const tag = await createTag(name)
  return { tag }
}
