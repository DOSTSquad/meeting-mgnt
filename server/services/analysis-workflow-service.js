import { transaction } from '../db/postgres.js'
import {
  completeAnalysisRun,
  failAnalysisRun,
  findAnalysisRunById,
  startAnalysisRun,
} from '../repositories/analysis-run-repository.js'
import { lockRecordingById } from '../repositories/recording-repository.js'
import { replaceSuggestionsForAnalysisRun } from '../repositories/analysis-suggestion-repository.js'
import { findTranscriptById } from '../repositories/transcript-repository.js'

const STALE = { stale: true }

// Same lock order as the transcription transitions: recording first, then the
// rows hanging off it. A consistent order across every workflow transaction is
// what stops a concurrent transcription failure and an analysis write from
// deadlocking on the same recording.
const lockWorkflow = async (client, recordingId) => {
  if (recordingId) {
    await lockRecordingById(recordingId, client)
  }
}

export const startAnalysis = async ({ analysisRunId, transcriptId, recordingId }) =>
  transaction(async (client) => {
    await lockWorkflow(client, recordingId)

    // The transcript is read here rather than carried in the job payload, so
    // Redis never holds transcript text.
    const transcript = await findTranscriptById(transcriptId, client)

    if (!transcript || transcript.status !== 'completed') {
      return STALE
    }

    const analysisRun = await startAnalysisRun({ id: analysisRunId, transcriptId }, client)

    if (!analysisRun) {
      return STALE
    }

    return { stale: false, analysisRun, transcript }
  })

export const completeAnalysis = async ({ analysisRunId, transcriptId, recordingId, result }) =>
  transaction(async (client) => {
    await lockWorkflow(client, recordingId)

    const analysisRun = await completeAnalysisRun(
      {
        id: analysisRunId,
        transcriptId,
        summary: result.summary,
        keyDiscussions: result.keyDiscussions,
        decisions: result.decisions,
        provider: result.provider,
        model: result.model,
        promptVersion: result.promptVersion,
      },
      client
    )

    if (!analysisRun) {
      return STALE
    }

    // Written in the same transaction as the run reaching ready_for_review, so
    // a reviewer never sees a ready run with a previous attempt's suggestions.
    const suggestions = await replaceSuggestionsForAnalysisRun(
      {
        analysisRunId,
        meetingId: analysisRun.meetingId,
        suggestions: result.suggestions,
      },
      client
    )

    return { stale: false, analysisRun, suggestions }
  })

export const failAnalysis = async ({ analysisRunId, transcriptId, recordingId, errorMessage }) =>
  transaction(async (client) => {
    await lockWorkflow(client, recordingId)

    const analysisRun = await failAnalysisRun(
      { id: analysisRunId, transcriptId, errorMessage },
      client
    )

    if (!analysisRun) {
      return STALE
    }

    return { stale: false, analysisRun }
  })

export const loadAnalysisRun = async (analysisRunId) => findAnalysisRunById(analysisRunId)
