import { randomUUID } from 'node:crypto'

import { findMeetingById } from '../repositories/meeting-repository.js'
import { listByMeeting } from '../repositories/participant-repository.js'
import {
  archiveRecording,
  createRecording,
  findActiveRecordingByMeetingId,
  updateRecordingStatus,
} from '../repositories/recording-repository.js'
import {
  createTranscript,
  findLatestTranscriptByRecordingId,
} from '../repositories/transcript-repository.js'
import { BUCKET_AUDIO, putObject, removeObject } from './minio-client.js'

const createHttpError = (message, statusCode) => {
  const error = new Error(message)
  error.statusCode = statusCode

  return error
}

const assertAudioFile = (file) => {
  if (!file) {
    throw createHttpError('No recording provided', 400)
  }

  if (!file.mimetype?.startsWith('audio/')) {
    throw createHttpError('Recording must be an audio file', 415)
  }
}

const loadMeetingOrThrow = async (meetingId) => {
  const meeting = await findMeetingById(meetingId)

  if (!meeting) {
    throw createHttpError('Meeting not found', 404)
  }

  return meeting
}

const assertCanManageRecording = async (meeting, callerId) => {
  if (!callerId) {
    throw createHttpError('Authentication required', 401)
  }

  if (callerId === meeting.ownerId) {
    return
  }

  const participants = await listByMeeting(meeting.id)
  const isOrganizer = participants.some(
    (participant) => participant.userId === callerId && participant.role === 'organizer'
  )

  if (!isOrganizer) {
    throw createHttpError('Only the meeting creator or an organizer can manage recordings', 403)
  }
}

const assertCanViewRecording = async (meeting, callerId) => {
  if (!callerId) {
    throw createHttpError('Authentication required', 401)
  }

  if (callerId === meeting.ownerId) {
    return
  }

  const participants = await listByMeeting(meeting.id)
  const isParticipant = participants.some((participant) => participant.userId === callerId)

  if (!isParticipant) {
    throw createHttpError('Only meeting participants can access recordings', 403)
  }
}

export const getRecordingForMeeting = async (meetingId, callerId) => {
  const meeting = await loadMeetingOrThrow(meetingId)
  await assertCanViewRecording(meeting, callerId)

  const recording = await findActiveRecordingByMeetingId(meetingId)
  const transcript = recording ? await findLatestTranscriptByRecordingId(recording.id) : null

  return { recording, transcript }
}

export const uploadRecordingForMeeting = async ({ meetingId, callerId, file, replace = false }) => {
  assertAudioFile(file)

  const meeting = await loadMeetingOrThrow(meetingId)
  await assertCanManageRecording(meeting, callerId)

  const existing = await findActiveRecordingByMeetingId(meetingId)
  if (existing && !replace) {
    throw createHttpError('Meeting already has an active recording', 409)
  }

  const id = randomUUID()
  const objectKey = `meetings/${meetingId}/recordings/${id}`

  await putObject(BUCKET_AUDIO, objectKey, file.buffer, file.size, {
    'Content-Type': file.mimetype,
  })

  if (existing) {
    await archiveRecording(existing.id)
    await removeObject(existing.bucketName, existing.objectKey)
  }

  const recording = await createRecording({
    id,
    meetingId,
    uploadedBy: callerId,
    fileName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    bucketName: BUCKET_AUDIO,
    objectKey,
  })

  return { recording, transcript: null }
}

export const archiveRecordingForMeeting = async (meetingId, callerId) => {
  const meeting = await loadMeetingOrThrow(meetingId)
  await assertCanManageRecording(meeting, callerId)

  const existing = await findActiveRecordingByMeetingId(meetingId)
  if (!existing) {
    throw createHttpError('Recording not found', 404)
  }

  const recording = await archiveRecording(existing.id)
  await removeObject(existing.bucketName, existing.objectKey)

  return { recording }
}

export const generateMinutesFromRecording = async (meetingId, callerId) => {
  const meeting = await loadMeetingOrThrow(meetingId)
  await assertCanManageRecording(meeting, callerId)

  const recording = await findActiveRecordingByMeetingId(meetingId)
  if (!recording) {
    throw createHttpError('Upload a meeting recording before generating minutes', 400)
  }

  const transcript = await createTranscript({
    meetingId,
    recordingId: recording.id,
    createdBy: callerId,
    status: 'failed',
    errorMessage: 'Speech-to-text provider is not configured',
  })
  const updatedRecording = await updateRecordingStatus({
    id: recording.id,
    status: 'failed',
    errorMessage: 'Speech-to-text provider is not configured',
  })

  return {
    recording: updatedRecording,
    transcript,
    generationStatus: 'not_configured',
  }
}
