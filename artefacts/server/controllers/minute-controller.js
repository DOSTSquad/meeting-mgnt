import { getMinutesForMeeting, updateMinutesForMeeting } from '../services/minute-service.js'

export const getForMeeting = async (req, res, next) => {
  try {
    const { minutes } = await getMinutesForMeeting(req.params.meetingId, req.user?.id)

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
    })

    res.json({ minutes })
  } catch (error) {
    next(error)
  }
}
