import { describe, expect, it, jest } from '@jest/globals'

const { publishAiJob } = await import('../services/ai-streams.js')

describe('AI Redis Streams', () => {
  it('publishes a self-contained, correlated job envelope', async () => {
    const connection = {
      xadd: jest.fn().mockResolvedValue('1710000000000-0'),
    }

    const result = await publishAiJob(
      {
        stream: 'ai.transcription.jobs',
        eventType: 'transcription.requested',
        jobId: 'transcription-1',
        eventId: 'outbox-1',
        payload: { transcriptId: 'transcript-1' },
      },
      { connection }
    )

    expect(result).toEqual({
      eventId: 'outbox-1',
      messageId: '1710000000000-0',
      stream: 'ai.transcription.jobs',
      eventType: 'transcription.requested',
      jobId: 'transcription-1',
    })
    expect(connection.xadd).toHaveBeenCalledWith(
      'ai.transcription.jobs',
      'MAXLEN',
      '~',
      expect.any(Number),
      '*',
      'eventId',
      'outbox-1',
      'eventType',
      'transcription.requested',
      'jobId',
      'transcription-1',
      'payload',
      JSON.stringify({ transcriptId: 'transcript-1' })
    )
  })

  it('rejects jobs without a correlation id', async () => {
    await expect(
      publishAiJob(
        {
          stream: 'ai.transcription.jobs',
          eventType: 'transcription.requested',
          payload: {},
        },
        { connection: {} }
      )
    ).rejects.toThrow('AI stream jobs require stream, eventType, and jobId')
  })

  it('connects a lazy producer before publishing', async () => {
    const connection = {
      status: 'wait',
      connect: jest.fn().mockResolvedValue(),
      xadd: jest.fn().mockResolvedValue('1710000000000-0'),
    }

    await publishAiJob(
      {
        stream: 'ai.transcription.jobs',
        eventType: 'transcription.requested',
        jobId: 'transcription-1',
        payload: {},
      },
      { connection }
    )

    expect(connection.connect).toHaveBeenCalledTimes(1)
  })
})
