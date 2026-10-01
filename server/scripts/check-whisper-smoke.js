// Drives the recording workflow end to end against the REAL Whisper provider,
// using a short committed meeting recording rather than filler bytes:
// upload -> outbox -> Redis Stream -> Python ai-worker -> Whisper -> result
// stream -> guarded transactions -> Redis status invalidation.
//
//   npm run check:whisper --workspace=server -- /absolute/path/to/recording.m4a
//
// check-recording-workflow.js covers the same seams with the Python fixture worker and
// asserts fixture values (duration 60, 3 segments). Those numbers are meaningless
// for a real provider, so this script asserts only what must hold for any real
// transcription and prints the rest for a human to read.
//
// Requires docker compose up plus `--profile ai up ai-service ai-worker ollama`. Creates a
// throwaway user, meeting, and recording, then removes them.
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
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
const { generateMinutesFromRecording, uploadRecordingForMeeting } =
  await import('../services/recording-service.js')
const { createAiResultConsumerService } = await import('../services/ai-result-consumer.js')
const { createWorkerRuntime } = await import('../worker-runtime.js')
const { WORKFLOW_STATUS_CHANNEL } = await import('../services/workflow-status-publisher.js')
const { closeWorkflowStatusSubscriber } = await import('../services/workflow-status-subscriber.js')

// Re-asserted after the imports: app.js and its dependencies reload .env with
// override: true at module scope.
process.env.AI_PIPELINE_ENABLED = 'true'

const AUDIO = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repoRoot, 'ai-service/test-fixtures/input/power_system_meeting_3min_final.mp3')
const MIME_TYPES = {
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
}
const mimeType = MIME_TYPES[path.extname(AUDIO).toLowerCase()]
const artifactPath = path.join(
  repoRoot,
  'artefacts',
  `${path.parse(AUDIO).name}-ai-workflow-result.json`
)
// Whisper small on CPU runs slower than realtime for a 3-minute recording.
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 900000)
const POLL_MS = 2000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const check = (label, actual, expected) => {
  const passed = actual === expected
  console.log(
    `  ${passed ? 'ok  ' : 'FAIL'}  ${label.padEnd(30)} ${actual}${
      passed ? '' : `  (expected ${expected})`
    }`
  )
  return { label, actual, expected, passed }
}

const userId = randomUUID()
const meetingId = randomUUID()

const cleanUp = async () => {
  await query('DELETE FROM meetings WHERE id = $1', [meetingId]).catch(() => {})
  await query('DELETE FROM users WHERE id = $1', [userId]).catch(() => {})
}

let runtime
let subscriber
let invalidations = []
let state
let elapsedSeconds
let checks = []
let workflowError

try {
  if (process.env.AI_TRANSCRIPTION_PROVIDER !== 'whisper') {
    throw new Error(
      `This check is for the real provider; AI_TRANSCRIPTION_PROVIDER is "${process.env.AI_TRANSCRIPTION_PROVIDER}"`
    )
  }
  if (process.env.AI_ANALYSIS_PROVIDER !== 'llm') {
    throw new Error(
      `This check requires the LLM provider; AI_ANALYSIS_PROVIDER is "${process.env.AI_ANALYSIS_PROVIDER}"`
    )
  }
  if (!mimeType) {
    throw new Error(`Unsupported audio extension: ${path.extname(AUDIO) || '(none)'}`)
  }

  const audio = readFileSync(AUDIO)
  console.log(`Using ${AUDIO} (${(audio.length / 1024 / 1024).toFixed(1)} MB)`)

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
  await subscriber.subscribe(WORKFLOW_STATUS_CHANNEL)
  subscriber.on('message', (_channel, message) => {
    const payload = JSON.parse(message)
    if (payload.meetingId !== meetingId) return
    invalidations.push(payload)
    console.log(`  <- ${payload.recordingStatus} / ${payload.transcriptStatus ?? '-'}`)
  })

  runtime = createWorkerRuntime({
    services: [createAiResultConsumerService()],
  })
  if (!runtime.start()) {
    throw new Error('Worker runtime refused to start')
  }

  console.log('Uploading the recording')
  const uploaded = await uploadRecordingForMeeting({
    meetingId,
    callerId: userId,
    consentConfirmed: true,
    file: {
      originalname: path.basename(AUDIO),
      mimetype: mimeType,
      size: audio.length,
      buffer: audio,
    },
  })

  console.log('Starting transcription and analysis generation')
  await generateMinutesFromRecording(meetingId, userId)

  console.log('Waiting for Whisper and Ollama analysis (this is slower than realtime on CPU)')
  const startedAt = Date.now()

  while (Date.now() - startedAt < TIMEOUT_MS) {
    const result = await query(
      `SELECT r.status AS recording_status,
              r.duration_seconds AS recording_duration,
              t.status AS transcript_status,
              t.duration_seconds AS transcript_duration,
              t.transcript_text,
               t.segments,
               t.error_message,
               jsonb_array_length(t.segments) AS segment_count,
               a.status AS analysis_status,
               a.summary AS analysis_summary,
               a.key_discussions AS analysis_key_discussions,
               a.decisions AS analysis_decisions,
               a.provider AS analysis_provider,
               a.model AS analysis_model,
               a.prompt_version AS analysis_prompt_version,
               (SELECT count(*) FROM analysis_action_item_suggestions s
                 WHERE s.analysis_run_id = a.id) AS suggestion_count
        FROM meeting_recordings r
        JOIN meeting_transcripts t ON t.recording_id = r.id
        LEFT JOIN analysis_runs a ON a.transcript_id = t.id
        WHERE r.id = $1`,
      [uploaded.recording.id]
    )

    state = result.rows[0]
    if (['ready_for_review', 'failed', 'cancelled'].includes(state?.analysis_status)) break
    await sleep(POLL_MS)
  }

  elapsedSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(1))
  console.log(`\nSettled after ${elapsedSeconds}s`)

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

  checks = [
    check('recording.status', state?.recording_status, 'transcribed'),
    check('transcript.status', state?.transcript_status, 'completed'),
    // Both tables constrain duration_seconds to NULL or a positive integer.
    check('recording.duration > 0', state?.recording_duration > 0, true),
    check('duration matches transcript', state?.recording_duration, state?.transcript_duration),
    check('segments produced', Number(state?.segment_count) > 0, true),
    check('transcript is non-empty', text.trim().length > 0, true),
    // Whisper has no diarization, so every segment must carry a null speaker
    // rather than an invented label.
    check(
      'every speaker is null',
      segments.every((s) => s.speaker === null),
      true
    ),
    check(
      'segment timestamps ordered',
      segments.every((s) => s.startSeconds >= 0 && s.endSeconds >= s.startSeconds),
      true
    ),
    // Proves the transcript came from Whisper, not the fixture worker.
    check('not the fixture transcript', lowered.includes('fixture'), false),
    check('status invalidations', invalidations.length >= 2, true),
    check('analysis.status', state?.analysis_status, 'ready_for_review'),
    check('analysis summary is non-empty', state?.analysis_summary?.trim().length > 0, true),
    check('analysis.provider', state?.analysis_provider, 'llm'),
    check('analysis.model is set', Boolean(state?.analysis_model), true),
    check('analysis.promptVersion is set', Boolean(state?.analysis_prompt_version), true),
    check('analysis discussions is an array', Array.isArray(state?.analysis_key_discussions), true),
    check('analysis decisions is an array', Array.isArray(state?.analysis_decisions), true),
    check('analysis suggestions is non-negative', Number(state?.suggestion_count) >= 0, true),
  ]

  const passed = checks.every((checkResult) => checkResult.passed)
  console.log(`\n${passed ? 'PASS' : 'FAIL'}`)
  process.exitCode = passed ? 0 : 1
} catch (error) {
  workflowError = error
  console.error(`\nFAIL  ${error.message}`)
  process.exitCode = 1
} finally {
  try {
    mkdirSync(path.dirname(artifactPath), { recursive: true })
    writeFileSync(
      artifactPath,
      JSON.stringify(
        {
          input: {
            path: AUDIO,
            fileName: path.basename(AUDIO),
            mimeType,
            sizeBytes: statSync(AUDIO).size,
          },
          elapsedSeconds,
          state,
          statusInvalidations: invalidations.length,
          checks,
          passed: checks.length > 0 && checks.every((checkResult) => checkResult.passed),
          error: workflowError?.message ?? null,
          createdAt: new Date().toISOString(),
        },
        null,
        2
      ) + '\n'
    )
    console.log(`Saved result to ${artifactPath}`)
  } catch (artifactError) {
    console.error(`Unable to save result artifact: ${artifactError.message}`)
    process.exitCode = 1
  }
  await subscriber?.quit().catch(() => subscriber.disconnect())
  await closeWorkflowStatusSubscriber()
  await runtime?.stop()
  await cleanUp()
  await closePool()
}
