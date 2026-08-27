import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, jest } from '@jest/globals'

import { createWorkerRuntime } from '../worker-runtime.js'

const serverDir = fileURLToPath(new URL('../', import.meta.url))

const createDispatcher = ({ enabled = true } = {}) => ({
  isEnabled: jest.fn(() => enabled),
  start: jest.fn(),
  stop: jest.fn().mockResolvedValue(undefined),
})

const createLogger = () => ({
  log: jest.fn(),
})

describe('worker runtime', () => {
  it('starts the workflow outbox dispatcher when required config is present', () => {
    const dispatcher = createDispatcher()
    const logger = createLogger()
    const runtime = createWorkerRuntime({
      dispatcher,
      logger,
      environment: {
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/meeting_mgnt',
        REDIS_URL: 'redis://localhost:6379',
      },
    })

    expect(runtime.start()).toBe(true)
    expect(dispatcher.start).toHaveBeenCalledTimes(1)
    expect(logger.log).toHaveBeenCalledWith('Worker runtime started')
  })

  it('fails fast when enabled without required worker config', () => {
    const dispatcher = createDispatcher()
    const runtime = createWorkerRuntime({
      dispatcher,
      logger: createLogger(),
      environment: {
        DATABASE_URL: '',
        REDIS_URL: '',
      },
    })

    expect(() => runtime.start()).toThrow(
      'Worker runtime missing required config: DATABASE_URL, REDIS_URL'
    )
    expect(dispatcher.start).not.toHaveBeenCalled()
  })

  it('fails fast when worker-owned outbox config is invalid', () => {
    const dispatcher = createDispatcher()
    const runtime = createWorkerRuntime({
      dispatcher,
      logger: createLogger(),
      environment: {
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/meeting_mgnt',
        REDIS_URL: 'redis://localhost:6379',
        WORKFLOW_OUTBOX_DISPATCH_LIMIT: '0',
      },
    })

    expect(() => runtime.start()).toThrow(
      'Worker runtime invalid config: WORKFLOW_OUTBOX_DISPATCH_LIMIT'
    )
    expect(dispatcher.start).not.toHaveBeenCalled()
  })

  it('blocks fixture providers in production without an explicit unsafe override', () => {
    const runtime = createWorkerRuntime({
      dispatcher: createDispatcher(),
      logger: createLogger(),
      environment: {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/meeting_mgnt',
        REDIS_URL: 'redis://localhost:6379',
        AI_TRANSCRIPTION_PROVIDER: 'fixture',
      },
    })

    expect(() => runtime.start()).toThrow(
      'Worker runtime fixture providers require ALLOW_UNSAFE_FIXTURE_PROVIDERS=true: AI_TRANSCRIPTION_PROVIDER'
    )
  })

  it('does not start the dispatcher when the AI pipeline is disabled', () => {
    const dispatcher = createDispatcher({ enabled: false })
    const logger = createLogger()
    const runtime = createWorkerRuntime({
      dispatcher,
      logger,
      environment: {},
    })

    expect(runtime.start()).toBe(false)
    expect(dispatcher.start).not.toHaveBeenCalled()
    expect(logger.log).toHaveBeenCalledWith(
      'Worker runtime disabled because AI_PIPELINE_ENABLED is not true'
    )
  })

  it('stops the dispatcher before closing database connections', async () => {
    const calls = []
    const dispatcher = {
      isEnabled: jest.fn(() => true),
      start: jest.fn(),
      stop: jest.fn(async () => calls.push('dispatcher')),
    }
    const closeDatabase = jest.fn(async () => calls.push('database'))
    const runtime = createWorkerRuntime({
      dispatcher,
      closeDatabase,
      logger: createLogger(),
      environment: {
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/meeting_mgnt',
        REDIS_URL: 'redis://localhost:6379',
      },
    })

    await runtime.stop()
    await runtime.stop()

    expect(calls).toEqual(['dispatcher', 'database'])
  })

  it('starts registered services and stops them before dispatcher-owned connections', async () => {
    const calls = []
    const service = {
      start: jest.fn(() => calls.push('service:start')),
      stop: jest.fn(async () => calls.push('service:stop')),
    }
    const dispatcher = {
      isEnabled: jest.fn(() => true),
      start: jest.fn(() => calls.push('dispatcher:start')),
      stop: jest.fn(async () => calls.push('dispatcher:stop')),
    }
    const runtime = createWorkerRuntime({
      dispatcher,
      services: [service],
      closeDatabase: jest.fn(async () => calls.push('database')),
      logger: createLogger(),
      environment: {
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/meeting_mgnt',
        REDIS_URL: 'redis://localhost:6379',
      },
    })

    runtime.start()
    await runtime.stop()

    expect(calls).toEqual([
      'dispatcher:start',
      'service:start',
      'service:stop',
      'dispatcher:stop',
      'database',
    ])
  })

  it('keeps the Express API entrypoint independent from workflow dispatch', () => {
    const indexSource = readFileSync(path.join(serverDir, 'index.js'), 'utf8')

    expect(indexSource).not.toContain('createWorkflowOutboxDispatcher')
    expect(indexSource).not.toContain('workflow-outbox-dispatcher')
  })
})
