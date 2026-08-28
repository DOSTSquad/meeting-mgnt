import { describe, beforeEach, it, expect, jest } from '@jest/globals'

const findMeetingById = jest.fn()
const listByMeeting = jest.fn()
const findAnalysisRunById = jest.fn()
const findMinuteByMeetingId = jest.fn()
const createDraftMinute = jest.fn()
const applyGeneratedMinuteContent = jest.fn()

jest.unstable_mockModule('../repositories/meeting-repository.js', () => ({ findMeetingById }))
jest.unstable_mockModule('../repositories/participant-repository.js', () => ({ listByMeeting }))
jest.unstable_mockModule('../repositories/analysis-run-repository.js', () => ({
  findAnalysisRunById,
}))
jest.unstable_mockModule('../repositories/minute-repository.js', () => ({
  findMinuteByMeetingId,
  createDraftMinute,
  applyGeneratedMinuteContent,
}))

const { applyGeneratedMinutes } = await import('../services/apply-minutes-service.js')

const MEETING_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_MEETING_ID = '99999999-9999-4999-8999-999999999999'
const ANALYSIS_RUN_ID = '22222222-2222-4222-8222-222222222222'
const TRANSCRIPT_ID = '33333333-3333-4333-8333-333333333333'
const OWNER_ID = '44444444-4444-4444-8444-444444444444'
const ORGANIZER_ID = '55555555-5555-4555-8555-555555555555'
const OUTSIDER_ID = '66666666-6666-4666-8666-666666666666'

const readyRun = (overrides = {}) => ({
  id: ANALYSIS_RUN_ID,
  meetingId: MEETING_ID,
  transcriptId: TRANSCRIPT_ID,
  status: 'ready_for_review',
  summary: 'The team reviewed status.',
  keyDiscussions: [
    { topic: 'Status update', detail: 'Everyone reported in.', evidence: [0] },
    { topic: 'Workflow', detail: 'The recording was transcribed.', evidence: [1] },
  ],
  decisions: [{ decision: 'Follow up', rationale: 'Agreed at the end.', evidence: [2] }],
  ...overrides,
})

const draftMinutes = (overrides = {}) => ({
  id: '77777777-7777-4777-8777-777777777777',
  meetingId: MEETING_ID,
  version: 3,
  status: 'draft',
  content: 'Existing content typed by a human',
  ...overrides,
})

const apply = (overrides = {}) =>
  applyGeneratedMinutes({
    meetingId: MEETING_ID,
    analysisRunId: ANALYSIS_RUN_ID,
    expectedVersion: 3,
    callerId: OWNER_ID,
    ...overrides,
  })

beforeEach(() => {
  findMeetingById.mockReset().mockResolvedValue({ id: MEETING_ID, ownerId: OWNER_ID })
  listByMeeting.mockReset().mockResolvedValue([{ userId: ORGANIZER_ID, role: 'organizer' }])
  findAnalysisRunById.mockReset().mockResolvedValue(readyRun())
  findMinuteByMeetingId.mockReset().mockResolvedValue(draftMinutes())
  createDraftMinute.mockReset()
  applyGeneratedMinuteContent
    .mockReset()
    .mockImplementation(async (args) => draftMinutes({ version: args.expectedVersion + 1 }))
})

describe('applying generated minutes', () => {
  it('writes summary, discussions, decisions, and transcript provenance', async () => {
    await apply()

    expect(applyGeneratedMinuteContent).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: 3,
        content: 'The team reviewed status.',
        keyDiscussions:
          'Status update\nEveryone reported in.\n\nWorkflow\nThe recording was transcribed.',
        decisions: 'Follow up\nAgreed at the end.',
        generatedFromTranscriptId: TRANSCRIPT_ID,
      })
    )
  })

  it('leaves the minutes in draft', async () => {
    const result = await apply()

    expect(result.minutes.status).toBe('draft')
    // Nothing in the write touches status, approved_at, or published_at.
    expect(applyGeneratedMinuteContent.mock.calls[0][0]).not.toHaveProperty('status')
  })

  it('does not carry evidence indexes into the minutes', async () => {
    await apply()

    const written = JSON.stringify(applyGeneratedMinuteContent.mock.calls[0][0])

    expect(written).not.toContain('evidence')
    expect(written).not.toContain('segmentIndex')
  })

  it('allows an organizer as well as the owner', async () => {
    await expect(apply({ callerId: ORGANIZER_ID })).resolves.toBeDefined()
  })

  it('refuses a participant who is not an organizer', async () => {
    await expect(apply({ callerId: OUTSIDER_ID })).rejects.toMatchObject({ statusCode: 403 })
    expect(applyGeneratedMinuteContent).not.toHaveBeenCalled()
  })

  it('refuses an unauthenticated caller', async () => {
    await expect(apply({ callerId: undefined })).rejects.toMatchObject({ statusCode: 401 })
  })

  it('refuses an analysis run from another meeting', async () => {
    findAnalysisRunById.mockResolvedValue(readyRun({ meetingId: OTHER_MEETING_ID }))

    await expect(apply()).rejects.toMatchObject({ statusCode: 404 })
    expect(applyGeneratedMinuteContent).not.toHaveBeenCalled()
  })

  it('refuses a run that is not ready for review', async () => {
    findAnalysisRunById.mockResolvedValue(readyRun({ status: 'processing' }))

    await expect(apply()).rejects.toMatchObject({ statusCode: 409 })
    expect(applyGeneratedMinuteContent).not.toHaveBeenCalled()
  })

  it('reports a conflict with the current version instead of overwriting', async () => {
    // Someone edited the minutes between the caller reading version 3 and
    // sending the apply, so the guarded update matches nothing.
    applyGeneratedMinuteContent.mockResolvedValue(null)
    findMinuteByMeetingId.mockResolvedValue(draftMinutes({ version: 5 }))

    await expect(apply()).rejects.toMatchObject({
      statusCode: 409,
      currentVersion: 5,
    })
  })

  it('is not retried automatically after a conflict', async () => {
    applyGeneratedMinuteContent.mockResolvedValue(null)

    await expect(apply()).rejects.toMatchObject({ statusCode: 409 })
    expect(applyGeneratedMinuteContent).toHaveBeenCalledTimes(1)
  })

  it('creates a draft when the meeting has no minutes yet', async () => {
    findMinuteByMeetingId.mockResolvedValue(null)
    createDraftMinute.mockResolvedValue(draftMinutes({ version: 1, content: '' }))

    await apply({ expectedVersion: 1 })

    expect(createDraftMinute).toHaveBeenCalledWith({
      meetingId: MEETING_ID,
      preparedBy: OWNER_ID,
    })
  })

  it('applies the stored result rather than calling the provider again', async () => {
    await apply()

    // The only read of generated content is the analysis run itself.
    expect(findAnalysisRunById).toHaveBeenCalledTimes(1)
    expect(applyGeneratedMinuteContent.mock.calls[0][0].content).toBe('The team reviewed status.')
  })

  it('handles a run with no discussions or decisions', async () => {
    findAnalysisRunById.mockResolvedValue(
      readyRun({ keyDiscussions: [], decisions: [], summary: 'Just a summary.' })
    )

    await apply()

    expect(applyGeneratedMinuteContent).toHaveBeenCalledWith(
      expect.objectContaining({ keyDiscussions: '', decisions: '' })
    )
  })
})
