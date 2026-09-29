import { applyGeneratedMinutes } from '../services/apply-minutes-service.js'
import { getMinutesForMeeting, updateMinutesForMeeting } from '../services/minute-service.js'

export const getForMeeting = async (req, res, next) => {
  try {
    const { minutes } = await getMinutesForMeeting(
      req.params.meetingId,
      req.user?.id,
      req.user?.role
    )

    res.json({ minutes })
  } catch (error) {
    next(error)
  }
}

export const updateForMeeting = async (req, res, next) => {
  try {
    const { minutes } = await updateMinutesForMeeting({
      meetingId: req.params.meetingId,
      minuteId: req.params.minutesId,
      input: req.body ?? {},
      callerId: req.user?.id,
      callerRole: req.user?.role,
    })

    res.json({ minutes })
  } catch (error) {
    next(error)
  }
}

export const applyGeneratedForMeeting = async (req, res, next) => {
  try {
    const result = await applyGeneratedMinutes({
      meetingId: req.params.meetingId,
      analysisRunId: req.body?.analysisRunId,
      expectedVersion: Number(req.body?.expectedVersion),
      callerId: req.user?.id,
      callerRole: req.user?.role,
    })

    res.json(result)
  } catch (error) {
    // A concurrency conflict carries the current version so the client can show
    // the caller what they are about to overwrite.
    if (error.statusCode === 409 && error.currentVersion !== undefined) {
      res.status(409).json({
        error: error.message,
        currentVersion: error.currentVersion,
        minutes: error.minutes,
      })
      return
    }

    next(error)
  }
}
