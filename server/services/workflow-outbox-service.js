import {
  claimWorkflowOutboxEvents,
  markWorkflowOutboxDispatched,
  markWorkflowOutboxFailed,
} from '../repositories/workflow-outbox-repository.js'
import { listByMeeting } from '../repositories/participant-repository.js'
import { ANALYSIS_STREAM, TRANSCRIPTION_STREAM, publishAiJob } from './ai-streams.js'

const DEFAULT_RETRY_DELAY_SECONDS = 30

const toErrorMessage = (error) => error?.message || 'Workflow dispatch failed'

const dispatchWorkflowEvent = async (event) => {
  if (event.eventType === 'recording.uploaded') {
    const { recordingId, transcriptId, analysisRunId, ...recording } = event.payload ?? {}

    await publishAiJob({
      stream: TRANSCRIPTION_STREAM,
      eventType: 'transcription.requested',
      jobId: `transcription-${transcriptId}`,
      eventId: event.id,
      payload: { recordingId, transcriptId, analysisRunId, recording },
    })
    return
  }

  if (event.eventType === 'analysis.requested') {
    const { analysisRunId } = event.payload ?? {}
    const participants = event.payload?.meetingId
      ? await listByMeeting(event.payload.meetingId)
      : []

    await publishAiJob({
      stream: ANALYSIS_STREAM,
      eventType: 'analysis.requested',
      jobId: `analysis-${analysisRunId}`,
      eventId: event.id,
      payload: {
        ...event.payload,
        participants: participants.map((participant) => ({
          id: participant.userId,
          name: participant.name,
        })),
      },
    })
    return
  }

  throw new Error(`Unsupported workflow event type: ${event.eventType}`)
}

export const dispatchPendingWorkflowOutbox = async ({
  limit = 10,
  leaseSeconds = 60,
  workerId = `workflow-dispatcher-${process.pid}`,
  retryDelaySeconds = DEFAULT_RETRY_DELAY_SECONDS,
} = {}) => {
  const events = await claimWorkflowOutboxEvents({
    limit,
    leaseSeconds,
    workerId,
  })
  const results = []

  for (const event of events) {
    try {
      await dispatchWorkflowEvent(event)
      const dispatched = await markWorkflowOutboxDispatched({
        id: event.id,
        workerId: event.lockedBy,
        attempts: event.attempts,
      })
      results.push(dispatched ?? { ...event, status: 'lease_lost' })
    } catch (error) {
      const failed = await markWorkflowOutboxFailed({
        id: event.id,
        workerId: event.lockedBy,
        attempts: event.attempts,
        errorMessage: toErrorMessage(error),
        retryDelaySeconds,
      })
      results.push(failed ?? { ...event, status: 'lease_lost' })
    }
  }

  return results
}
