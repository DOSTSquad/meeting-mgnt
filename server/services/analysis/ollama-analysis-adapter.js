const DEFAULT_URL = 'http://127.0.0.1:11434'
const DEFAULT_MODEL = 'llama3:latest'
const DEFAULT_TIMEOUT_MS = 300000
const PROMPT_VERSION = 'english-meeting-minutes-v1'

const outputSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string', minLength: 1 },
    keyDiscussions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string', minLength: 1 },
          detail: { type: 'string', minLength: 1 },
          evidence: { type: 'array', minItems: 1, items: { type: 'integer' } },
        },
        required: ['topic', 'detail', 'evidence'],
      },
    },
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          decision: { type: 'string', minLength: 1 },
          rationale: { type: 'string', minLength: 1 },
          evidence: { type: 'array', minItems: 1, items: { type: 'integer' } },
        },
        required: ['decision', 'rationale', 'evidence'],
      },
    },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1 },
          description: { type: 'string', minLength: 1 },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          evidence: { type: 'array', minItems: 1, items: { type: 'integer' } },
        },
        required: ['title', 'description', 'priority', 'evidence'],
      },
    },
  },
  required: ['summary', 'keyDiscussions', 'decisions', 'suggestions'],
}

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const buildTranscript = (transcript) =>
  (transcript.segments ?? [])
    .map((segment, index) => `[${index}] ${String(segment.text ?? '').trim()}`)
    .join('\n')

export const createOllamaAnalysisAdapter = ({ environment = process.env, request = fetch } = {}) => {
  const baseUrl = (environment.OLLAMA_URL || DEFAULT_URL).replace(/\/+$/, '')
  const model = environment.OLLAMA_MODEL || DEFAULT_MODEL
  const timeoutMs = parsePositiveInteger(environment.OLLAMA_REQUEST_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)

  return {
    name: 'ollama',

    analyse: async ({ transcript }) => {
      const indexedTranscript = buildTranscript(transcript)
      if (!indexedTranscript) {
        throw new Error('Analysis requires a transcript with at least one segment')
      }

      const response = await request(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model,
          stream: false,
          format: outputSchema,
          options: { temperature: 0, num_ctx: 8192 },
          messages: [
            {
              role: 'system',
              content:
                'You create a factual English meeting summary and extract action items. Use only the supplied transcript. The summary must contain 2-4 specific sentences. Preserve names, topics, numbers, deadlines, decisions, and assigned actions. Never invent missing names, assignments, follow-ups, or deadlines. Include an action item only when the transcript explicitly states a task, commitment, or requested follow-up. Return an empty suggestions array when no action item is stated. Return empty keyDiscussions and decisions arrays because the application only displays Summary and Action Items. Every evidence value must be a valid transcript segment index.',
            },
            {
              role: 'user',
              content: `Create concise English meeting minutes from this indexed transcript. Follow this JSON schema exactly:\n${JSON.stringify(outputSchema)}\n\nTranscript:\n${indexedTranscript}`,
            },
          ],
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama analysis request failed with status ${response.status}`)
      }

      const payload = await response.json()
      const content = payload?.message?.content
      if (typeof content !== 'string') {
        throw new Error('Ollama returned an invalid analysis response')
      }

      let result
      try {
        result = JSON.parse(content)
      } catch (error) {
        throw new Error('Ollama returned invalid JSON', { cause: error })
      }

      return { ...result, model, promptVersion: PROMPT_VERSION }
    },
  }
}
