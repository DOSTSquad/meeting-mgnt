import {
  addParticipantsToMeeting,
  listParticipantsForMeeting,
  removeParticipant,
  updateParticipant,
} from '../services/participant-service.js'

export const list = async (req, res, next) => {
  try {
    const { participants } = await listParticipantsForMeeting(req.params.meetingId)

    res.json({ participants })
  } catch (error) {
    next(error)
  }
}

export const add = async (req, res, next) => {
  try {
    const { participants } = await addParticipantsToMeeting(
      req.params.meetingId,
      req.body ?? {},
      req.user?.id
    )

    res.status(201).json({ participants })
  } catch (error) {
    next(error)
  }
}

export const update = async (req, res, next) => {
  try {
    const { participant } = await updateParticipant(
      req.params.meetingId,
      req.params.userId,
      req.body ?? {},
      req.user?.id
    )

    res.json({ participant })
  } catch (error) {
    next(error)
  }
}

export const remove = async (req, res, next) => {
  try {
    await removeParticipant(req.params.meetingId, req.params.userId, req.user?.id)

    res.status(204).end()
  } catch (error) {
    next(error)
  }
}
