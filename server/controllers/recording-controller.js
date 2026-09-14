import { getLatestAnalysisReview } from '../services/analysis-review-service.js'
import {
  archiveRecordingForMeeting,
  getRecordingForMeeting,
  uploadRecordingForMeeting,
} from '../services/recording-service.js'

export const getForMeeting = async (req, res, next) => {
  try {
    const result = await getRecordingForMeeting(req.params.meetingId, req.user?.id, req.user?.role)

    res.json(result)
  } catch (error) {
    next(error)
  }
}

export const uploadForMeeting = async (req, res, next) => {
  try {
    const result = await uploadRecordingForMeeting({
      meetingId: req.params.meetingId,
      callerId: req.user?.id,
      file: req.file,
      replace: req.body?.replace === 'true' || req.body?.replace === true,
    })

    res.status(201).json(result)
  } catch (error) {
    next(error)
  }
}

export const removeForMeeting = async (req, res, next) => {
  try {
    await archiveRecordingForMeeting(req.params.meetingId, req.user?.id)

    res.status(204).end()
  } catch (error) {
    next(error)
  }
}

export const getAnalysisForMeeting = async (req, res, next) => {
  try {
    const result = await getLatestAnalysisReview(req.params.meetingId, req.user?.id)

    res.json(result)
  } catch (error) {
    next(error)
  }
}
