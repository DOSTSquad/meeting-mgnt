import { completeAnalysis, failAnalysis, startAnalysis } from './analysis-workflow-service.js'
import { createAiResultConsumer } from './ai-streams.js'
import { validateAnalysisResult } from './analysis/analysis-schema.js'
import { getObject } from './minio-client.js'
import { findTranscriptById } from '../repositories/transcript-repository.js'
import {
  completeTranscription,
  failTranscription,
  startTranscription,
} from './transcription-workflow-service.js'
import { publishWorkflowStatus } from './workflow-status-publisher.js'

const readJsonObject = async ({ bucket, key }) => {
  if (!bucket || !key) {
    throw new Error('AI result requires a bucket and object key')
  }

  const stream = await getObject(bucket, key)
  const chunks = []

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const publishTranscriptionStatus = async (result, logger) => {
  if (!result?.recording) {
    return
  }

  await publishWorkflowStatus(
    {
      meetingId: result.recording.meetingId,
      recordingId: result.recording.id,
      transcriptId: result.transcript?.id ?? null,
      recordingStatus: result.recording.status,
      transcriptStatus: result.transcript?.status ?? null,
    },
    { logger }
  )
}

const publishAnalysisStatus = async (result, logger) => {
  if (!result?.analysisRun) {
    return
  }

  await publishWorkflowStatus(
    {
      meetingId: result.analysisRun.meetingId,
      recordingId: result.analysisRun.recordingId,
      transcriptId: result.analysisRun.transcriptId,
      analysisStatus: result.analysisRun.status,
    },
    { logger }
  )
}

export const handleAiResult = async ({ eventType, payload, logger = console }) => {
  if (eventType === 'transcription.started') {
    const result = await startTranscription(payload)
    if (!result.stale) {
      await publishTranscriptionStatus(result, logger)
    }
    return result
  }

  if (eventType === 'transcription.completed') {
    const artifact = await readJsonObject(payload.resultRef)
    const result = await completeTranscription({
      recordingId: payload.recordingId,
      transcriptId: payload.transcriptId,
      analysisRunId: payload.analysisRunId,
      result: { ...artifact, resultRef: payload.resultRef },
    })

    if (!result.stale) {
      await publishTranscriptionStatus(result, logger)
    }
    return result
  }

  if (eventType === 'transcription.failed') {
    const result = await failTranscription(payload)
    if (!result.stale) {
      await publishTranscriptionStatus(result, logger)
    }
    return result
  }

  if (eventType === 'analysis.started') {
    const result = await startAnalysis(payload)
    if (!result.stale) {
      await publishAnalysisStatus(result, logger)
    }
    return result
  }

  if (eventType === 'analysis.completed') {
    const artifact = await readJsonObject(payload.resultRef)
    const transcript = await findTranscriptById(payload.transcriptId)

    if (!transcript) {
      throw new Error(`Transcript ${payload.transcriptId} was not found`)
    }

    validateAnalysisResult(artifact, { segmentCount: transcript.segments?.length ?? 0 })
    const result = await completeAnalysis({
      ...payload,
      result: artifact,
    })

    if (!result.stale) {
      await publishAnalysisStatus(result, logger)
    }
    return result
  }

  if (eventType === 'analysis.failed') {
    const result = await failAnalysis(payload)
    if (!result.stale) {
      await publishAnalysisStatus(result, logger)
    }
    return result
  }

  throw new Error(`Unsupported AI result event type: ${eventType}`)
}

export const createAiResultConsumerService = ({ logger = console, ...options } = {}) => {
  const consumer = createAiResultConsumer({
    ...options,
    logger,
    onMessage: (message) =>
      handleAiResult({ eventType: message.eventType, payload: message.payload, logger }),
  })

  return consumer
}
