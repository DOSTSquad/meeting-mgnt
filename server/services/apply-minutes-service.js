import { findAnalysisRunById } from '../repositories/analysis-run-repository.js'
import { findMeetingById } from '../repositories/meeting-repository.js'
import {
  applyGeneratedMinuteContent,
  createDraftMinute,
  findMinuteByMeetingId,
} from '../repositories/minute-repository.js'
import { listByMeeting } from '../repositories/participant-repository.js'

const createHttpError = (message, statusCode, extra = {}) => {
  const error = new Error(message)
  error.statusCode = statusCode

  return Object.assign(error, extra)
}

const assertCanManageMinutes = async (meeting, callerId) => {
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
    throw createHttpError(
      'Only the meeting creator or an organizer can apply generated minutes',
      403
    )
  }
}

/**
 * Renders the generated sections into the text columns the minutes editor uses.
 *
 * Evidence indexes are dropped here: they are review aids for deciding whether
 * to apply, not part of the minutes a reader sees afterwards.
 */
const renderDiscussions = (keyDiscussions) =>
  keyDiscussions
    .map((item) => `${item.topic}\n${item.detail}`.trim())
    .filter(Boolean)
    .join('\n\n')

const renderDecisions = (decisions) =>
  decisions
    .map((item) => (item.rationale ? `${item.decision}\n${item.rationale}` : item.decision).trim())
    .filter(Boolean)
    .join('\n\n')

/**
 * Applies a reviewed analysis run to the meeting's draft minutes.
 *
 * The generated result is read from the database; the provider is never called
 * again. A preview is not minutes until this succeeds.
 */
export const applyGeneratedMinutes = async ({
  meetingId,
  analysisRunId,
  expectedVersion,
  callerId,
}) => {
  const meeting = await findMeetingById(meetingId)

  if (!meeting) {
    throw createHttpError('Meeting not found', 404)
  }

  await assertCanManageMinutes(meeting, callerId)

  const analysisRun = await findAnalysisRunById(analysisRunId)

  if (!analysisRun) {
    throw createHttpError('Analysis run not found', 404)
  }

  // Checked explicitly rather than relying on the caller sending the right id:
  // an analysis run from another meeting must never be applied here.
  if (analysisRun.meetingId !== meetingId) {
    throw createHttpError('Analysis run does not belong to this meeting', 404)
  }

  if (analysisRun.status !== 'ready_for_review') {
    throw createHttpError('Analysis run is not ready for review', 409)
  }

  const existing = await findMinuteByMeetingId(meetingId)
  const minutes = existing ?? (await createDraftMinute({ meetingId, preparedBy: callerId }))

  const applied = await applyGeneratedMinuteContent({
    meetingId,
    minuteId: minutes.id,
    expectedVersion,
    content: analysisRun.summary ?? '',
    keyDiscussions: renderDiscussions(analysisRun.keyDiscussions ?? []),
    decisions: renderDecisions(analysisRun.decisions ?? []),
    generatedFromTranscriptId: analysisRun.transcriptId,
  })

  if (!applied) {
    // Someone edited the minutes between the caller reading the version and
    // sending this. Report the conflict with the current version so the client
    // can show what changed; never overwrite.
    const current = await findMinuteByMeetingId(meetingId)

    throw createHttpError('Minutes were modified by someone else', 409, {
      currentVersion: current?.version ?? null,
      minutes: current ?? null,
    })
  }

  // Status is untouched on purpose: applying generated content never approves or
  // publishes anything. The result stays a draft for a human to finish.
  return { minutes: applied }
}
