import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getRecordingProgress } from '../src/features/meetings/recordingProgress.js'
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

test('formatFileSize', () => {
  assert.equal(formatFileSize(2_516_582), '2.4 MB')
  assert.equal(formatFileSize(19_529_470), '18.6 MB')
  assert.equal(formatFileSize(512), '1 KB')
  assert.equal(formatFileSize(150 * 1024), '150 KB')
  assert.equal(formatFileSize(3 * 1024 * 1024 * 1024), '3.0 GB')
  assert.equal(formatFileSize(undefined), '')
  assert.equal(formatFileSize(0), '')
})
