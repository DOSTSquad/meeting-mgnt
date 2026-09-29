import { getRecordingForMeeting } from './recording-service.js'

// A failed transcription is terminal on its own: failParentOnFailure means the
// analysis run is failed with it and nothing further will happen.
const TERMINAL_TRANSCRIPT_STATUSES = new Set(['failed'])
const TERMINAL_ANALYSIS_STATUSES = new Set(['ready_for_review', 'failed', 'cancelled'])

/**
 * Projects the workflow aggregate down to status metadata.
 *
 * Deliberately narrow: an SSE frame may carry identifiers, statuses, error
 * messages, and counts, and never transcript text, audio, credentials, or
 * presigned URLs. A client that wants the transcript body refetches
 * `GET /api/meetings/:meetingId/recording`, which is already authorised.
 *
 * `segmentCount` is included so a viewer can show progress without the content.
 */
const toWorkflowSnapshot = ({ recording, transcript, analysisRun }) => ({
  recording: recording
    ? {
        id: recording.id,
        status: recording.status,
        errorMessage: recording.errorMessage,
        durationSeconds: recording.durationSeconds,
        archivedAt: recording.archivedAt,
      }
    : null,
  transcript: transcript
    ? {
        id: transcript.id,
        status: transcript.status,
        errorMessage: transcript.errorMessage,
        durationSeconds: transcript.durationSeconds,
        segmentCount: Array.isArray(transcript.segments) ? transcript.segments.length : 0,
        completedAt: transcript.completedAt,
      }
    : null,
  analysisRun: analysisRun
    ? {
        id: analysisRun.id,
        status: analysisRun.status,
        errorMessage: analysisRun.errorMessage,
      }
    : null,
})

/**
 * Loads the authoritative snapshot from PostgreSQL, re-checking meeting access
 * every time. Reading through the recording service means the stream cannot
 * outlive the caller's permission: a participant removed mid-stream fails the
 * next reload rather than continuing to receive updates.
 */
export const getWorkflowSnapshot = async (meetingId, callerId, callerRole) => {
  const result = await getRecordingForMeeting(meetingId, callerId, callerRole)

  return toWorkflowSnapshot(result)
}

/**
 * The stream now runs through analysis readiness rather than stopping at a
 * completed transcript.
 *
 * Two ways to be done: the analysis run reached a terminal status, or the
 * transcription failed, in which case `failParentOnFailure` already failed the
 * analysis run and nothing more will arrive.
 *
 * A meeting with a completed transcript but no analysis run is *not* settled:
 * that is the window between the two jobs.
 */
export const isWorkflowSettled = (snapshot) => {
  if (snapshot?.transcript && TERMINAL_TRANSCRIPT_STATUSES.has(snapshot.transcript.status)) {
    return true
  }

  return Boolean(
    snapshot?.analysisRun && TERMINAL_ANALYSIS_STATUSES.has(snapshot.analysisRun.status)
  )
}
