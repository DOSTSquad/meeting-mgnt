import {
  confirmRequestForUser,
  createRequestForUser,
  getInviteeRequestForUser,
  getPublicInvitationByToken,
  getRequestForUser,
  replaceInviteesForRequest,
  replaceTimeOptionsForRequest,
  sendInvitationsForRequest,
  submitAvailabilityForInvitee,
  submitPublicAvailabilityByToken,
  terminateRequestForUser,
  updateRequestForUser,
} from '../services/meeting-request-service.js'

export const create = async (req, res, next) => {
  try {
    const { meetingRequest } = await createRequestForUser(req.body ?? {}, req.user?.id)

    res.status(201).json({ meetingRequest })
  } catch (error) {
    next(error)
  }
}

export const getOne = async (req, res, next) => {
  try {
    const detail = await getRequestForUser(req.params.requestId, req.user?.id)

    res.json(detail)
  } catch (error) {
    next(error)
  }
}

export const update = async (req, res, next) => {
  try {
    const { meetingRequest } = await updateRequestForUser(
      req.params.requestId,
      req.body ?? {},
      req.user?.id
    )

    res.json({ meetingRequest })
  } catch (error) {
    next(error)
  }
}

export const getInviteeDetail = async (req, res, next) => {
  try {
    const detail = await getInviteeRequestForUser(
      req.params.requestId,
      req.params.inviteeId,
      req.user?.id
    )

    res.json(detail)
  } catch (error) {
    next(error)
  }
}

export const getPublicInvitation = async (req, res, next) => {
  try {
    const detail = await getPublicInvitationByToken(req.params.token)

    res.json(detail)
  } catch (error) {
    next(error)
  }
}

export const sendInvitations = async (req, res, next) => {
  try {
    const result = await sendInvitationsForRequest(req.params.requestId, req.user?.id)

    res.json(result)
  } catch (error) {
    next(error)
  }
}

export const replaceTimeOptions = async (req, res, next) => {
  try {
    const { timeOptions } = await replaceTimeOptionsForRequest(
      req.params.requestId,
      req.body ?? {},
      req.user?.id
    )

    res.json({ timeOptions })
  } catch (error) {
    next(error)
  }
}

export const replaceInvitees = async (req, res, next) => {
  try {
    const { invitees } = await replaceInviteesForRequest(
      req.params.requestId,
      req.body ?? {},
      req.user?.id
    )

    res.json({ invitees })
  } catch (error) {
    next(error)
  }
}

export const submitAvailability = async (req, res, next) => {
  try {
    const { responses } = await submitAvailabilityForInvitee(
      req.params.requestId,
      req.params.inviteeId,
      req.body ?? {},
      req.user?.id
    )

    res.json({ responses })
  } catch (error) {
    next(error)
  }
}

export const submitPublicAvailability = async (req, res, next) => {
  try {
    const { responses } = await submitPublicAvailabilityByToken(req.params.token, req.body ?? {})

    res.json({ responses })
  } catch (error) {
    next(error)
  }
}

export const confirm = async (req, res, next) => {
  try {
    const result = await confirmRequestForUser(req.params.requestId, req.body ?? {}, req.user?.id)

    res.status(201).json(result)
  } catch (error) {
    next(error)
  }
}

export const terminate = async (req, res, next) => {
  try {
    const result = await terminateRequestForUser(
      req.params.requestId,
      req.user?.id,
      req.app?.locals?.deliverMeetingCalendar
    )

    res.json(result)
  } catch (error) {
    next(error)
  }
}
