import {
  claimWorkflowOutboxEvents,
  markWorkflowOutboxDispatched,
  markWorkflowOutboxFailed,
} from '../repositories/workflow-outbox-repository.js'
import { queueRecordingAnalysisWorkflow } from './recording-workflow-queue.js'

const DEFAULT_RETRY_DELAY_SECONDS = 30

const toErrorMessage = (error) => error?.message || 'Workflow dispatch failed'

const dispatchWorkflowEvent = async (event) => {
  if (event.eventType !== 'recording.uploaded') {
    throw new Error(`Unsupported workflow event type: ${event.eventType}`)
  }

  const { recordingId, transcriptId, analysisRunId } = event.payload ?? {}

  await queueRecordingAnalysisWorkflow({
    recordingId,
    transcriptId,
    analysisRunId,
  })
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
