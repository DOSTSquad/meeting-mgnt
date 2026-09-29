import { randomUUID } from 'node:crypto'

import { transaction } from '../db/postgres.js'
import {
  createAnalysisRun,
  findLatestAnalysisRunByRecordingId,
} from '../repositories/analysis-run-repository.js'
import { findMeetingById } from '../repositories/meeting-repository.js'
import { listByMeeting } from '../repositories/participant-repository.js'
import {
  archiveRecording,
  createRecording,
  findActiveRecordingByMeetingId,
  lockActiveRecordingById,
  updateRecordingStatus,
} from '../repositories/recording-repository.js'
import {
  createTranscript,
  findLatestTranscriptByRecordingId,
} from '../repositories/transcript-repository.js'
import { createWorkflowOutboxEvent } from '../repositories/workflow-outbox-repository.js'
import { BUCKET_AUDIO, putObject, removeObject } from './minio-client.js'
import { assertCan } from './permissions.js'

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

const isAiPipelineEnabled = () => process.env.AI_PIPELINE_ENABLED === 'true'

const logStorageCleanupFailure = (logger, message, error, context = {}) => {
  logger.error?.(message, {
    ...context,
    message: error?.message,
  })
}

const removeNewObjectAfterFailure = async ({ bucketName, objectKey, originalError, logger }) => {
  try {
    await removeObject(bucketName, objectKey)
  } catch (cleanupError) {
    logStorageCleanupFailure(
      logger,
      'Failed to remove newly uploaded recording after database error',
      cleanupError,
      { bucketName }
    )
  }

  throw originalError
}

const removeReplacedObjectBestEffort = async ({ bucketName, objectKey, logger }) => {
  try {
    await removeObject(bucketName, objectKey)
  } catch (error) {
    logStorageCleanupFailure(logger, 'Failed to remove replaced recording object', error, {
      bucketName,
    })
  }
}

const loadMeetingOrThrow = async (meetingId) => {
  const meeting = await findMeetingById(meetingId)

  if (!meeting) {
    throw createHttpError('Meeting not found', 404)
  }

  return meeting
}

const assertCanManageRecording = async (meeting, callerId, callerRole) => {
  const participants = await listByMeeting(meeting.id)

  assertCan(
    'meeting:manage',
    { callerId, callerRole, meeting, participants },
    'Only the meeting creator or an organizer can manage recordings'
  )
}

const assertCanViewRecording = async (meeting, callerId, callerRole) => {
  const participants = await listByMeeting(meeting.id)

  assertCan(
    'meeting:view',
    { callerId, callerRole, meeting, participants },
    'Only meeting participants can access recordings'
  )
}

export const getRecordingForMeeting = async (meetingId, callerId, callerRole) => {
  const meeting = await loadMeetingOrThrow(meetingId)
  await assertCanViewRecording(meeting, callerId, callerRole)

  const recording = await findActiveRecordingByMeetingId(meetingId)
  const transcript = recording ? await findLatestTranscriptByRecordingId(recording.id) : null
  const analysisRun = recording ? await findLatestAnalysisRunByRecordingId(recording.id) : null

  return { recording, transcript, analysisRun }
}

export const uploadRecordingForMeeting = async ({
  meetingId,
  callerId,
  callerRole,
  file,
  replace = false,
  logger = console,
}) => {
  assertAudioFile(file)

  const meeting = await loadMeetingOrThrow(meetingId)
  await assertCanManageRecording(meeting, callerId, callerRole)

  const existing = await findActiveRecordingByMeetingId(meetingId)
  if (existing && !replace) {
    throw createHttpError('Meeting already has an active recording', 409)
  }

  const id = randomUUID()
  const objectKey = `meetings/${meetingId}/recordings/${id}`

  await putObject(BUCKET_AUDIO, objectKey, file.buffer, file.size, {
    'Content-Type': file.mimetype,
  })

  let result

  try {
    result = await transaction(async (client) => {
      if (existing) {
        await archiveRecording(existing.id, client)
      }

      const recording = await createRecording(
        {
          id,
          meetingId,
          uploadedBy: callerId,
          fileName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          bucketName: BUCKET_AUDIO,
          objectKey,
          status: 'uploaded',
        },
        client
      )

      // Uploading stores the audio only. The owner explicitly starts the
      // transcription/analysis workflow via generateMinutesFromRecording.
      return { recording, transcript: null, analysisRun: null }
    })
  } catch (error) {
    await removeNewObjectAfterFailure({
      bucketName: BUCKET_AUDIO,
      objectKey,
      originalError: error,
      logger,
    })
  }

  if (existing) {
    await removeReplacedObjectBestEffort({
      bucketName: existing.bucketName,
      objectKey: existing.objectKey,
      logger,
    })
  }

  return result
}

export const generateMinutesFromRecording = async (meetingId, callerId, callerRole) => {
  const meeting = await loadMeetingOrThrow(meetingId)
  await assertCanManageRecording(meeting, callerId, callerRole)

  if (!isAiPipelineEnabled()) {
    throw createHttpError('Speech-to-text pipeline is not enabled', 503)
  }

  const recording = await findActiveRecordingByMeetingId(meetingId)
  if (!recording) {
    throw createHttpError('Upload a meeting recording before generating minutes', 400)
  }

  return transaction(async (client) => {
    const activeRecording = await lockActiveRecordingById(recording.id, client)
    if (!activeRecording) {
      throw createHttpError('Recording was replaced before generation could start', 409)
    }

    const [latestTranscript, latestAnalysisRun] = await Promise.all([
      findLatestTranscriptByRecordingId(activeRecording.id, client),
      findLatestAnalysisRunByRecordingId(activeRecording.id, client),
    ])
    const isGenerationInProgress =
      latestTranscript?.status === 'processing' ||
      ['queued', 'processing'].includes(latestAnalysisRun?.status)

    if (isGenerationInProgress) {
      throw createHttpError('Generation is already in progress', 409)
    }

    const transcript = await createTranscript(
      { meetingId, recordingId: activeRecording.id, createdBy: callerId, status: 'processing' },
      client
    )
    const analysisRun = await createAnalysisRun(
      {
        id: randomUUID(),
        meetingId,
        recordingId: activeRecording.id,
        transcriptId: transcript.id,
        createdBy: callerId,
        status: 'queued',
      },
      client
    )
    const updatedRecording = await updateRecordingStatus(
      { id: activeRecording.id, status: 'uploaded', errorMessage: null },
      client
    )
    await createWorkflowOutboxEvent(
      {
        id: randomUUID(),
        eventType: 'recording.generation_requested',
        aggregateType: 'analysis_run',
        aggregateId: analysisRun.id,
        payload: {
          recordingId: activeRecording.id,
          transcriptId: transcript.id,
          analysisRunId: analysisRun.id,
          bucketName: activeRecording.bucketName,
          objectKey: activeRecording.objectKey,
          fileName: activeRecording.fileName,
          mimeType: activeRecording.mimeType,
        },
      },
      client
    )

    return { recording: updatedRecording, transcript, analysisRun, generationStatus: 'queued' }
  })
}

export const archiveRecordingForMeeting = async (meetingId, callerId, callerRole) => {
  const meeting = await loadMeetingOrThrow(meetingId)
  await assertCanManageRecording(meeting, callerId, callerRole)

  const existing = await findActiveRecordingByMeetingId(meetingId)
  if (!existing) {
    throw createHttpError('Recording not found', 404)
  }

  const recording = await archiveRecording(existing.id)
  await removeObject(existing.bucketName, existing.objectKey)

  return { recording }
}
