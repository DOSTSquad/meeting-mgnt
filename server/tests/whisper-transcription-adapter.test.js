import { createServer } from 'node:http'
import { Readable } from 'node:stream'

import { afterEach, describe, expect, it } from '@jest/globals'

const { createWhisperTranscriptionAdapter } =
  await import('../services/transcription/whisper-transcription-adapter.js')

const servers = []

const startServer = async (handler) => {
  const server = createServer(handler)
  servers.push(server)

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

  const { port } = server.address()
  return `http://127.0.0.1:${port}`
}

const drainRequest = async (request) => {
  for await (const chunk of request) {
    void chunk
  }
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))
  )
})

describe('Whisper transcription adapter', () => {
  it('rejects an invalid service URL at startup', () => {
    expect(() =>
      createWhisperTranscriptionAdapter({
        environment: { AI_SERVICE_URL: 'localhost:8000' },
      })
    ).toThrow('AI_SERVICE_URL must be an HTTP or HTTPS URL')
  })

  it('streams audio to FastAPI and maps the transcription response', async () => {
    let receivedUrl
    let receivedContentType
    let receivedBody = ''
    const baseUrl = await startServer(async (request, response) => {
      receivedUrl = request.url
      receivedContentType = request.headers['content-type']

      for await (const chunk of request) {
        receivedBody += chunk.toString('utf8')
      }

      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify({
          text: 'The meeting agreed to ship on Friday.',
          language: 'en',
          duration_seconds: 12.5,
          model: 'small',
          segments: [
            {
              id: 0,
              start: 0,
              end: 12.5,
              text: 'The meeting agreed to ship on Friday.',
            },
          ],
        })
      )
    })
    const adapter = createWhisperTranscriptionAdapter({
      environment: {
        AI_SERVICE_URL: baseUrl,
        AI_TRANSCRIPTION_LANGUAGE: 'en',
        AI_TRANSCRIPTION_REQUEST_TIMEOUT_MS: '1000',
      },
    })

    const result = await adapter.transcribe({
      recording: { fileName: 'weekly standup.m4a', mimeType: 'audio/mp4' },
      audioStream: Readable.from([Buffer.from('first-audio-'), Buffer.from('second-chunk')]),
    })

    expect(receivedUrl).toBe('/v1/transcribe?language=en')
    expect(receivedContentType).toMatch(/^multipart\/form-data; boundary=/)
    expect(receivedBody).toContain('filename="weekly standup.m4a"')
    expect(receivedBody).toContain('first-audio-second-chunk')
    expect(result).toEqual({
      text: 'The meeting agreed to ship on Friday.',
      durationSeconds: 13,
      segments: [
        {
          startSeconds: 0,
          endSeconds: 12.5,
          speaker: null,
          text: 'The meeting agreed to ship on Friday.',
        },
      ],
    })
  })

  it('maps a zero provider duration to null for the database constraint', async () => {
    const baseUrl = await startServer(async (request, response) => {
      await drainRequest(request)
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify({
          text: '',
          language: 'en',
          duration_seconds: 0,
          model: 'small',
          segments: [],
        })
      )
    })
    const adapter = createWhisperTranscriptionAdapter({
      environment: { AI_SERVICE_URL: baseUrl },
    })

    const result = await adapter.transcribe({
      recording: { fileName: 'silence.wav', mimeType: 'audio/wav' },
      audioStream: Readable.from([Buffer.from('audio')]),
    })

    expect(result.durationSeconds).toBeNull()
  })

  it('rejects a malformed successful response as a permanent provider error', async () => {
    const baseUrl = await startServer(async (request, response) => {
      await drainRequest(request)
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ text: 'Missing the remaining required fields.' }))
    })
    const adapter = createWhisperTranscriptionAdapter({
      environment: { AI_SERVICE_URL: baseUrl },
    })

    await expect(
      adapter.transcribe({
        recording: { fileName: 'meeting.wav', mimeType: 'audio/wav' },
        audioStream: Readable.from([Buffer.from('audio')]),
      })
    ).rejects.toMatchObject({
      name: 'TranscriptionProviderError',
      retryable: false,
      message: 'Whisper returned an invalid transcription response',
    })
  })

  it('marks an interrupted successful response body as retryable', async () => {
    const baseUrl = await startServer(async (request, response) => {
      await drainRequest(request)
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.flushHeaders()
      response.write('{"text":"partial')
      setTimeout(() => response.destroy(), 10)
    })
    const adapter = createWhisperTranscriptionAdapter({
      environment: { AI_SERVICE_URL: baseUrl },
    })

    await expect(
      adapter.transcribe({
        recording: { fileName: 'meeting.wav', mimeType: 'audio/wav' },
        audioStream: Readable.from([Buffer.from('audio')]),
      })
    ).rejects.toMatchObject({
      name: 'TranscriptionProviderError',
      retryable: true,
      message: 'Whisper service response was interrupted',
    })
  })

  it('marks a provider 503 response as retryable without exposing its detail', async () => {
    const baseUrl = await startServer(async (request, response) => {
      await drainRequest(request)
      response.statusCode = 503
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ detail: 'internal model path /secret/model.bin failed' }))
    })
    const adapter = createWhisperTranscriptionAdapter({
      environment: { AI_SERVICE_URL: baseUrl },
    })

    await expect(
      adapter.transcribe({
        recording: { fileName: 'meeting.wav', mimeType: 'audio/wav' },
        audioStream: Readable.from([Buffer.from('audio')]),
      })
    ).rejects.toMatchObject({
      name: 'TranscriptionProviderError',
      retryable: true,
      message: 'Whisper service is temporarily unavailable',
    })
  })

  it('marks a provider 408 response as retryable', async () => {
    const baseUrl = await startServer(async (request, response) => {
      await drainRequest(request)
      response.statusCode = 408
      response.end()
    })
    const adapter = createWhisperTranscriptionAdapter({
      environment: { AI_SERVICE_URL: baseUrl },
    })

    await expect(
      adapter.transcribe({
        recording: { fileName: 'meeting.wav', mimeType: 'audio/wav' },
        audioStream: Readable.from([Buffer.from('audio')]),
      })
    ).rejects.toMatchObject({
      name: 'TranscriptionProviderError',
      retryable: true,
      message: 'Whisper service is temporarily unavailable',
    })
  })

  it('marks a provider 415 response as a permanent error', async () => {
    const baseUrl = await startServer(async (request, response) => {
      await drainRequest(request)
      response.statusCode = 415
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ detail: 'Unsupported audio type' }))
    })
    const adapter = createWhisperTranscriptionAdapter({
      environment: { AI_SERVICE_URL: baseUrl },
    })

    await expect(
      adapter.transcribe({
        recording: { fileName: 'meeting.wav', mimeType: 'audio/wav' },
        audioStream: Readable.from([Buffer.from('audio')]),
      })
    ).rejects.toMatchObject({
      name: 'TranscriptionProviderError',
      retryable: false,
      message: 'Whisper rejected the transcription request',
    })
  })

  it('reports a request timeout as a retryable provider error', async () => {
    const baseUrl = await startServer(async (request, response) => {
      await drainRequest(request)
      setTimeout(() => response.end('{}'), 100)
    })
    const adapter = createWhisperTranscriptionAdapter({
      environment: {
        AI_SERVICE_URL: baseUrl,
        AI_TRANSCRIPTION_REQUEST_TIMEOUT_MS: '20',
      },
    })

    await expect(
      adapter.transcribe({
        recording: { fileName: 'meeting.wav', mimeType: 'audio/wav' },
        audioStream: Readable.from([Buffer.from('audio')]),
      })
    ).rejects.toMatchObject({
      name: 'TranscriptionProviderError',
      retryable: true,
      message: 'Whisper service request failed',
    })
  })
})
