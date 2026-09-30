const WAITING_FOR_WORKER = 'Waiting for the AI worker...'

const PIPELINE_KEYS = ['uploading', 'transcribing', 'analysing', 'completed']

const STEP_LABELS = {
  uploading: 'Uploading',
  transcribing: 'Transcribing',
  analysing: 'Analysing',
  completed: 'Completed',
}

const DEFAULT_DESCRIPTIONS = {
  uploading: 'File uploaded successfully.',
  transcribing: 'Converting audio to text...',
  analysing: 'Generating insights and key points...',
  completed: 'Recording ready to view.',
}

const buildStep = (key, state, description) => ({
  key,
  label: STEP_LABELS[key],
  description: description ?? DEFAULT_DESCRIPTIONS[key],
  state,
})

const getUploadDescription = (extractProgress) =>
  typeof extractProgress === 'number'
    ? `Extracting audio ${Math.round(extractProgress * 100)}%...`
    : 'Uploading recording...'

const getTranscriptionStep = ({ recording, transcript }) => {
  if (transcript?.status === 'failed') {
    return buildStep('transcribing', 'failed', transcript.errorMessage || 'Transcription failed.')
  }

  if (transcript?.status === 'completed') {
    return buildStep('transcribing', 'done', 'Transcript is ready.')
  }

  if (transcript?.status === 'processing') {
    // The recording only moves to `transcribing` once the AI worker reports it started.
    const isQueued = recording.status !== 'transcribing'

    return buildStep('transcribing', 'active', isQueued ? WAITING_FOR_WORKER : undefined)
  }

  if (recording.status === 'failed') {
    return buildStep('transcribing', 'failed', recording.errorMessage || 'Transcription failed.')
  }

  return buildStep('transcribing', 'pending')
}

const getAnalysisStep = ({ transcriptionStep, analysisRun }) => {
  if (transcriptionStep.state !== 'done') {
    return buildStep('analysing', 'pending')
  }

  if (analysisRun?.status === 'ready_for_review') {
    return buildStep('analysing', 'done', 'Analysis is ready for review.')
  }

  if (analysisRun?.status === 'failed') {
    return buildStep('analysing', 'failed', analysisRun.errorMessage || 'Analysis failed.')
  }

  if (analysisRun?.status === 'cancelled') {
    return buildStep('analysing', 'failed', 'Analysis was cancelled.')
  }

  if (analysisRun?.status === 'queued') {
    return buildStep('analysing', 'active', WAITING_FOR_WORKER)
  }

  if (analysisRun?.status === 'processing') {
    return buildStep('analysing', 'active')
  }

  return buildStep('analysing', 'pending')
}

const getPill = (steps) => {
  if (steps.some((step) => step.state === 'failed')) {
    return 'failed'
  }

  if (steps.every((step) => step.state === 'done')) {
    return 'ready'
  }

  if (steps.some((step) => step.state === 'active')) {
    return 'processing'
  }

  return 'hidden'
}

/**
 * Maps the recording, transcript and analysis run onto the four pipeline steps.
 * `pendingUpload` is the client-side upload in flight (`{ extractProgress }`); it is not part of
 * the API data, and while it runs every later step waits, even if an older recording exists.
 */
export const getRecordingProgress = ({
  recording,
  transcript,
  analysisRun,
  pendingUpload,
} = {}) => {
  if (pendingUpload || !recording) {
    const steps = PIPELINE_KEYS.map((key) =>
      key === 'uploading' && pendingUpload
        ? buildStep(key, 'active', getUploadDescription(pendingUpload.extractProgress))
        : buildStep(key, 'pending')
    )

    return { pill: getPill(steps), steps }
  }

  const transcriptionStep = getTranscriptionStep({ recording, transcript })
  const analysisStep = getAnalysisStep({ transcriptionStep, analysisRun })
  const completedStep = buildStep('completed', analysisStep.state === 'done' ? 'done' : 'pending')
  const steps = [buildStep('uploading', 'done'), transcriptionStep, analysisStep, completedStep]

  return { pill: getPill(steps), steps }
}
