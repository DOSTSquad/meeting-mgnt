import { FlowProducer } from 'bullmq'

import { getProducerRedisConnection } from './redis-connections.js'

export const TRANSCRIPTION_QUEUE_NAME =
  process.env.RECORDING_TRANSCRIPTION_QUEUE_NAME || 'recording-transcription'
export const ANALYSIS_QUEUE_NAME = process.env.RECORDING_ANALYSIS_QUEUE_NAME || 'recording-analysis'

let flowProducer

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CLOSE_TIMEOUT_MS = 500

const assertIdentifier = (name, value) => {
  if (!uuidPattern.test(value)) {
    throw new Error(`${name} must be a UUID`)
  }
}

const getFlowProducer = () => {
  if (!flowProducer) {
    flowProducer = new FlowProducer({
      connection: getProducerRedisConnection(),
    })
  }

  return flowProducer
}

export const queueRecordingAnalysisWorkflow = async ({
  recordingId,
  transcriptId,
  analysisRunId,
}) => {
  assertIdentifier('recordingId', recordingId)
  assertIdentifier('transcriptId', transcriptId)
  assertIdentifier('analysisRunId', analysisRunId)

  const analysisJobId = `analysis-${analysisRunId}`
  const transcriptionJobId = `transcription-${transcriptId}`
  const flowProducer = getFlowProducer()
  const existingFlow = await flowProducer.getFlow({
    id: analysisJobId,
    queueName: ANALYSIS_QUEUE_NAME,
  })

  if (existingFlow?.job) {
    return existingFlow
  }

  return flowProducer.add({
    name: 'analyze-recording',
    queueName: ANALYSIS_QUEUE_NAME,
    data: {
      recordingId,
      transcriptId,
      analysisRunId,
    },
    opts: {
      jobId: analysisJobId,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
    children: [
      {
        name: 'transcribe-recording',
        queueName: TRANSCRIPTION_QUEUE_NAME,
        data: {
          recordingId,
          transcriptId,
        },
        opts: {
          jobId: transcriptionJobId,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: 1000,
          removeOnFail: 5000,
          // Without this an exhausted transcription leaves the analysis parent
          // waiting on a child that will never complete.
          failParentOnFailure: true,
        },
      },
    ],
  })
}

export const closeRecordingWorkflowQueue = async () => {
  if (!flowProducer) {
    return
  }

  const currentFlowProducer = flowProducer
  flowProducer = undefined

  let timeout
  let closed = false
  await Promise.race([
    currentFlowProducer
      .close()
      .then(() => {
        closed = true
      })
      .catch(() => {}),
    new Promise((resolve) => {
      timeout = setTimeout(resolve, CLOSE_TIMEOUT_MS)
    }),
  ])
  clearTimeout(timeout)

  if (!closed) {
    currentFlowProducer.disconnect()
  }
}
