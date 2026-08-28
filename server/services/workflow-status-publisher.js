import { getPublisherRedisConnection } from './redis-connections.js'

export const WORKFLOW_STATUS_CHANNEL =
  process.env.WORKFLOW_STATUS_CHANNEL || 'workflow:recording-status'

/**
 * Publishes a recording-status invalidation.
 *
 * PostgreSQL stays authoritative: this payload carries identifiers and status
 * labels only, never transcript text, audio, credentials, or presigned URLs.
 * Subscribers treat it as "reload from the database", not as domain state.
 *
 * Callers must publish only after the related transaction commits, otherwise a
 * subscriber can read the database before the new state is visible.
 *
 * A failed publish is logged and swallowed. Losing an invalidation degrades a
 * stream to its next snapshot; failing the job would retry work that already
 * committed.
 */
export const publishWorkflowStatus = async (
  {
    meetingId,
    recordingId,
    transcriptId = null,
    recordingStatus = null,
    transcriptStatus = null,
    analysisStatus = null,
  },
  { connection = undefined, logger = console } = {}
) => {
  const payload = {
    meetingId,
    recordingId,
    transcriptId,
    recordingStatus,
    transcriptStatus,
    analysisStatus,
    publishedAt: new Date().toISOString(),
  }

  try {
    const redis = connection ?? getPublisherRedisConnection()
    await redis.publish(WORKFLOW_STATUS_CHANNEL, JSON.stringify(payload))
    return true
  } catch (error) {
    logger.error?.('Failed to publish workflow status invalidation', {
      meetingId,
      recordingId,
      message: error.message,
    })
    return false
  }
}
