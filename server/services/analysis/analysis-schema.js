/**
 * Structured-output contract for meeting analysis.
 *
 * Validation runs before anything is written, so a provider that returns a
 * plausible-looking but malformed object fails the run instead of persisting
 * half a review. This matters more for a real LLM than for the fixture: model
 * output is untrusted input.
 *
 * @typedef {object} AnalysisEvidence
 * @property {number} segmentIndex Index into the transcript's `segments` array.
 *
 * @typedef {object} AnalysisSuggestion
 * @property {string} title
 * @property {string} [description]
 * @property {'low'|'medium'|'high'} priority
 * @property {number[]} evidence Transcript segment indexes supporting it.
 *
 * @typedef {object} AnalysisResult
 * @property {string} summary
 * @property {{ topic: string, detail: string, evidence: number[] }[]} keyDiscussions
 * @property {{ decision: string, rationale: string, evidence: number[] }[]} decisions
 * @property {AnalysisSuggestion[]} suggestions
 * @property {string} model
 * @property {string} promptVersion
 */

const PRIORITIES = new Set(['low', 'medium', 'high'])

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0

const createValidationError = (message) => {
  const error = new Error(`Analysis output invalid: ${message}`)
  error.code = 'ANALYSIS_OUTPUT_INVALID'

  return error
}

/**
 * Evidence must point inside the transcript this run was built from. A provider
 * that invents a segment index, or one that carries over from a different
 * meeting, would otherwise produce a citation the reviewer cannot check — the
 * exact failure the "evidence must belong to the transcript" guardrail exists
 * to prevent.
 */
const validateEvidence = (evidence, segmentCount, where) => {
  if (!Array.isArray(evidence)) {
    throw createValidationError(`${where} evidence must be an array`)
  }

  for (const index of evidence) {
    if (!Number.isInteger(index) || index < 0 || index >= segmentCount) {
      throw createValidationError(
        `${where} evidence references segment ${index}, outside 0..${segmentCount - 1}`
      )
    }
  }

  return evidence
}

export const validateAnalysisResult = (result, { segmentCount }) => {
  if (!result || typeof result !== 'object') {
    throw createValidationError('result must be an object')
  }

  if (!isNonEmptyString(result.summary)) {
    throw createValidationError('summary must be a non-empty string')
  }

  if (!isNonEmptyString(result.model) || !isNonEmptyString(result.promptVersion)) {
    throw createValidationError('model and promptVersion are required for provenance')
  }

  for (const field of ['keyDiscussions', 'decisions', 'suggestions']) {
    if (!Array.isArray(result[field])) {
      throw createValidationError(`${field} must be an array`)
    }
  }

  result.keyDiscussions.forEach((item, index) => {
    if (!isNonEmptyString(item?.topic) || !isNonEmptyString(item?.detail)) {
      throw createValidationError(`keyDiscussions[${index}] needs topic and detail`)
    }

    validateEvidence(item.evidence ?? [], segmentCount, `keyDiscussions[${index}]`)
  })

  result.decisions.forEach((item, index) => {
    if (!isNonEmptyString(item?.decision)) {
      throw createValidationError(`decisions[${index}] needs a decision`)
    }

    validateEvidence(item.evidence ?? [], segmentCount, `decisions[${index}]`)
  })

  result.suggestions.forEach((item, index) => {
    if (!isNonEmptyString(item?.title)) {
      throw createValidationError(`suggestions[${index}] needs a title`)
    }

    if (!PRIORITIES.has(item?.priority)) {
      throw createValidationError(`suggestions[${index}] priority must be low, medium, or high`)
    }

    validateEvidence(item.evidence ?? [], segmentCount, `suggestions[${index}]`)
  })

  return result
}
