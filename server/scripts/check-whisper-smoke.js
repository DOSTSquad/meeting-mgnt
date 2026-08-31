// Drives the recording workflow end to end against the REAL Whisper provider,
// using a short committed meeting recording rather than filler bytes:
// upload -> outbox -> BullMQ flow -> worker -> MinIO stream -> whisper adapter
// -> FastAPI ai-service -> guarded transactions -> Redis status invalidation.
//
//   AI_TRANSCRIPTION_PROVIDER=whisper npm run check:whisper --workspace=server
//
// check-recording-workflow.js covers the same seams with the fixture adapter and
// asserts fixture values (duration 60, 3 segments). Those numbers are meaningless
// for a real provider, so this script asserts only what must hold for any real
// transcription and prints the rest for a human to read.
//
// Requires docker compose up plus `--profile ai up ai-service`. Creates a
// throwaway user, meeting, and recording, then removes them.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadDotenv } from 'dotenv'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '../..')

loadDotenv({ path: path.join(repoRoot, '.env'), override: true })

process.env.AI_PIPELINE_ENABLED = 'true'
process.env.WORKFLOW_OUTBOX_DISPATCH_INTERVAL_MS = '500'

const IORedis = (await import('ioredis')).default
const { closePool, query } = await import('../db/postgres.js')
const { uploadRecordingForMeeting } = await import('../services/recording-service.js')
const { createTranscriptionWorker } = await import('../services/transcription-worker.js')
const { createWorkerRuntime } = await import('../worker-runtime.js')
const { WORKFLOW_STATUS_CHANNEL } = await import('../services/workflow-status-publisher.js')
const { closeWorkflowStatusSubscriber } = await import('../services/workflow-status-subscriber.js')

// Re-asserted after the imports: app.js and its dependencies reload .env with
// override: true at module scope.
process.env.AI_PIPELINE_ENABLED = 'true'
process.env.AI_ANALYSIS_PROVIDER = process.env.AI_ANALYSIS_PROVIDER || 'fixture'

const AUDIO = path.join(
  repoRoot,
  'ai-service/test-fixtures/input/power_system_meeting_3min_final.mp3'
)
// Whisper small on CPU runs slower than realtime for a 3-minute recording.
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 900000)
const POLL_MS = 2000

// Proper nouns spoken in the fixture recording. A real transcription of this
// audio contains them; a fixture response or the wrong language does not.
const EXPECTED_TERMS = ['feeder', 'voltage']

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const check = (label, actual, expected) => {
  const ok = actual === expected
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(30)} ${actual}${ok ? '' : `  (expected ${expected})`}`
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
  if (process.env.AI_TRANSCRIPTION_PROVIDER !== 'whisper') {
    throw new Error(
      `This check is for the real provider; AI_TRANSCRIPTION_PROVIDER is "${process.env.AI_TRANSCRIPTION_PROVIDER}"`
    )
  }

  const health = await fetch(new URL('/health', process.env.AI_SERVICE_URL))
  if (!health.ok) {
    throw new Error(`ai-service /health returned ${health.status}`)
  }
  console.log(`ai-service is up at ${process.env.AI_SERVICE_URL}`)

  const audio = readFileSync(AUDIO)
  console.log(`Using ${path.basename(AUDIO)} (${(audio.length / 1024 / 1024).toFixed(1)} MB)`)

  await query(
    `INSERT INTO users (id, name, email, password_hash, role, department)
     VALUES ($1, 'Whisper Smoke', $2, 'x', 'staff', 'ops')`,
    [userId, `whisper-smoke-${userId}@example.invalid`]
  )
  await query(
    `INSERT INTO meetings (id, title, starts_at, ends_at, timezone_name, owner_id, created_by)
     VALUES ($1, 'Whisper Smoke', NOW(), NOW() + INTERVAL '1 hour', 'UTC', $2, $2)`,
    [meetingId, userId]
  )

  subscriber = new IORedis(process.env.REDIS_URL)
  const invalidations = []
  await subscriber.subscribe(WORKFLOW_STATUS_CHANNEL)
  subscriber.on('message', (_channel, message) => {
    const payload = JSON.parse(message)
    if (payload.meetingId !== meetingId) return
    invalidations.push(payload)
    console.log(`  <- ${payload.recordingStatus} / ${payload.transcriptStatus ?? '-'}`)
  })

  runtime = createWorkerRuntime({ services: [createTranscriptionWorker()] })
  if (!runtime.start()) {
    throw new Error('Worker runtime refused to start')
  }

  console.log('Uploading the recording')
  const uploaded = await uploadRecordingForMeeting({
    meetingId,
    callerId: userId,
    file: {
      originalname: path.basename(AUDIO),
      mimetype: 'audio/mpeg',
      size: audio.length,
      buffer: audio,
    },
  })

  console.log('Waiting for Whisper (this is slower than realtime on CPU)')
  const startedAt = Date.now()
  let state

  while (Date.now() - startedAt < TIMEOUT_MS) {
    const result = await query(
      `SELECT r.status AS recording_status,
              r.duration_seconds AS recording_duration,
              t.status AS transcript_status,
              t.duration_seconds AS transcript_duration,
              t.transcript_text,
              t.segments,
              t.error_message,
              jsonb_array_length(t.segments) AS segment_count
       FROM meeting_recordings r
       JOIN meeting_transcripts t ON t.recording_id = r.id
       WHERE r.id = $1`,
      [uploaded.recording.id]
    )

    state = result.rows[0]
    if (['transcribed', 'failed'].includes(state?.recording_status)) break
    await sleep(POLL_MS)
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`\nSettled after ${elapsed}s`)

  if (state?.error_message) {
    console.log(`\nerror_message: ${state.error_message}`)
  }

  const text = state?.transcript_text ?? ''
  const segments = state?.segments ?? []
  const lowered = text.toLowerCase()

  console.log('\n--- transcript (first 400 chars) ---')
  console.log(text.slice(0, 400))
  console.log('--- first segment ---')
  console.log(JSON.stringify(segments[0], null, 2))

  const results = [
    check('recording.status', state?.recording_status, 'transcribed'),
    check('transcript.status', state?.transcript_status, 'completed'),
    // Both tables constrain duration_seconds to NULL or a positive integer.
    check('recording.duration > 0', state?.recording_duration > 0, true),
    check('duration matches transcript', state?.recording_duration, state?.transcript_duration),
    check('segments produced', Number(state?.segment_count) > 0, true),
    check('transcript is substantial', text.length > 200, true),
    // Whisper has no diarization, so every segment must carry a null speaker
    // rather than an invented label.
    check('every speaker is null', segments.every((s) => s.speaker === null), true),
    check(
      'segment timestamps ordered',
      segments.every((s) => s.startSeconds >= 0 && s.endSeconds >= s.startSeconds),
      true
    ),
    check(
      `mentions ${EXPECTED_TERMS.join(' + ')}`,
      EXPECTED_TERMS.every((term) => lowered.includes(term)),
      true
    ),
    // Proves the transcript came from the provider, not the fixture adapter.
    check('not the fixture transcript', lowered.includes('fixture'), false),
    check('status invalidations', invalidations.length >= 2, true),
  ]

  const passed = results.every(Boolean)
  console.log(`\n${passed ? 'PASS' : 'FAIL'}`)
  process.exitCode = passed ? 0 : 1
} catch (error) {
  console.error(`\nFAIL  ${error.message}`)
  process.exitCode = 1
} finally {
  await subscriber?.quit().catch(() => subscriber.disconnect())
  await closeWorkflowStatusSubscriber()
  await runtime?.stop()
  await cleanUp()
  await closePool()
}
