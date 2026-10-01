import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getRecordingProgress } from '../src/features/meetings/recordingProgress.js'
import { formatDuration } from '../src/utils/duration.js'
import { formatFileSize } from '../src/utils/fileSize.js'

const recording = (status = 'uploaded', extra = {}) => ({ id: 'r1', status, ...extra })
const states = (progress) => progress.steps.map((step) => step.state)
const step = (progress, key) => progress.steps.find((candidate) => candidate.key === key)

test('always returns the four steps in order', () => {
  const progress = getRecordingProgress({ recording: recording() })

  assert.deepEqual(
    progress.steps.map((candidate) => candidate.key),
    ['uploading', 'transcribing', 'analysing', 'completed']
  )
  assert.deepEqual(
    progress.steps.map((candidate) => candidate.label),
    ['Uploading', 'Transcribing', 'Analysing', 'Completed']
  )
})

test('recording uploaded and generation not started: only the first step is done', () => {
  const progress = getRecordingProgress({ recording: recording() })

  assert.equal(progress.pill, 'hidden')
  assert.deepEqual(states(progress), ['done', 'pending', 'pending', 'pending'])
  assert.equal(step(progress, 'uploading').description, 'File uploaded successfully.')
  assert.equal(step(progress, 'transcribing').description, 'Converting audio to text...')
})

test('no recording: every step is pending and the pill is hidden', () => {
  const progress = getRecordingProgress({})

  assert.equal(progress.pill, 'hidden')
  assert.deepEqual(states(progress), ['pending', 'pending', 'pending', 'pending'])
})

test('upload in flight without a recording: uploading is active and the pill is processing', () => {
  const progress = getRecordingProgress({ pendingUpload: { extractProgress: null } })

  assert.equal(progress.pill, 'processing')
  assert.deepEqual(states(progress), ['active', 'pending', 'pending', 'pending'])
  assert.equal(step(progress, 'uploading').description, 'Uploading recording...')
})

test('upload in flight with video extraction: the description shows the percentage', () => {
  const progress = getRecordingProgress({ pendingUpload: { extractProgress: 0.426 } })

  assert.deepEqual(states(progress), ['active', 'pending', 'pending', 'pending'])
  assert.equal(step(progress, 'uploading').description, 'Extracting audio 43%...')
})

test('replacing a recording: the old pipeline is reset while the new upload runs', () => {
  const progress = getRecordingProgress({
    recording: recording('completed'),
    transcript: { status: 'completed' },
    analysisRun: { status: 'ready_for_review' },
    pendingUpload: { extractProgress: null },
  })

  assert.equal(progress.pill, 'processing')
  assert.deepEqual(states(progress), ['active', 'pending', 'pending', 'pending'])
})

test('queued: transcript processing while the recording is still uploaded', () => {
  const progress = getRecordingProgress({
    recording: recording('uploaded'),
    transcript: { status: 'processing' },
    analysisRun: { status: 'queued' },
  })

  assert.equal(progress.pill, 'processing')
  assert.deepEqual(states(progress), ['done', 'active', 'pending', 'pending'])
  assert.equal(step(progress, 'transcribing').description, 'Waiting for the AI worker...')
})

test('running: transcript processing while the recording is transcribing', () => {
  const progress = getRecordingProgress({
    recording: recording('transcribing'),
    transcript: { status: 'processing' },
    analysisRun: { status: 'queued' },
  })

  assert.equal(progress.pill, 'processing')
  assert.deepEqual(states(progress), ['done', 'active', 'pending', 'pending'])
  assert.equal(step(progress, 'transcribing').description, 'Converting audio to text...')
})

test('transcript completed with analysis queued: analysing is active and waiting', () => {
  const progress = getRecordingProgress({
    recording: recording('transcribed'),
    transcript: { status: 'completed' },
    analysisRun: { status: 'queued' },
  })

  assert.equal(progress.pill, 'processing')
  assert.deepEqual(states(progress), ['done', 'done', 'active', 'pending'])
  assert.equal(step(progress, 'analysing').description, 'Waiting for the AI worker...')
})

test('transcript completed with analysis processing: analysing is running', () => {
  const progress = getRecordingProgress({
    recording: recording('transcribed'),
    transcript: { status: 'completed' },
    analysisRun: { status: 'processing' },
  })

  assert.equal(progress.pill, 'processing')
  assert.deepEqual(states(progress), ['done', 'done', 'active', 'pending'])
  assert.equal(step(progress, 'analysing').description, 'Generating insights and key points...')
})

test('analysis ready for review: everything is done and the pill is ready', () => {
  const progress = getRecordingProgress({
    recording: recording('transcribed'),
    transcript: { status: 'completed' },
    analysisRun: { status: 'ready_for_review' },
  })

  assert.equal(progress.pill, 'ready')
  assert.deepEqual(states(progress), ['done', 'done', 'done', 'done'])
  assert.equal(step(progress, 'completed').description, 'Recording ready to view.')
})

test('transcript failed: transcribing is failed with its error and the rest stay pending', () => {
  const progress = getRecordingProgress({
    recording: recording('failed'),
    transcript: { status: 'failed', errorMessage: 'Audio could not be decoded' },
    analysisRun: { status: 'queued' },
  })

  assert.equal(progress.pill, 'failed')
  assert.deepEqual(states(progress), ['done', 'failed', 'pending', 'pending'])
  assert.equal(step(progress, 'transcribing').description, 'Audio could not be decoded')
})

test('transcript failed without a message falls back to a default', () => {
  const progress = getRecordingProgress({
    recording: recording('failed'),
    transcript: { status: 'failed' },
  })

  assert.equal(step(progress, 'transcribing').description, 'Transcription failed.')
})

test('analysis failed: analysing is failed with its error and transcribing stays done', () => {
  const progress = getRecordingProgress({
    recording: recording('transcribed'),
    transcript: { status: 'completed' },
    analysisRun: { status: 'failed', errorMessage: 'Model timed out' },
  })

  assert.equal(progress.pill, 'failed')
  assert.deepEqual(states(progress), ['done', 'done', 'failed', 'pending'])
  assert.equal(step(progress, 'analysing').description, 'Model timed out')
})

test('cancelled analysis is shown as failed', () => {
  const progress = getRecordingProgress({
    recording: recording('transcribed'),
    transcript: { status: 'completed' },
    analysisRun: { status: 'cancelled' },
  })

  assert.equal(progress.pill, 'failed')
  assert.equal(step(progress, 'analysing').state, 'failed')
})

test('a recording that failed before any transcript exists shows the recording error', () => {
  const progress = getRecordingProgress({
    recording: recording('failed', { errorMessage: 'AI pipeline is disabled' }),
  })

  assert.equal(progress.pill, 'failed')
  assert.deepEqual(states(progress), ['done', 'failed', 'pending', 'pending'])
  assert.equal(step(progress, 'transcribing').description, 'AI pipeline is disabled')
})

const STARTED_AT = '2026-09-01T10:00:00.000Z'
const startedAtMs = Date.parse(STARTED_AT)
const secondsAfter = (seconds) => new Date(startedAtMs + seconds * 1000).toISOString()

test('finished steps report how long each ran, from worker start to completion', () => {
  const progress = getRecordingProgress({
    recording: recording('transcribed'),
    transcript: { status: 'completed', startedAt: STARTED_AT, completedAt: secondsAfter(45) },
    analysisRun: {
      status: 'ready_for_review',
      startedAt: secondsAfter(50),
      completedAt: secondsAfter(50 + 12 * 60 + 5),
    },
  })

  assert.equal(step(progress, 'transcribing').durationMs, 45_000)
  assert.equal(step(progress, 'transcribing').runningSinceMs, null)
  assert.equal(step(progress, 'analysing').durationMs, 725_000)
  assert.equal(step(progress, 'analysing').runningSinceMs, null)
})

test('a running transcription counts up from its start using the injected now', () => {
  const progress = getRecordingProgress({
    recording: recording('transcribing'),
    transcript: { status: 'processing', startedAt: STARTED_AT },
    analysisRun: { status: 'queued' },
    now: startedAtMs + 12_500,
  })

  assert.equal(step(progress, 'transcribing').durationMs, 12_500)
  assert.equal(step(progress, 'transcribing').runningSinceMs, startedAtMs)
  assert.equal(step(progress, 'analysing').durationMs, null)
})

test('a running analysis counts up from its start while transcribing keeps its final time', () => {
  const progress = getRecordingProgress({
    recording: recording('transcribed'),
    transcript: { status: 'completed', startedAt: STARTED_AT, completedAt: secondsAfter(30) },
    analysisRun: { status: 'processing', startedAt: secondsAfter(35) },
    now: startedAtMs + 95_000,
  })

  assert.equal(step(progress, 'transcribing').durationMs, 30_000)
  assert.equal(step(progress, 'analysing').durationMs, 60_000)
  assert.equal(step(progress, 'analysing').runningSinceMs, startedAtMs + 35_000)
})

test('the running duration is a pure function of the injected now', () => {
  const input = {
    recording: recording('transcribing'),
    transcript: { status: 'processing', startedAt: STARTED_AT },
  }

  assert.equal(
    step(getRecordingProgress({ ...input, now: startedAtMs + 1_000 }), 'transcribing').durationMs,
    1_000
  )
  assert.equal(
    step(getRecordingProgress({ ...input, now: startedAtMs + 61_000 }), 'transcribing').durationMs,
    61_000
  )
})

test('steps still waiting for the AI worker have no duration', () => {
  const queuedTranscription = getRecordingProgress({
    recording: recording('uploaded'),
    transcript: { status: 'processing', startedAt: STARTED_AT },
    analysisRun: { status: 'queued' },
    now: startedAtMs + 5_000,
  })
  const queuedAnalysis = getRecordingProgress({
    recording: recording('transcribed'),
    transcript: { status: 'completed', startedAt: STARTED_AT, completedAt: secondsAfter(30) },
    analysisRun: { status: 'queued', startedAt: null },
    now: startedAtMs + 60_000,
  })

  assert.equal(step(queuedTranscription, 'transcribing').durationMs, null)
  assert.equal(step(queuedTranscription, 'transcribing').runningSinceMs, null)
  assert.equal(step(queuedAnalysis, 'analysing').durationMs, null)
  assert.equal(step(queuedAnalysis, 'analysing').runningSinceMs, null)
})

test('rows without startedAt, or a finished row without completedAt, have no duration', () => {
  const legacy = getRecordingProgress({
    recording: recording('transcribed'),
    transcript: { status: 'completed', completedAt: secondsAfter(45) },
    analysisRun: { status: 'ready_for_review', startedAt: STARTED_AT },
  })
  const running = getRecordingProgress({
    recording: recording('transcribing'),
    transcript: { status: 'processing', startedAt: null },
  })

  assert.equal(step(legacy, 'transcribing').durationMs, null)
  assert.equal(step(legacy, 'analysing').durationMs, null)
  assert.equal(step(running, 'transcribing').durationMs, null)
  assert.equal(step(running, 'transcribing').runningSinceMs, null)
})

test('failed and cancelled steps have no duration even when they had started', () => {
  const failedTranscription = getRecordingProgress({
    recording: recording('failed'),
    transcript: { status: 'failed', startedAt: STARTED_AT },
    now: startedAtMs + 10_000,
  })
  const failedAnalysis = getRecordingProgress({
    recording: recording('transcribed'),
    transcript: { status: 'completed', startedAt: STARTED_AT, completedAt: secondsAfter(30) },
    analysisRun: { status: 'failed', startedAt: secondsAfter(35) },
    now: startedAtMs + 90_000,
  })
  const cancelledAnalysis = getRecordingProgress({
    recording: recording('transcribed'),
    transcript: { status: 'completed', startedAt: STARTED_AT, completedAt: secondsAfter(30) },
    analysisRun: { status: 'cancelled', startedAt: secondsAfter(35) },
  })

  assert.equal(step(failedTranscription, 'transcribing').durationMs, null)
  assert.equal(step(failedAnalysis, 'analysing').durationMs, null)
  assert.equal(step(failedAnalysis, 'transcribing').durationMs, 30_000)
  assert.equal(step(cancelledAnalysis, 'analysing').durationMs, null)
})

test('pending steps and the uploading and completed steps never have a duration', () => {
  const done = getRecordingProgress({
    recording: recording('transcribed'),
    transcript: { status: 'completed', startedAt: STARTED_AT, completedAt: secondsAfter(45) },
    analysisRun: {
      status: 'ready_for_review',
      startedAt: secondsAfter(50),
      completedAt: secondsAfter(80),
    },
  })
  const idle = getRecordingProgress({ recording: recording() })
  const uploading = getRecordingProgress({ pendingUpload: { extractProgress: null } })

  for (const key of ['uploading', 'completed']) {
    assert.equal(step(done, key).durationMs, null)
    assert.equal(step(done, key).runningSinceMs, null)
  }

  for (const progress of [idle, uploading]) {
    for (const candidate of progress.steps) {
      assert.equal(candidate.durationMs, null)
      assert.equal(candidate.runningSinceMs, null)
    }
  }
})

test('a start timestamp ahead of the clock never yields a negative duration', () => {
  const progress = getRecordingProgress({
    recording: recording('transcribing'),
    transcript: { status: 'processing', startedAt: secondsAfter(10) },
    now: startedAtMs,
  })

  assert.equal(step(progress, 'transcribing').durationMs, 0)
})

test('formatDuration', () => {
  assert.equal(formatDuration(0), '0s')
  assert.equal(formatDuration(999), '0s')
  assert.equal(formatDuration(45_000), '45s')
  assert.equal(formatDuration(59_999), '59s')
  assert.equal(formatDuration(60_000), '1m 00s')
  assert.equal(formatDuration(725_000), '12m 05s')
  assert.equal(formatDuration(3_599_000), '59m 59s')
  assert.equal(formatDuration(3_600_000), '1h 00m')
  assert.equal(formatDuration(3_720_000), '1h 02m')
  assert.equal(formatDuration(26 * 3_600_000 + 30 * 60_000), '26h 30m')
  assert.equal(formatDuration(-5_000), '0s')
  assert.equal(formatDuration(undefined), '')
  assert.equal(formatDuration(null), '')
  assert.equal(formatDuration(Number.NaN), '')
})

test('formatFileSize', () => {
  assert.equal(formatFileSize(2_516_582), '2.4 MB')
  assert.equal(formatFileSize(19_529_470), '18.6 MB')
  assert.equal(formatFileSize(512), '1 KB')
  assert.equal(formatFileSize(150 * 1024), '150 KB')
  assert.equal(formatFileSize(3 * 1024 * 1024 * 1024), '3.0 GB')
  assert.equal(formatFileSize(undefined), '')
  assert.equal(formatFileSize(0), '')
})
