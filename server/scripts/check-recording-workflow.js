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

process.env.WORKFLOW_OUTBOX_DISPATCH_INTERVAL_MS = '500'
process.env.WORKFLOW_SSE_HEARTBEAT_MS = process.env.WORKFLOW_SSE_HEARTBEAT_MS || '1000'

// Queue and channel names are deliberately NOT scoped per run. server/app.js
// reloads .env with override: true at module scope, so anything set here is
// overwritten the moment the app is imported, and a scoped name would only
// half-apply. The check therefore shares the configured queues: stop a local
// worker first, or it may be the one that picks the job up. Either worker
// produces the same fixture result, so a shared run still settles correctly.

const jwt = (await import('jsonwebtoken')).default
const IORedis = (await import('ioredis')).default
const { createApp } = await import('../app.js')
const { closePool, query } = await import('../db/postgres.js')
const { uploadRecordingForMeeting } = await import('../services/recording-service.js')
const { createTranscriptionWorker } = await import('../services/transcription-worker.js')
const { createAnalysisWorker } = await import('../services/analysis-worker.js')
const { createWorkerRuntime } = await import('../worker-runtime.js')
const { WORKFLOW_STATUS_CHANNEL } = await import('../services/workflow-status-publisher.js')

// Re-asserted after the imports: app.js reloads .env with override: true at
// module scope, so anything set before importing it is overwritten. .env ships
// these empty, and the adapters refuse to default.
process.env.AI_PIPELINE_ENABLED = 'true'
process.env.AI_TRANSCRIPTION_PROVIDER = process.env.AI_TRANSCRIPTION_PROVIDER || 'fixture'
process.env.AI_ANALYSIS_PROVIDER = process.env.AI_ANALYSIS_PROVIDER || 'fixture'
const { closeWorkflowStatusSubscriber } = await import('../services/workflow-status-subscriber.js')

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
const outsiderId = randomUUID()
const meetingId = randomUUID()

const cleanUp = async () => {
  await query('DELETE FROM meetings WHERE id = $1', [meetingId]).catch(() => {})
  await query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userId, outsiderId]]).catch(
    () => {}
  )
}

const tokenFor = (id) =>
  jwt.sign({ sub: id, email: `${id}@example.invalid` }, process.env.JWT_SECRET, {
    expiresIn: '10m',
  })

let runtime
let subscriber
let server
let streamController

try {
  console.log('Seeding a throwaway meeting')
  await query(
    `INSERT INTO users (id, name, email, password_hash, role, department)
     VALUES ($1, 'Workflow Check', $2, 'x', 'staff', 'ops'),
            ($3, 'Workflow Outsider', $4, 'x', 'staff', 'ops')`,
    [
      userId,
      `workflow-check-${userId}@example.invalid`,
      outsiderId,
      `workflow-outsider-${outsiderId}@example.invalid`,
    ]
  )
  await query(
    `INSERT INTO meetings (id, title, starts_at, ends_at, timezone_name, owner_id, created_by)
     VALUES ($1, 'Workflow Check', NOW(), NOW() + INTERVAL '1 hour', 'UTC', $2, $2)`,
    [meetingId, userId]
  )

  // Read the channel the publisher resolved rather than process.env: the
  // publisher captured it at module load, before app.js reloaded .env.
  console.log(`Subscribing to ${WORKFLOW_STATUS_CHANNEL}`)
  subscriber = new IORedis(process.env.REDIS_URL)
  const invalidations = []
  await subscriber.subscribe(WORKFLOW_STATUS_CHANNEL)
  subscriber.on('message', (_channel, message) => {
    const payload = JSON.parse(message)

    // The channel is shared, and starting a worker drains any backlog left by
    // earlier runs. Only this run's meeting counts.
    if (payload.meetingId !== meetingId) {
      return
    }

    invalidations.push(payload)
    console.log(`  <- ${payload.recordingStatus} / ${payload.transcriptStatus ?? '-'}`)
  })

  console.log('Starting the worker runtime')
  runtime = createWorkerRuntime({
    services: [createTranscriptionWorker(), createAnalysisWorker()],
  })
  if (!runtime.start()) {
    throw new Error('Worker runtime refused to start')
  }

  console.log('Opening the workflow event stream')
  server = createApp().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const streamUrl = `http://127.0.0.1:${server.address().port}/api/meetings/${meetingId}/workflow/events`

  const refused = await fetch(streamUrl, {
    headers: { Authorization: `Bearer ${tokenFor(outsiderId)}` },
  })
  const anonymous = await fetch(streamUrl)

  streamController = new AbortController()
  const stream = await fetch(streamUrl, {
    headers: { Authorization: `Bearer ${tokenFor(userId)}`, Accept: 'text/event-stream' },
    signal: streamController.signal,
  })

  const frames = []
  let heartbeats = 0
  const reading = (async () => {
    const reader = stream.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf('\n\n')
        if (raw.startsWith(':')) {
          heartbeats += 1
          continue
        }
        const event = raw.match(/^event: (\S+)/)?.[1]
        const data = JSON.parse(raw.match(/\ndata: (.*)$/s)[1])
        frames.push({ event, data })
        console.log(
          `  <- ${event}  recording=${data.recording?.status ?? '-'} transcript=${data.transcript?.status ?? '-'}`
        )
        if (event === 'settled') return
      }
    }
  })()

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
              a.summary AS analysis_summary,
              a.provider AS analysis_provider,
              a.model AS analysis_model,
              a.prompt_version AS analysis_prompt_version,
              jsonb_array_length(a.key_discussions) AS discussion_count,
              jsonb_array_length(a.decisions) AS decision_count,
              (SELECT count(*) FROM analysis_action_item_suggestions s
                WHERE s.analysis_run_id = a.id) AS suggestion_count,
              (SELECT count(*) FROM analysis_action_item_suggestions s
                WHERE s.analysis_run_id = a.id AND s.status <> 'proposed') AS non_proposed_count,
              o.status AS outbox_status
       FROM meeting_recordings r
       JOIN meeting_transcripts t ON t.recording_id = r.id
       LEFT JOIN analysis_runs a ON a.transcript_id = t.id
       LEFT JOIN workflow_outbox o ON o.aggregate_id = r.id
       WHERE r.id = $1`,
      [uploaded.recording.id]
    )

    state = result.rows[0]
    if (['ready_for_review', 'failed', 'cancelled'].includes(state?.analysis_status)) {
      break
    }

    await sleep(POLL_MS)
  }

  await Promise.race([reading, sleep(5000)])

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`\nSettled after ${elapsed}s`)

  const sequence = frames.map((frame) => frame.event).join(' -> ')
  const serialisedFrames = JSON.stringify(frames)

  const results = [
    check('recording.status', state?.recording_status, 'transcribed'),
    check('recording.duration', state?.duration_seconds, 60),
    check('transcript.status', state?.transcript_status, 'completed'),
    check('transcript.segments', Number(state?.segment_count), 3),
    check('transcript.completed_at', state?.completed_at ? 'set' : 'null', 'set'),
    // No analysis consumer exists until #62, so a queued run is the correct
    // outcome here, not a stuck one.
    check('analysis_run.status', state?.analysis_status, 'ready_for_review'),
    check('analysis.summary', Boolean(state?.analysis_summary), true),
    check('analysis.provider', state?.analysis_provider, 'fixture'),
    check('analysis.model', state?.analysis_model, 'fixture-analysis-v1'),
    check('analysis.promptVersion', Boolean(state?.analysis_prompt_version), true),
    check('analysis.discussions', Number(state?.discussion_count), 2),
    check('analysis.decisions', Number(state?.decision_count), 1),
    check('suggestions', Number(state?.suggestion_count), 2),
    check('suggestions all proposed', Number(state?.non_proposed_count), 0),
    check('workflow_outbox.status', state?.outbox_status, 'dispatched'),
    // transcribing, transcribed, analysis processing, analysis ready_for_review
    check('status invalidations', invalidations.length, 4),
    check('stream: non-participant', refused.status, 403),
    check('stream: no token', anonymous.status, 401),
    check('stream: content-type', stream.headers.get('content-type'), 'text/event-stream'),
    check('stream: x-accel-buffering', stream.headers.get('x-accel-buffering'), 'no'),
    check('stream: last frame', frames.at(-1)?.event, 'settled'),
    check(
      'stream: reaches ready_for_review',
      frames.some((frame) => frame.data.analysisRun?.status === 'ready_for_review'),
      true
    ),
    check('stream: heartbeats', heartbeats > 0, true),
    check(
      'stream: no generated content',
      /Thanks for joining|meeting-audio|objectKey|Circulate the status/.test(serialisedFrames),
      false
    ),
  ]

  const passed = results.every(Boolean)
  console.log(`\n${passed ? 'PASS' : 'FAIL'}`)
  process.exitCode = passed ? 0 : 1
} catch (error) {
  console.error(`\nFAIL  ${error.message}`)
  process.exitCode = 1
} finally {
  streamController?.abort()
  server?.close()
  await subscriber?.quit().catch(() => subscriber.disconnect())
  await closeWorkflowStatusSubscriber()
  await runtime?.stop()
  await cleanUp()
  await closePool()
}
