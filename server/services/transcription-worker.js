import { Worker } from 'bullmq'

import { BUCKET_AUDIO, getObject } from './minio-client.js'
import { TRANSCRIPTION_QUEUE_NAME } from './recording-workflow-queue.js'
import { getWorkerRedisConnection } from './redis-connections.js'
import { getTranscriptionAdapter } from './transcription/transcription-adapter.js'
import {
  completeTranscription,
  failTranscription,
  startTranscription,
} from './transcription-workflow-service.js'
import { publishWorkflowStatus } from './workflow-status-publisher.js'

const DEFAULT_CONCURRENCY = 2
const DEFAULT_LOCK_DURATION_MS = 120000

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export const getTranscriptionWorkerConfig = (environment = process.env) => ({
  concurrency: parsePositiveInteger(
    environment.RECORDING_TRANSCRIPTION_CONCURRENCY,
    DEFAULT_CONCURRENCY
  ),
  lockDurationMs: parsePositiveInteger(
    environment.RECORDING_TRANSCRIPTION_TIMEOUT_MS,
    DEFAULT_LOCK_DURATION_MS
  ),
})

// BullMQ retries while `attemptsMade + 1 < opts.attempts` (see Job.moveToFailed),
// so the run that satisfies this predicate is the last one. Terminal database
// state is only written on that run; earlier failures stay retryable.
const isFinalAttempt = (job) => (job.attemptsMade ?? 0) + 1 >= (job.opts?.attempts ?? 1)

const openRecordingAudioStream = (recording) =>
  getObject(recording.bucketName || BUCKET_AUDIO, recording.objectKey)

/**
 * Builds the job processor. Every collaborator is injectable so the whole
 * success, stale, retry, and terminal-failure logic is testable without Redis,
 * PostgreSQL, or object storage.
 */
export const createTranscriptionJobProcessor = ({
  adapter,
  logger = console,
  openAudioStream = openRecordingAudioStream,
  onStart = startTranscription,
  onComplete = completeTranscription,
  onFail = failTranscription,
  publishStatus = publishWorkflowStatus,
} = {}) => {
  if (!adapter) {
    throw new Error('Transcription job processor requires an adapter')
  }

  // Publishing is deliberately outside every transaction: subscribers reload
  // from PostgreSQL, so an invalidation sent before commit could be served stale
  // state and never corrected.
  const publishAfterCommit = async ({ recording, transcript }) => {
    if (!recording) {
      return
    }

    await publishStatus(
      {
        meetingId: recording.meetingId,
        recordingId: recording.id,
        transcriptId: transcript?.id ?? null,
        recordingStatus: recording.status,
        transcriptStatus: transcript?.status ?? null,
      },
      { logger }
    )
  }

  return async (job) => {
    const { recordingId, transcriptId } = job.data ?? {}

    if (!recordingId || !transcriptId) {
      throw new Error('Transcription job requires recordingId and transcriptId')
    }

    const started = await onStart({ recordingId, transcriptId })

    if (started.stale) {
      logger.log?.('Skipping stale transcription job', { recordingId, transcriptId })
      return { status: 'skipped', reason: 'stale' }
    }

    await publishAfterCommit(started)

    try {
      const audioStream = await openAudioStream(started.recording)
      const result = await adapter.transcribe({
        recording: started.recording,
        audioStream,
      })

      const completed = await onComplete({ recordingId, transcriptId, result })

      if (completed.stale) {
        logger.log?.('Discarding transcription result for stale recording', {
          recordingId,
          transcriptId,
        })
        return { status: 'skipped', reason: 'stale' }
      }

      await publishAfterCommit(completed)

      return { status: 'completed', transcriptId }
    } catch (error) {
      if (!isFinalAttempt(job)) {
        logger.warn?.('Transcription attempt failed, will retry', {
          recordingId,
          transcriptId,
          attemptsMade: job.attemptsMade,
          message: error.message,
        })
        throw error
      }

      const failed = await onFail({
        recordingId,
        transcriptId,
        errorMessage: error.message || 'Transcription failed',
      })

      if (!failed.stale) {
        await publishAfterCommit(failed)
      }

      // Rethrow so BullMQ marks the job failed and `failParentOnFailure` on the
      // transcription child fails the waiting analysis parent.
      throw error
    }
  }
}

/**
 * Creates the transcription worker without connecting. The BullMQ worker and the
 * adapter are both resolved inside `start()`, so importing this module has no
 * side effects and the worker runtime owns the lifecycle.
 */
export const createTranscriptionWorker = ({
  queueName = TRANSCRIPTION_QUEUE_NAME,
  connection = undefined,
  environment = process.env,
  logger = console,
  adapter = undefined,
  processJob = undefined,
  createWorker = (name, processor, options) => new Worker(name, processor, options),
  ...processorOptions
} = {}) => {
  const config = getTranscriptionWorkerConfig(environment)
  let worker
  let processor = processJob

  const start = () => {
    if (worker) {
      return worker
    }

    if (!processor) {
      // Resolving the adapter here, rather than per job, turns a missing or
      // unknown AI_TRANSCRIPTION_PROVIDER into a startup failure instead of
      // three failed attempts on every job.
      processor = createTranscriptionJobProcessor({
        adapter: adapter ?? getTranscriptionAdapter(environment),
        logger,
        ...processorOptions,
      })
    }

    worker = createWorker(queueName, (job) => processor(job), {
      connection: connection ?? getWorkerRedisConnection(),
      concurrency: config.concurrency,
      lockDuration: config.lockDurationMs,
    })

    worker.on?.('error', (error) => {
      logger.error?.('Transcription worker error', { message: error.message })
    })

    logger.log?.(`Transcription worker listening on ${queueName}`)

    return worker
  }

  const stop = async () => {
    if (!worker) {
      return
    }

    const current = worker
    worker = undefined
    await current.close()
  }

  return { start, stop, config }
}
