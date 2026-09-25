import {
  getParticipantChangeRequests,
  getMeetingChangeRequests,
  markMeetingChangeRequestRead,
  submitMeetingChangeRequest,
} from '../services/meeting-change-request-service.js'

export const markRead = async (req, res, next) => {
  try {
    const changeRequest = await markMeetingChangeRequestRead(
      req.params.meetingId,
      req.params.requestId,
      req.user?.id
    )
    res.json({ changeRequest })
  } catch (error) {
    next(error)
  }
}

export const inbox = async (req, res, next) => {
  try {
    const changeRequests = await getMeetingChangeRequests(req.params.meetingId, req.user?.id)
    res.json({ changeRequests })
  } catch (error) {
    next(error)
  }
}

export const create = async (req, res, next) => {
  try {
    const changeRequest = await submitMeetingChangeRequest(
      req.params.meetingId,
      req.user?.id,
      req.body.message
    )
    res.status(201).json({ changeRequest })
  } catch (error) {
    next(error)
  }
}

export const list = async (req, res, next) => {
  try {
    const changeRequests = await getParticipantChangeRequests(
      req.params.meetingId,
      req.params.userId,
      req.user?.id
    )
    res.json({ changeRequests })
  } catch (error) {
    next(error)
  }
}
