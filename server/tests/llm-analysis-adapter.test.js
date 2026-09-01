import { createServer } from 'node:http'

import { afterEach, describe, expect, it } from '@jest/globals'

const { createLlmAnalysisAdapter } = await import('../services/analysis/llm-analysis-adapter.js')

const servers = []

const startServer = async (handler) => {
  const server = createServer(handler)
  servers.push(server)

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

  return `http://127.0.0.1:${server.address().port}`
}

const readBody = async (request) => {
  let raw = ''

  for await (const chunk of request) {
    raw += chunk.toString('utf8')
  }

  return JSON.parse(raw)
}

const respondWith = (payload, status = 200) =>
  startServer(async (request, response) => {
    request.received = await readBody(request)
    servers.lastBody = request.received
    response.statusCode = status
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify(payload))
  })

const SUMMARY = {
  summary: 'The team agreed to trial a capacitor.',
  key_discussions: [{ topic: 'Feeder voltage', detail: 'Voltage falls at peak.', evidence: [0] }],
  decisions: [{ decision: 'Trial a capacitor.', rationale: 'Cheapest option.', evidence: [1] }],
  action_items: [
    {
      task: 'Run the load-flow model.',
      owner: 'Priya Nair',
      due_date: '2026-09-10',
      priority: 'high',
      evidence: [1],
    },
  ],
  language: 'en',
  model: 'llama3',
  prompt_version: '2026-09-01',
}

const TRANSCRIPT = {
  segments: [{ text: 'Voltage falls at peak.' }, { text: 'We will trial a capacitor.' }],
}

const PARTICIPANTS = [
  { id: 'user-priya', name: 'Priya Nair' },
  { id: 'user-ken', name: 'Ken Ito' },
]

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))
  )
})

describe('LLM analysis adapter', () => {
  it('rejects an invalid service URL at startup', () => {
    expect(() =>
      createLlmAnalysisAdapter({ environment: { AI_SERVICE_URL: 'localhost:8000' } })
    ).toThrow('AI_SERVICE_URL must be an HTTP or HTTPS URL')
  })

  it('sends numbered segments and maps the response to the application shape', async () => {
    const baseUrl = await respondWith(SUMMARY)
    const adapter = createLlmAnalysisAdapter({
      environment: { AI_SERVICE_URL: baseUrl, AI_ANALYSIS_LANGUAGE: 'en' },
    })

    const result = await adapter.analyse({
      transcript: TRANSCRIPT,
      participants: PARTICIPANTS,
    })

    expect(servers.lastBody.segments).toEqual([
      { index: 0, text: 'Voltage falls at peak.' },
      { index: 1, text: 'We will trial a capacitor.' },
    ])
    expect(result.summary).toBe('The team agreed to trial a capacitor.')
    expect(result.keyDiscussions[0]).toEqual({
      topic: 'Feeder voltage',
      detail: 'Voltage falls at peak.',
      evidence: [0],
    })
    expect(result.decisions[0].rationale).toBe('Cheapest option.')
    expect(result.model).toBe('llama3')
    expect(result.promptVersion).toBe('2026-09-01')
  })

  it('resolves an owner only to a participant of this meeting', async () => {
    const baseUrl = await respondWith(SUMMARY)
    const adapter = createLlmAnalysisAdapter({ environment: { AI_SERVICE_URL: baseUrl } })

    const result = await adapter.analyse({ transcript: TRANSCRIPT, participants: PARTICIPANTS })

    expect(result.suggestions[0].assigneeId).toBe('user-priya')
    expect(result.suggestions[0].priority).toBe('high')
    expect(result.suggestions[0].dueDate).toBe('2026-09-10T00:00:00.000Z')
  })

  it('leaves the assignee empty when the named owner is not in the meeting', async () => {
    const baseUrl = await respondWith(SUMMARY)
    const adapter = createLlmAnalysisAdapter({ environment: { AI_SERVICE_URL: baseUrl } })

    const result = await adapter.analyse({
      transcript: TRANSCRIPT,
      participants: [{ id: 'user-ken', name: 'Ken Ito' }],
    })

    expect(result.suggestions[0].assigneeId).toBeNull()
  })

  it('leaves the assignee empty when the name is ambiguous', async () => {
    const baseUrl = await respondWith(SUMMARY)
    const adapter = createLlmAnalysisAdapter({ environment: { AI_SERVICE_URL: baseUrl } })

    const result = await adapter.analyse({
      transcript: TRANSCRIPT,
      participants: [
        { id: 'user-a', name: 'Priya Nair' },
        { id: 'user-b', name: 'priya nair' },
      ],
    })

    expect(result.suggestions[0].assigneeId).toBeNull()
  })

  it('drops a due date that is not an unambiguous calendar date', async () => {
    const baseUrl = await respondWith({
      ...SUMMARY,
      action_items: [{ ...SUMMARY.action_items[0], due_date: 'next Friday' }],
    })
    const adapter = createLlmAnalysisAdapter({ environment: { AI_SERVICE_URL: baseUrl } })

    const result = await adapter.analyse({ transcript: TRANSCRIPT, participants: PARTICIPANTS })

    expect(result.suggestions[0].dueDate).toBeNull()
  })

  it('falls back to medium when the provider gives an unknown priority', async () => {
    const baseUrl = await respondWith({
      ...SUMMARY,
      action_items: [{ ...SUMMARY.action_items[0], priority: 'urgent' }],
    })
    const adapter = createLlmAnalysisAdapter({ environment: { AI_SERVICE_URL: baseUrl } })

    const result = await adapter.analyse({ transcript: TRANSCRIPT, participants: PARTICIPANTS })

    expect(result.suggestions[0].priority).toBe('medium')
  })

  it('rejects a malformed successful response as a permanent provider error', async () => {
    const baseUrl = await respondWith({ summary: 'Missing everything else.' })
    const adapter = createLlmAnalysisAdapter({ environment: { AI_SERVICE_URL: baseUrl } })

    await expect(
      adapter.analyse({ transcript: TRANSCRIPT, participants: PARTICIPANTS })
    ).rejects.toMatchObject({
      name: 'AnalysisProviderError',
      retryable: false,
      message: 'Analysis service returned an invalid response',
    })
  })

  it('marks a 502 from the provider as retryable without exposing its detail', async () => {
    const baseUrl = await respondWith(
      { detail: 'Llama 3 summarization failed: connect refused' },
      502
    )
    const adapter = createLlmAnalysisAdapter({ environment: { AI_SERVICE_URL: baseUrl } })

    await expect(
      adapter.analyse({ transcript: TRANSCRIPT, participants: PARTICIPANTS })
    ).rejects.toMatchObject({
      name: 'AnalysisProviderError',
      retryable: true,
      message: 'Analysis service is temporarily unavailable',
    })
  })

  it('marks a 422 from the provider as permanent', async () => {
    const baseUrl = await respondWith({ detail: 'language must be English or Filipino' }, 422)
    const adapter = createLlmAnalysisAdapter({ environment: { AI_SERVICE_URL: baseUrl } })

    await expect(
      adapter.analyse({ transcript: TRANSCRIPT, participants: PARTICIPANTS })
    ).rejects.toMatchObject({
      name: 'AnalysisProviderError',
      retryable: false,
      message: 'Analysis service rejected the request',
    })
  })

  it('refuses a transcript with no segments before calling the provider', async () => {
    const adapter = createLlmAnalysisAdapter({
      environment: { AI_SERVICE_URL: 'http://127.0.0.1:9' },
    })

    await expect(adapter.analyse({ transcript: { segments: [] } })).rejects.toThrow(
      'Analysis requires a transcript with at least one segment'
    )
  })
})
