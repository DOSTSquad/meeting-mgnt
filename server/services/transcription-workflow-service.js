import { transaction } from '../db/postgres.js'
import { failPendingAnalysisRunsForTranscript } from '../repositories/analysis-run-repository.js'
import {
  lockActiveRecordingById,
  transitionActiveRecordingStatus,
} from '../repositories/recording-repository.js'
import {
  completeTranscript,
  failTranscript,
  findTranscriptById,
} from '../repositories/transcript-repository.js'

// A recording that has not started transcribing yet, or one already in flight
// after a retry or a process restart, may still be transitioned.
const RESUMABLE_RECORDING_STATUSES = ['uploaded', 'transcribing']

const STALE = { stale: true }

// Every write below is guarded in SQL rather than by a prior read: the recording
// must still be active, the transcript must still belong to it and still be
// `processing`. A guard that matches nothing means the recording was archived or
// replaced, or another attempt already finished, so the job is stale and must
// not touch current state.
const loadCurrentTranscript = async (client, { recordingId, transcriptId }) => {
  const recording = await lockActiveRecordingById(recordingId, client)

  if (!recording) {
    return null
  }

  const transcript = await findTranscriptById(transcriptId, client)

  if (!transcript || transcript.recordingId !== recordingId) {
    return null
  }

  return { recording, transcript }
}

export const startTranscription = async ({ recordingId, transcriptId }) =>
  transaction(async (client) => {
    const current = await loadCurrentTranscript(client, { recordingId, transcriptId })

    if (!current || current.transcript.status !== 'processing') {
      return STALE
    }

    const recording = await transitionActiveRecordingStatus(
      {
        id: recordingId,
        status: 'transcribing',
        expectedStatuses: RESUMABLE_RECORDING_STATUSES,
      },
      client
    )

    if (!recording) {
      return STALE
    }

    return { stale: false, recording, transcript: current.transcript }
  })

export const completeTranscription = async ({ recordingId, transcriptId, result }) =>
  transaction(async (client) => {
    const current = await loadCurrentTranscript(client, { recordingId, transcriptId })

    if (!current) {
      return STALE
    }

    const transcript = await completeTranscript(
      {
        id: transcriptId,
        recordingId,
        transcriptText: result.text,
        segments: result.segments,
        durationSeconds: result.durationSeconds,
      },
      client
    )

    if (!transcript) {
      return STALE
    }

    const recording = await transitionActiveRecordingStatus(
      {
        id: recordingId,
        status: 'transcribed',
        expectedStatuses: RESUMABLE_RECORDING_STATUSES,
        durationSeconds: result.durationSeconds,
      },
      client
    )

    if (!recording) {
      return STALE
    }

    return { stale: false, recording, transcript }
  })

/**
 * Terminal failure. The transcript and its pending analysis runs are keyed by
 * their own identifiers, so failing them is safe even when the recording has
 * since been archived — it cannot reach a replacement. The recording status is
 * only moved while the recording is still the active one.
 */
export const failTranscription = async ({ recordingId, transcriptId, errorMessage }) =>
  transaction(async (client) => {
    const transcript = await failTranscript({ id: transcriptId, recordingId, errorMessage }, client)

    if (!transcript) {
      return STALE
    }

    const analysisRuns = await failPendingAnalysisRunsForTranscript(
      { transcriptId, errorMessage },
      client
    )
    const recording = await transitionActiveRecordingStatus(
      {
        id: recordingId,
        status: 'failed',
        errorMessage,
        expectedStatuses: RESUMABLE_RECORDING_STATUSES,
      },
      client
    )

    return { stale: false, recording, transcript, analysisRuns }
  })
