import { describe, expect, it, jest } from '@jest/globals'

const { createOllamaAnalysisAdapter } = await import(
  '../services/analysis/ollama-analysis-adapter.js'
)

describe('Ollama analysis adapter', () => {
  it('requests factual English structured minutes from indexed transcript segments', async () => {
    const request = jest.fn(async (_url, _options) => ({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            summary: 'Alice scheduled the probability review for Friday.',
            keyDiscussions: [],
            decisions: [],
            suggestions: [],
          }),
        },
      }),
    }))
    const adapter = createOllamaAnalysisAdapter({
      environment: { OLLAMA_URL: 'http://localhost:11434', OLLAMA_MODEL: 'llama3:latest' },
      request,
    })

    const result = await adapter.analyse({
      transcript: { segments: [{ text: 'We reviewed Bayes rule.' }, { text: 'Alice: Friday.' }] },
    })

    expect(result.summary).toContain('Alice')
    expect(result.model).toBe('llama3:latest')
    expect(result.promptVersion).toBe('english-meeting-minutes-v1')
    const body = JSON.parse(request.mock.calls[0][1].body)
    expect(body.stream).toBe(false)
    expect(body.options.temperature).toBe(0)
    expect(body.messages[1].content).toContain('[1] Alice: Friday.')
  })
})
