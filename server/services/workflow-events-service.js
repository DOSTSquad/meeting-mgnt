import { getRecordingForMeeting } from './recording-service.js'

// The transcription slice ends here. #62 extends the same stream through analysis
// readiness, at which point the terminal test moves to the analysis run.
const TERMINAL_TRANSCRIPT_STATUSES = new Set(['completed', 'failed'])

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
export const getWorkflowSnapshot = async (meetingId, callerId) => {
  const result = await getRecordingForMeeting(meetingId, callerId)

  return toWorkflowSnapshot(result)
}

export const isTranscriptionSettled = (snapshot) =>
  Boolean(snapshot?.transcript && TERMINAL_TRANSCRIPT_STATUSES.has(snapshot.transcript.status))
