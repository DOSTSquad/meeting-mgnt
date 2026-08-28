import { findLatestAnalysisRunByRecordingId } from '../repositories/analysis-run-repository.js'
import { listSuggestionsForAnalysisRun } from '../repositories/analysis-suggestion-repository.js'
import { findActiveRecordingByMeetingId } from '../repositories/recording-repository.js'
import { findLatestTranscriptByRecordingId } from '../repositories/transcript-repository.js'
import { getRecordingForMeeting } from './recording-service.js'

/**
 * Resolves the evidence indexes on a generated item into the transcript text
 * they cite.
 *
 * Done on the server so a reviewer sees the quoted passage without the client
 * having to hold the whole transcript, and so an index that no longer resolves
 * is dropped here rather than rendering as a blank quote.
 */
const withEvidence = (item, segments) => ({
  ...item,
  evidence: (item.evidence ?? [])
    .map((segmentIndex) => {
      const segment = segments[segmentIndex]

      return segment
        ? {
            segmentIndex,
            startSeconds: segment.startSeconds ?? null,
            endSeconds: segment.endSeconds ?? null,
            speaker: segment.speaker ?? null,
            text: segment.text ?? '',
          }
        : null
    })
    .filter(Boolean),
})

/**
 * The full review payload for the latest analysis of a meeting.
 *
 * Authorisation is delegated to getRecordingForMeeting, which throws 403/404, so
 * this endpoint cannot drift from the permission rules the rest of the recording
 * surface uses.
 */
export const getLatestAnalysisReview = async (meetingId, callerId) => {
  await getRecordingForMeeting(meetingId, callerId)

  const recording = await findActiveRecordingByMeetingId(meetingId)

  if (!recording) {
    return { analysisRun: null, suggestions: [], transcript: null }
  }

  const analysisRun = await findLatestAnalysisRunByRecordingId(recording.id)

  if (!analysisRun) {
    return { analysisRun: null, suggestions: [], transcript: null }
  }

  const transcript = await findLatestTranscriptByRecordingId(recording.id)
  const segments = Array.isArray(transcript?.segments) ? transcript.segments : []
  const suggestions = await listSuggestionsForAnalysisRun(analysisRun.id)

  return {
    analysisRun: {
      ...analysisRun,
      keyDiscussions: analysisRun.keyDiscussions.map((item) => withEvidence(item, segments)),
      decisions: analysisRun.decisions.map((item) => withEvidence(item, segments)),
    },
    suggestions: suggestions.map((item) => withEvidence(item, segments)),
    transcript: transcript
      ? { id: transcript.id, status: transcript.status, segmentCount: segments.length }
      : null,
  }
}
