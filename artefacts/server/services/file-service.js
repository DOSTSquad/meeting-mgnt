import { randomUUID } from 'node:crypto'

import { findMeetingById } from '../repositories/meeting-repository.js'
import { listByMeeting } from '../repositories/participant-repository.js'
import {
  createFile,
  deleteFile,
  findFileById,
  listFilesByMeeting,
} from '../repositories/file-repository.js'
import {
  BUCKET_AUDIO,
  BUCKET_FILES,
  getObject,
  presignedGetObject,
  putObject,
  removeObject,
} from './minio-client.js'

const TTL_SECONDS = 60

const createHttpError = (message, statusCode) => {
  const error = new Error(message)
  error.statusCode = statusCode

  return error
}

const assertManagePermission = (meeting, callerId, participants) => {
  if (!callerId) {
    throw createHttpError('Authentication required', 401)
  }

  if (callerId === meeting.createdBy) {
    return
  }

  const isOrganizer = participants.some((p) => p.userId === callerId && p.role === 'organizer')

  if (!isOrganizer) {
    throw createHttpError('Only the meeting creator or an organizer can manage files', 403)
  }
}

const assertIsParticipant = (meeting, callerId, participants) => {
  if (!callerId) {
    throw createHttpError('Authentication required', 401)
  }

  if (callerId === meeting.createdBy) {
    return
  }

  const isParticipant = participants.some((p) => p.userId === callerId)

  if (!isParticipant) {
    throw createHttpError('Only meeting participants can access files', 403)
  }
}

const loadMeetingOrThrow = async (meetingId) => {
  const meeting = await findMeetingById(meetingId)

  if (!meeting) {
    throw createHttpError('Meeting not found', 404)
  }

  return meeting
}

const getStorageTarget = (meetingId, fileId, file, storageKind) => {
  const isAudio = storageKind === 'audio' || file.mimetype?.startsWith('audio/')

  return isAudio
    ? {
        bucketName: BUCKET_AUDIO,
        objectKey: `meetings/${meetingId}/audio/${fileId}`,
      }
    : {
        bucketName: BUCKET_FILES,
        objectKey: `meetings/${meetingId}/files/${fileId}`,
      }
}

export const uploadFile = async (meetingId, callerId, file, description, storageKind = 'file') => {
  if (!file) {
    throw createHttpError('No file provided', 400)
  }

  const meeting = await loadMeetingOrThrow(meetingId)
  const participants = await listByMeeting(meetingId)
  assertIsParticipant(meeting, callerId, participants)

  const id = randomUUID()
  const { bucketName, objectKey } = getStorageTarget(meetingId, id, file, storageKind)

  await putObject(bucketName, objectKey, file.buffer, file.size, {
    'Content-Type': file.mimetype,
  })

  const fileRow = await createFile({
    id,
    meetingId,
    uploadedBy: callerId,
    fileName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    bucketName,
    objectKey,
    description: description ?? null,
  })

  return { file: fileRow }
}

export const listFiles = async (meetingId, callerId) => {
  const meeting = await loadMeetingOrThrow(meetingId)
  const participants = await listByMeeting(meetingId)
  assertIsParticipant(meeting, callerId, participants)

  const files = await listFilesByMeeting(meetingId)

  return { files }
}

const buildContentDisposition = (fileName) => {
  // RFC 6266: ASCII fallback + UTF-8 extended form for non-ASCII names.
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '')
  const utf8Encoded = encodeURIComponent(fileName)

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`
}

export const getDownloadUrl = async (fileId, callerId) => {
  const fileRow = await findFileById(fileId)

  if (!fileRow) {
    throw createHttpError('File not found', 404)
  }

  const meeting = await loadMeetingOrThrow(fileRow.meetingId)
  const participants = await listByMeeting(fileRow.meetingId)
  assertIsParticipant(meeting, callerId, participants)

  const url = await presignedGetObject(fileRow.bucketName, fileRow.objectKey, TTL_SECONDS, {
    'response-content-disposition': buildContentDisposition(fileRow.fileName),
    'response-content-type': fileRow.mimeType,
  })
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString()

  return { url, expiresAt }
}

export const deleteFileById = async (fileId, callerId) => {
  const fileRow = await findFileById(fileId)

  if (!fileRow) {
    throw createHttpError('File not found', 404)
  }

  const meeting = await loadMeetingOrThrow(fileRow.meetingId)
  const participants = await listByMeeting(fileRow.meetingId)
  assertManagePermission(meeting, callerId, participants)

  await deleteFile(fileId)
  await removeObject(fileRow.bucketName, fileRow.objectKey)
}

export const getDownloadStream = async (fileId, callerId) => {
  const fileRow = await findFileById(fileId)

  if (!fileRow) {
    throw createHttpError('File not found', 404)
  }

  const meeting = await loadMeetingOrThrow(fileRow.meetingId)
  const participants = await listByMeeting(fileRow.meetingId)
  assertIsParticipant(meeting, callerId, participants)

  const stream = await getObject(fileRow.bucketName, fileRow.objectKey)

  return { stream, file: fileRow }
}
