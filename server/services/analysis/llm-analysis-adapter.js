import { Agent, fetch as undiciFetch } from 'undici'

const DEFAULT_TIMEOUT_MS = 300000

export class AnalysisProviderError extends Error {
  constructor(message, { retryable, cause } = {}) {
    super(message, { cause })
    this.name = 'AnalysisProviderError'
    this.retryable = retryable
  }
}

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const PRIORITIES = new Set(['low', 'medium', 'high'])

const isFiniteIndex = (value) => Number.isInteger(value) && value >= 0

const isEvidence = (value) => Array.isArray(value) && value.every(isFiniteIndex)

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0

/**
 * The provider's own shape, checked before it is translated. The application
 * schema is checked again afterwards by the worker; this one exists so a
 * malformed provider response is reported as a provider fault rather than
 * surfacing later as a confusing application-schema error.
 */
const isValidResponse = (body) =>
  body !== null &&
  typeof body === 'object' &&
  isNonEmptyString(body.summary) &&
  isNonEmptyString(body.model) &&
  isNonEmptyString(body.prompt_version) &&
  Array.isArray(body.key_discussions) &&
  body.key_discussions.every(
    (item) =>
      isNonEmptyString(item?.topic) && isNonEmptyString(item?.detail) && isEvidence(item?.evidence)
  ) &&
  Array.isArray(body.decisions) &&
  body.decisions.every((item) => isNonEmptyString(item?.decision) && isEvidence(item?.evidence)) &&
  Array.isArray(body.action_items) &&
  body.action_items.every((item) => isNonEmptyString(item?.task) && isEvidence(item?.evidence))

const discardResponseBody = async (response) => {
  try {
    await response.body?.cancel()
  } catch {
    // Preserve the provider classification if the failed response also disconnects.
  }
}

/**
 * The model is asked for a due date but produces free text. Anything that is not
 * an unambiguous calendar date becomes null: the guardrail is that an uncertain
 * date stays empty rather than being guessed into the record, and a reviewer can
 * always set one when accepting.
 */
const parseDueDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return null
  }

  const parsed = new Date(`${value.trim()}T00:00:00Z`)

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

/**
 * Resolve the owner the model named to a participant of this meeting.
 *
 * Matching is exact on the full name, case-insensitively, and an ambiguous name
 * resolves to nobody. A wrong assignee is worse than none: it puts a task in
 * someone's list that was never theirs, and the reviewer may not notice the
 * substitution. Acceptance re-checks participation anyway, so this only sets the
 * default the reviewer sees.
 */
const resolveAssignee = (owner, participants) => {
  if (!isNonEmptyString(owner) || !Array.isArray(participants)) {
    return null
  }

  const wanted = owner.trim().toLowerCase()
  const matches = participants.filter((person) => person?.name?.trim().toLowerCase() === wanted)

  return matches.length === 1 ? matches[0].id : null
}

/**
 * Same reason as the transcription adapter: Node's built-in fetch abandons a
 * request after 300 seconds of waiting for headers regardless of
 * AbortSignal.timeout, and /v1/summarize sends none until Llama 3 has finished.
 *
 * It is harder to spot here, because OLLAMA_TIMEOUT_SECONDS also defaults to 300
 * and a long transcript can plausibly exhaust either one.
 */
const createDispatcher = (timeoutMs) =>
  new Agent({ headersTimeout: timeoutMs, bodyTimeout: timeoutMs })

export const createLlmAnalysisAdapter = ({
  environment = process.env,
  request = undiciFetch,
  dispatcher,
} = {}) => {
  const configuredUrl = environment.AI_SERVICE_URL

  if (!configuredUrl) {
    throw new Error('AI_SERVICE_URL is not configured')
  }

  let serviceUrl

  try {
    serviceUrl = new URL(configuredUrl)
  } catch {
    throw new Error('AI_SERVICE_URL must be an HTTP or HTTPS URL')
  }

  if (!['http:', 'https:'].includes(serviceUrl.protocol)) {
    throw new Error('AI_SERVICE_URL must be an HTTP or HTTPS URL')
  }

  const baseUrl = serviceUrl.toString().replace(/\/+$/, '')
  const language = environment.AI_ANALYSIS_LANGUAGE || environment.AI_TRANSCRIPTION_LANGUAGE || 'en'
  const timeoutMs = parsePositiveInteger(
    environment.AI_ANALYSIS_REQUEST_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS
  )
  const requestDispatcher = createDispatcher(timeoutMs)

  return {
    name: 'llm',
    async analyse({ transcript, participants = [] }) {
      const segments = Array.isArray(transcript?.segments) ? transcript.segments : []

      if (segments.length === 0) {
        throw new Error('Analysis requires a transcript with at least one segment')
      }

      let response

      try {
        response = await request(`${baseUrl}/v1/summarize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language,
            // Index by position, which is what the evidence in the stored result
            // means and what the application schema validates against.
            segments: segments.map((segment, index) => ({ index, text: segment.text ?? '' })),
          }),
          signal: AbortSignal.timeout(timeoutMs),
          dispatcher: dispatcher ?? requestDispatcher,
        })
      } catch (error) {
        throw new AnalysisProviderError('Analysis service request failed', {
          retryable: true,
          cause: error,
        })
      }

      if (!response.ok) {
        const retryable =
          response.status === 408 || response.status === 429 || response.status >= 500
        await discardResponseBody(response)
        throw new AnalysisProviderError(
          retryable
            ? 'Analysis service is temporarily unavailable'
            : 'Analysis service rejected the request',
          { retryable }
        )
      }

      let body

      try {
        body = await response.json()
      } catch (error) {
        const retryable = !(error instanceof SyntaxError)
        throw new AnalysisProviderError(
          retryable
            ? 'Analysis service response was interrupted'
            : 'Analysis service returned an invalid response',
          { retryable, cause: error }
        )
      }

      if (!isValidResponse(body)) {
        throw new AnalysisProviderError('Analysis service returned an invalid response', {
          retryable: false,
        })
      }

      return {
        summary: body.summary,
        keyDiscussions: body.key_discussions.map((item) => ({
          topic: item.topic,
          detail: item.detail,
          evidence: item.evidence,
        })),
        decisions: body.decisions.map((item) => ({
          decision: item.decision,
          // The application schema wants a rationale; the model may leave it
          // blank rather than pad it, and an empty string is honest about that.
          rationale: isNonEmptyString(item.rationale) ? item.rationale : '',
          evidence: item.evidence,
        })),
        suggestions: body.action_items.map((item) => ({
          title: item.task,
          description: isNonEmptyString(item.description) ? item.description : null,
          priority: PRIORITIES.has(item.priority) ? item.priority : 'medium',
          assigneeId: resolveAssignee(item.owner, participants),
          dueDate: parseDueDate(item.due_date),
          evidence: item.evidence,
        })),
        model: body.model,
        promptVersion: body.prompt_version,
      }
    },
  }
}
