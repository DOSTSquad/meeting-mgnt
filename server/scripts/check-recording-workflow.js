// Drives the recording workflow end to end against the running local stack:
// upload -> workflow outbox -> outbox dispatcher -> BullMQ flow -> transcription
// worker -> MinIO stream -> transcription adapter -> guarded transactions ->
// Redis status invalidation.
//
// The unit and database suites cover each of those pieces in isolation. This
// covers the seams between them, which is where the dropped first invalidation
// (enableOfflineQueue on the publisher connection) was hiding.
//
//   npm run check:workflow --workspace=server
//
// Requires docker compose to be up. Creates a throwaway user, meeting, and
// recording, then removes them, so it is safe to run against a dev database but
// never against production.
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadDotenv } from 'dotenv'

// override matches the other scripts in this directory: for a local developer
// tool, .env is the authoritative answer. A DATABASE_URL exported in the shell
// for some other project would otherwise silently point this check at the wrong
// database. server/worker.js deliberately does the opposite, because there the
// real environment is systemd and must win.
loadDotenv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env'),
  override: true,
})

// The pipeline is off by default in .env. Enabling it only for this process
// avoids asking the operator to edit .env and remember to change it back.
process.env.AI_PIPELINE_ENABLED = 'true'
process.env.AI_TRANSCRIPTION_PROVIDER = process.env.AI_TRANSCRIPTION_PROVIDER || 'fixture'

// Dedicated queues and channel so a check never consumes work belonging to a
// worker the operator already has running.
const suffix = `check-${process.pid}`
process.env.RECORDING_TRANSCRIPTION_QUEUE_NAME = `${suffix}-transcription`
process.env.RECORDING_ANALYSIS_QUEUE_NAME = `${suffix}-analysis`
process.env.WORKFLOW_STATUS_CHANNEL = `${suffix}-status`
process.env.WORKFLOW_OUTBOX_DISPATCH_INTERVAL_MS = '500'

const IORedis = (await import('ioredis')).default
const { closePool, query } = await import('../db/postgres.js')
const { uploadRecordingForMeeting } = await import('../services/recording-service.js')
const { createTranscriptionWorker } = await import('../services/transcription-worker.js')
const { createWorkerRuntime } = await import('../worker-runtime.js')

const TIMEOUT_MS = 60000
const POLL_MS = 250

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const check = (label, actual, expected) => {
  const ok = actual === expected
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(26)} ${actual}${ok ? '' : `  (expected ${expected})`}`
  )
  return ok
}

const userId = randomUUID()
const meetingId = randomUUID()

const cleanUp = async () => {
  await query('DELETE FROM meetings WHERE id = $1', [meetingId]).catch(() => {})
  await query('DELETE FROM users WHERE id = $1', [userId]).catch(() => {})
}

let runtime
let subscriber

try {
  console.log('Seeding a throwaway meeting')
  await query(
    `INSERT INTO users (id, name, email, password_hash, role, department)
     VALUES ($1, 'Workflow Check', $2, 'x', 'staff', 'ops')`,
    [userId, `workflow-check-${userId}@example.invalid`]
  )
  await query(
    `INSERT INTO meetings (id, title, starts_at, ends_at, timezone_name, owner_id, created_by)
     VALUES ($1, 'Workflow Check', NOW(), NOW() + INTERVAL '1 hour', 'UTC', $2, $2)`,
    [meetingId, userId]
  )

  console.log(`Subscribing to ${process.env.WORKFLOW_STATUS_CHANNEL}`)
  subscriber = new IORedis(process.env.REDIS_URL)
  const invalidations = []
  await subscriber.subscribe(process.env.WORKFLOW_STATUS_CHANNEL)
  subscriber.on('message', (_channel, message) => {
    const payload = JSON.parse(message)
    invalidations.push(payload)
    console.log(`  <- ${payload.recordingStatus} / ${payload.transcriptStatus ?? '-'}`)
  })

  console.log('Starting the worker runtime')
  runtime = createWorkerRuntime({ services: [createTranscriptionWorker()] })
  if (!runtime.start()) {
    throw new Error('Worker runtime refused to start')
  }

  console.log('Uploading a recording')
  const audio = Buffer.alloc(64 * 1024, 7)
  const uploaded = await uploadRecordingForMeeting({
    meetingId,
    callerId: userId,
    file: {
      originalname: 'workflow-check.mp3',
      mimetype: 'audio/mpeg',
      size: audio.length,
      buffer: audio,
    },
  })

  console.log('Waiting for the worker')
  const startedAt = Date.now()
  let state

  while (Date.now() - startedAt < TIMEOUT_MS) {
    const result = await query(
      `SELECT r.status AS recording_status,
              r.duration_seconds,
              t.status AS transcript_status,
              jsonb_array_length(t.segments) AS segment_count,
              t.completed_at,
              a.status AS analysis_status,
              o.status AS outbox_status
       FROM meeting_recordings r
       JOIN meeting_transcripts t ON t.recording_id = r.id
       LEFT JOIN analysis_runs a ON a.transcript_id = t.id
       LEFT JOIN workflow_outbox o ON o.aggregate_id = r.id
       WHERE r.id = $1`,
      [uploaded.recording.id]
    )

    state = result.rows[0]
    if (['transcribed', 'failed'].includes(state?.recording_status)) {
      break
    }

    await sleep(POLL_MS)
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`\nSettled after ${elapsed}s`)

  const results = [
    check('recording.status', state?.recording_status, 'transcribed'),
    check('recording.duration', state?.duration_seconds, 60),
    check('transcript.status', state?.transcript_status, 'completed'),
    check('transcript.segments', Number(state?.segment_count), 3),
    check('transcript.completed_at', state?.completed_at ? 'set' : 'null', 'set'),
    // No analysis consumer exists until #62, so a queued run is the correct
    // outcome here, not a stuck one.
    check('analysis_run.status', state?.analysis_status, 'queued'),
    check('workflow_outbox.status', state?.outbox_status, 'dispatched'),
    check('status invalidations', invalidations.length, 2),
  ]

  const passed = results.every(Boolean)
  console.log(`\n${passed ? 'PASS' : 'FAIL'}`)
  process.exitCode = passed ? 0 : 1
} catch (error) {
  console.error(`\nFAIL  ${error.message}`)
  process.exitCode = 1
} finally {
  await subscriber?.quit().catch(() => subscriber.disconnect())
  await runtime?.stop()
  await cleanUp()
  await closePool()
}
