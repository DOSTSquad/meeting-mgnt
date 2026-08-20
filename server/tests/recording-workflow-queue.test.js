import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, beforeAll, beforeEach, afterAll, it, expect } from '@jest/globals'
import { Queue } from 'bullmq'
import { parse } from 'dotenv'
import IORedis from 'ioredis'

const serverDir = fileURLToPath(new URL('../', import.meta.url))
const repoRoot = path.resolve(serverDir, '..')
const envPath = existsSync(path.join(repoRoot, '.env'))
  ? path.join(repoRoot, '.env')
  : path.join(repoRoot, '.env.example')
const projectEnv = parse(readFileSync(envPath))
const runDatabaseRedisTests =
  process.env.RUN_DB_TESTS === 'true' &&
  Boolean(projectEnv.DATABASE_URL) &&
  Boolean(projectEnv.REDIS_URL)

process.env.DATABASE_URL = projectEnv.DATABASE_URL
process.env.REDIS_URL = projectEnv.REDIS_URL
process.env.RECORDING_TRANSCRIPTION_QUEUE_NAME = `test-recording-transcription-${process.pid}`
process.env.RECORDING_ANALYSIS_QUEUE_NAME = `test-recording-analysis-${process.pid}`

const { runMigrations } = await import('../db/migrate.js')
const { closePool, query } = await import('../db/postgres.js')
const { createWorkflowOutboxDispatcher } = await import('../services/workflow-outbox-dispatcher.js')
const { ANALYSIS_QUEUE_NAME, TRANSCRIPTION_QUEUE_NAME, closeRecordingWorkflowQueue } =
  await import('../services/recording-workflow-queue.js')
const { closeRedisConnections } = await import('../services/redis-connections.js')
const { dispatchPendingWorkflowOutbox } = await import('../services/workflow-outbox-service.js')

const dbRedisDescribe = runDatabaseRedisTests ? describe : describe.skip

let analysisQueue
let transcriptionQueue

const createRedisConnection = () =>
  new IORedis(projectEnv.REDIS_URL, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: null,
  })

const createQueue = (name) =>
  new Queue(name, {
    connection: createRedisConnection(),
  })

const emptyQueues = async () => {
  await Promise.all([
    analysisQueue.obliterate({ force: true }),
    transcriptionQueue.obliterate({ force: true }),
  ])
}

const listQueueJobs = (queue) =>
  queue.getJobs(
    ['active', 'delayed', 'failed', 'paused', 'prioritized', 'waiting', 'waiting-children'],
    0,
    100,
    true
  )

const seedWorkflowEvent = async () => {
  const userId = randomUUID()
  const meetingId = randomUUID()
  const recordingId = randomUUID()
  const transcriptId = randomUUID()
  const analysisRunId = randomUUID()
  const outboxId = randomUUID()

  await query(
    `
      INSERT INTO users (id, name, email, password_hash, role, department)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      userId,
      'Workflow Test User',
      `workflow-${userId}@example.com`,
      'fake-hash',
      'staff',
      'engineering',
    ]
  )
  await query(
    `
      INSERT INTO meetings (
        id,
        title,
        starts_at,
        ends_at,
        timezone_name,
        status,
        owner_id,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      meetingId,
      'Workflow Queue Test',
      '2026-05-01T09:00:00Z',
      '2026-05-01T10:00:00Z',
      'UTC',
      'scheduled',
      userId,
      userId,
    ]
  )
  await query(
    `
      INSERT INTO meeting_recordings (
        id,
        meeting_id,
        uploaded_by,
        file_name,
        mime_type,
        size_bytes,
        object_key,
        bucket_name,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      recordingId,
      meetingId,
      userId,
      'workflow.mp3',
      'audio/mpeg',
      1024,
      `meetings/${meetingId}/recordings/${recordingId}`,
      'meeting-audio',
      'transcribing',
    ]
  )
  await query(
    `
      INSERT INTO meeting_transcripts (id, meeting_id, recording_id, created_by, status)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [transcriptId, meetingId, recordingId, userId, 'processing']
  )
  await query(
    `
      INSERT INTO analysis_runs (
        id,
        meeting_id,
        recording_id,
        transcript_id,
        created_by,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [analysisRunId, meetingId, recordingId, transcriptId, userId, 'queued']
  )
  await query(
    `
      INSERT INTO workflow_outbox (
        id,
        event_type,
        aggregate_type,
        aggregate_id,
        payload
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [
      outboxId,
      'recording.uploaded',
      'recording',
      recordingId,
      JSON.stringify({
        recordingId,
        transcriptId,
        analysisRunId,
      }),
    ]
  )

  return {
    userId,
    meetingId,
    recordingId,
    transcriptId,
    analysisRunId,
    outboxId,
  }
}

beforeAll(async () => {
  if (!runDatabaseRedisTests) {
    return
  }

  await runMigrations()
  analysisQueue = createQueue(ANALYSIS_QUEUE_NAME)
  transcriptionQueue = createQueue(TRANSCRIPTION_QUEUE_NAME)
})

beforeEach(async () => {
  if (!runDatabaseRedisTests) {
    return
  }

  process.env.REDIS_URL = projectEnv.REDIS_URL
  await closeRecordingWorkflowQueue()
  await closeRedisConnections()
  await emptyQueues()
  await query('TRUNCATE TABLE workflow_outbox RESTART IDENTITY')
  await query('TRUNCATE TABLE meetings RESTART IDENTITY CASCADE')
  await query('TRUNCATE TABLE users RESTART IDENTITY CASCADE')
})

afterAll(async () => {
  if (!runDatabaseRedisTests) {
    return
  }

  await closeRecordingWorkflowQueue()
  await closeRedisConnections()
  await Promise.all([analysisQueue.disconnect(), transcriptionQueue.disconnect()])
  await closePool()
})

dbRedisDescribe('Recording workflow outbox dispatch (DB + Redis)', () => {
  it('publishes a transcription child and analysis parent BullMQ flow', async () => {
    const workflow = await seedWorkflowEvent()

    const results = await dispatchPendingWorkflowOutbox({ limit: 1, retryDelaySeconds: 1 })

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      id: workflow.outboxId,
      status: 'dispatched',
      attempts: 1,
    })

    const analysisJobId = `analysis-${workflow.analysisRunId}`
    const transcriptionJobId = `transcription-${workflow.transcriptId}`
    expect(analysisJobId).not.toContain(':')
    expect(transcriptionJobId).not.toContain(':')

    const analysisJob = await analysisQueue.getJob(analysisJobId)
    const transcriptionJob = await transcriptionQueue.getJob(transcriptionJobId)

    expect(analysisJob).toBeDefined()
    expect(analysisJob.data).toEqual({
      recordingId: workflow.recordingId,
      transcriptId: workflow.transcriptId,
      analysisRunId: workflow.analysisRunId,
    })
    expect(await analysisJob.getState()).toBe('waiting-children')
    expect(transcriptionJob).toBeDefined()
    expect(transcriptionJob.data).toEqual({
      recordingId: workflow.recordingId,
      transcriptId: workflow.transcriptId,
    })
  })

  it('retains workflow intent through transient Redis failure and dispatches later', async () => {
    const workflow = await seedWorkflowEvent()

    process.env.REDIS_URL = 'redis://127.0.0.1:1'
    await closeRecordingWorkflowQueue()
    await closeRedisConnections()

    const failedResults = await dispatchPendingWorkflowOutbox({
      limit: 1,
      retryDelaySeconds: 1,
    })

    expect(failedResults[0]).toMatchObject({
      id: workflow.outboxId,
      status: 'failed',
      attempts: 1,
    })
    expect(failedResults[0].lastError).toBeTruthy()
    expect(await analysisQueue.getJob(`analysis-${workflow.analysisRunId}`)).toBeUndefined()

    process.env.REDIS_URL = projectEnv.REDIS_URL
    await closeRecordingWorkflowQueue()
    await closeRedisConnections()
    await query(
      `
        UPDATE workflow_outbox
        SET available_at = NOW()
        WHERE id = $1
      `,
      [workflow.outboxId]
    )

    const recoveredResults = await dispatchPendingWorkflowOutbox({
      limit: 1,
      retryDelaySeconds: 1,
    })

    expect(recoveredResults[0]).toMatchObject({
      id: workflow.outboxId,
      status: 'dispatched',
      attempts: 2,
      lastError: null,
    })
    expect(await analysisQueue.getJob(`analysis-${workflow.analysisRunId}`)).toBeDefined()
    expect(await transcriptionQueue.getJob(`transcription-${workflow.transcriptId}`)).toBeDefined()
  })

  it('replays an outbox event without creating duplicate Redis jobs', async () => {
    const workflow = await seedWorkflowEvent()

    await dispatchPendingWorkflowOutbox({ limit: 1, retryDelaySeconds: 1 })
    const firstAnalysisJob = await analysisQueue.getJob(`analysis-${workflow.analysisRunId}`)
    const firstTranscriptionJob = await transcriptionQueue.getJob(
      `transcription-${workflow.transcriptId}`
    )

    await query(
      `
        UPDATE workflow_outbox
        SET status = 'pending',
            dispatched_at = NULL,
            available_at = NOW()
        WHERE id = $1
      `,
      [workflow.outboxId]
    )

    const replayResults = await dispatchPendingWorkflowOutbox({ limit: 1, retryDelaySeconds: 1 })

    expect(replayResults[0]).toMatchObject({
      id: workflow.outboxId,
      status: 'dispatched',
      attempts: 2,
    })
    expect((await analysisQueue.getJob(`analysis-${workflow.analysisRunId}`)).id).toBe(
      firstAnalysisJob.id
    )
    expect((await transcriptionQueue.getJob(`transcription-${workflow.transcriptId}`)).id).toBe(
      firstTranscriptionJob.id
    )

    const analysisJobsForWorkflow = (await listQueueJobs(analysisQueue)).filter(
      (job) => job.data.analysisRunId === workflow.analysisRunId
    )
    const transcriptionJobsForWorkflow = (await listQueueJobs(transcriptionQueue)).filter(
      (job) => job.data.transcriptId === workflow.transcriptId
    )

    expect(analysisJobsForWorkflow).toHaveLength(1)
    expect(transcriptionJobsForWorkflow).toHaveLength(1)
  })

  it('dispatcher ticks claim pending workflow events outside the upload path', async () => {
    const workflow = await seedWorkflowEvent()
    const dispatcher = createWorkflowOutboxDispatcher({
      environment: {
        AI_PIPELINE_ENABLED: 'true',
        WORKFLOW_OUTBOX_DISPATCH_LIMIT: '1',
        WORKFLOW_OUTBOX_DISPATCH_INTERVAL_MS: '1000',
        WORKFLOW_OUTBOX_RETRY_DELAY_SECONDS: '1',
      },
    })

    await dispatcher.dispatchOnce()
    await dispatcher.stop()

    const outboxResult = await query(
      `
        SELECT status, attempts
        FROM workflow_outbox
        WHERE id = $1
      `,
      [workflow.outboxId]
    )

    expect(outboxResult.rows[0]).toMatchObject({
      status: 'dispatched',
      attempts: 1,
    })
  })
})
