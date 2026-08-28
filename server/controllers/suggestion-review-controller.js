import {
  acceptSuggestion,
  editSuggestion,
  rejectSuggestion,
} from '../services/suggestion-review-service.js'

const pickEditableFields = (body = {}) => {
  const input = {}

  for (const field of ['title', 'description', 'assigneeId', 'dueDate', 'priority']) {
    if (body[field] !== undefined) {
      input[field] = body[field]
    }
  }

  return input
}

export const editForMeeting = async (req, res, next) => {
  try {
    const input = pickEditableFields(req.body)

    if (Object.keys(input).length === 0) {
      res.status(400).json({ error: 'No updates supplied' })
      return
    }

    const result = await editSuggestion({
      meetingId: req.params.meetingId,
      suggestionId: req.params.suggestionId,
      input,
      callerId: req.user?.id,
    })

    res.json(result)
  } catch (error) {
    next(error)
  }
}

export const acceptForMeeting = async (req, res, next) => {
  try {
    const result = await acceptSuggestion({
      meetingId: req.params.meetingId,
      suggestionId: req.params.suggestionId,
      callerId: req.user?.id,
    })

    // A repeat request is answered with what already happened rather than an
    // error: the caller's intent is satisfied and nothing was duplicated.
    res.status(result.alreadyReviewed ? 200 : 201).json(result)
  } catch (error) {
    next(error)
  }
}

export const rejectForMeeting = async (req, res, next) => {
  try {
    const result = await rejectSuggestion({
      meetingId: req.params.meetingId,
      suggestionId: req.params.suggestionId,
      callerId: req.user?.id,
    })

    res.json(result)
  } catch (error) {
    next(error)
  }
}
