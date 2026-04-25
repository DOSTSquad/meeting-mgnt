import {
  getMinutesForMeeting,
  updateMinutes,
} from '../services/minutes-service.js'

export const getForMeeting = async (req, res, next) => {
  try {
    const { minutes } = await getMinutesForMeeting(
      req.params.meetingId,
      req.user?.id
    )

    res.json({ minutes })
  } catch (error) {
    next(error)
  }
}

export const update = async (req, res, next) => {
  try {
    const { minutes } = await updateMinutes(
      req.params.id,
      req.body ?? {},
      req.user?.id
    )

    res.json({ minutes })
  } catch (error) {
    next(error)
  }
}
