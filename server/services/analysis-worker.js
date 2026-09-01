import { Worker } from 'bullmq'

import { listByMeeting as listParticipantsByMeeting } from '../repositories/participant-repository.js'
import { getAnalysisAdapter } from './analysis/analysis-adapter.js'
import { validateAnalysisResult } from './analysis/analysis-schema.js'
import { completeAnalysis, failAnalysis, startAnalysis } from './analysis-workflow-service.js'
import { ANALYSIS_QUEUE_NAME } from './recording-workflow-queue.js'
import { getWorkerRedisConnection } from './redis-connections.js'
import { publishWorkflowStatus } from './workflow-status-publisher.js'

const DEFAULT_CONCURRENCY = 2
const DEFAULT_LOCK_DURATION_MS = 120000

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export const getAnalysisWorkerConfig = (environment = process.env) => ({
  concurrency: parsePositiveInteger(
    environment.RECORDING_ANALYSIS_CONCURRENCY,
    DEFAULT_CONCURRENCY
  ),
  lockDurationMs: parsePositiveInteger(
    environment.RECORDING_ANALYSIS_TIMEOUT_MS,
    DEFAULT_LOCK_DURATION_MS
  ),
})

const isFinalAttempt = (job) => (job.attemptsMade ?? 0) + 1 >= (job.opts?.attempts ?? 1)

/**
 * Builds the analysis job processor.
 *
 * BullMQ runs this parent job only once its transcription child has completed,
 * and the child carries `failParentOnFailure: true`, so a failed transcription
 * means this never executes. The dependency is enforced by the flow rather than
 * by a status check here.
 */
export const createAnalysisJobProcessor = ({
  adapter,
  logger = console,
  onStart = startAnalysis,
  onComplete = completeAnalysis,
  onFail = failAnalysis,
  publishStatus = publishWorkflowStatus,
  validate = validateAnalysisResult,
  loadParticipants = listParticipantsByMeeting,
} = {}) => {
  if (!adapter) {
    throw new Error('Analysis job processor requires an adapter')
  }

  const publishAfterCommit = async ({ analysisRun }) => {
    if (!analysisRun) {
      return
    }

    await publishStatus(
      {
        meetingId: analysisRun.meetingId,
        recordingId: analysisRun.recordingId,
        transcriptId: analysisRun.transcriptId,
        recordingStatus: null,
        transcriptStatus: null,
        analysisStatus: analysisRun.status,
      },
      { logger }
    )
  }

  return async (job) => {
    const { recordingId, transcriptId, analysisRunId } = job.data ?? {}

    if (!transcriptId || !analysisRunId) {
      throw new Error('Analysis job requires transcriptId and analysisRunId')
    }

    const started = await onStart({ analysisRunId, transcriptId, recordingId })

    if (started.stale) {
      logger.log?.('Skipping stale analysis job', { analysisRunId, transcriptId })
      return { status: 'skipped', reason: 'stale' }
    }

    await publishAfterCommit(started)

    try {
      // An owner the provider names can only resolve to someone in this
      // meeting. Passing the roster in keeps that decision with the adapter's
      // mapping while the rule itself stays here, out of the provider client.
      const participants = await loadParticipants(started.analysisRun.meetingId)

      const result = await adapter.analyse({
        transcript: started.transcript,
        analysisRun: started.analysisRun,
        participants: participants.map((person) => ({ id: person.userId, name: person.name })),
      })

      // Adapter output is untrusted, including the fixture's. Validating before
      // the write means a malformed result fails the run rather than persisting
      // a half-built review, and evidence indexes are checked against this
      // transcript so a citation can never point outside it.
      validate(result, { segmentCount: started.transcript.segments?.length ?? 0 })

      const completed = await onComplete({
        analysisRunId,
        transcriptId,
        recordingId,
        result: { ...result, provider: adapter.name },
      })

      if (completed.stale) {
        logger.log?.('Discarding analysis result for stale run', { analysisRunId })
        return { status: 'skipped', reason: 'stale' }
      }

      await publishAfterCommit(completed)

      return { status: 'ready_for_review', analysisRunId }
    } catch (error) {
      if (!isFinalAttempt(job)) {
        logger.warn?.('Analysis attempt failed, will retry', {
          analysisRunId,
          attemptsMade: job.attemptsMade,
          message: error.message,
        })
        throw error
      }

      const failed = await onFail({
        analysisRunId,
        transcriptId,
        recordingId,
        errorMessage: error.message || 'Analysis failed',
      })

      if (!failed.stale) {
        await publishAfterCommit(failed)
      }

      throw error
    }
  }
}

export const createAnalysisWorker = ({
  queueName = ANALYSIS_QUEUE_NAME,
  connection = undefined,
  environment = process.env,
  logger = console,
  adapter = undefined,
  processJob = undefined,
  createWorker = (name, processor, options) => new Worker(name, processor, options),
  ...processorOptions
} = {}) => {
  const config = getAnalysisWorkerConfig(environment)
  let worker
  let processor = processJob

  const start = () => {
    if (worker) {
      return worker
    }

    if (!processor) {
      processor = createAnalysisJobProcessor({
        adapter: adapter ?? getAnalysisAdapter(environment),
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
      logger.error?.('Analysis worker error', { message: error.message })
    })

    logger.log?.(`Analysis worker listening on ${queueName}`)

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
