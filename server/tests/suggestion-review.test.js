import { describe, beforeEach, it, expect, jest } from '@jest/globals'

const findMeetingById = jest.fn()
const listByMeeting = jest.fn()
const findSuggestionById = jest.fn()
const updateProposedSuggestion = jest.fn()
const markSuggestionReviewed = jest.fn()
const insertActionItem = jest.fn()
const notifyActionItemAssigned = jest.fn()

jest.unstable_mockModule('../repositories/meeting-repository.js', () => ({ findMeetingById }))
jest.unstable_mockModule('../repositories/participant-repository.js', () => ({ listByMeeting }))
jest.unstable_mockModule('../repositories/analysis-suggestion-repository.js', () => ({
  findSuggestionById,
  updateProposedSuggestion,
  markSuggestionReviewed,
}))
jest.unstable_mockModule('../repositories/action-item-repository.js', () => ({
  insert: insertActionItem,
}))
jest.unstable_mockModule('../services/notification-service.js', () => ({
  notifyActionItemAssigned,
}))
jest.unstable_mockModule('../db/postgres.js', () => ({
  transaction: async (callback) => callback({ query: jest.fn() }),
  query: jest.fn(),
  closePool: jest.fn(),
}))

const { acceptSuggestion, editSuggestion, rejectSuggestion } =
  await import('../services/suggestion-review-service.js')

const MEETING_ID = '11111111-1111-4111-8111-111111111111'
const SUGGESTION_ID = '22222222-2222-4222-8222-222222222222'
const ANALYSIS_RUN_ID = '33333333-3333-4333-8333-333333333333'
const OWNER_ID = '44444444-4444-4444-8444-444444444444'
const ORGANIZER_ID = '55555555-5555-4555-8555-555555555555'
const PARTICIPANT_ID = '66666666-6666-4666-8666-666666666666'
const OUTSIDER_ID = '77777777-7777-4777-8777-777777777777'
const ACTION_ITEM_ID = '88888888-8888-4888-8888-888888888888'
const ADMIN_ID = '99999999-9999-4999-8999-999999999999'

const proposed = (overrides = {}) => ({
  id: SUGGESTION_ID,
  meetingId: MEETING_ID,
  analysisRunId: ANALYSIS_RUN_ID,
  title: 'Circulate the notes',
  description: 'Share with absentees',
  assigneeId: PARTICIPANT_ID,
  dueDate: null,
  priority: 'high',
  status: 'proposed',
  ...overrides,
})

beforeEach(() => {
  findMeetingById.mockReset().mockResolvedValue({ id: MEETING_ID, ownerId: OWNER_ID })
  listByMeeting.mockReset().mockResolvedValue([
    { userId: ORGANIZER_ID, role: 'organizer' },
    { userId: PARTICIPANT_ID, role: 'attendee' },
  ])
  findSuggestionById.mockReset().mockResolvedValue(proposed())
  updateProposedSuggestion.mockReset().mockImplementation(async (args) => proposed(args))
  markSuggestionReviewed
    .mockReset()
    .mockImplementation(async (args) => proposed({ ...args, id: SUGGESTION_ID }))
  insertActionItem.mockReset().mockImplementation(async (args) => ({ id: ACTION_ITEM_ID, ...args }))
  notifyActionItemAssigned.mockReset().mockResolvedValue(undefined)
})

describe('accepting a suggestion', () => {
  it('creates an action item and links it to the suggestion in one transaction', async () => {
    const result = await acceptSuggestion({
      meetingId: MEETING_ID,
      suggestionId: SUGGESTION_ID,
      callerId: OWNER_ID,
    })

    expect(result.actionItem.id).toBe(ACTION_ITEM_ID)
    expect(markSuggestionReviewed).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'accepted',
        reviewedBy: OWNER_ID,
        acceptedActionItemId: ACTION_ITEM_ID,
      }),
      expect.anything()
    )
  })

  it('sets AI provenance on the server, not from the request', async () => {
    await acceptSuggestion({
      meetingId: MEETING_ID,
      suggestionId: SUGGESTION_ID,
      callerId: OWNER_ID,
    })

    expect(insertActionItem).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'ai', sourceRef: ANALYSIS_RUN_ID }),
      expect.anything()
    )
  })

  it('notifies the assignee only after the transaction commits', async () => {
    const order = []
    markSuggestionReviewed.mockImplementation(async (args) => {
      order.push('commit')
      return proposed(args)
    })
    notifyActionItemAssigned.mockImplementation(async () => {
      order.push('notify')
    })

    await acceptSuggestion({
      meetingId: MEETING_ID,
      suggestionId: SUGGESTION_ID,
      callerId: OWNER_ID,
    })

    expect(order).toEqual(['commit', 'notify'])
  })

  it('keeps the action item when the notification fails', async () => {
    const logger = { error: jest.fn() }
    notifyActionItemAssigned.mockRejectedValue(new Error('mail server down'))

    const result = await acceptSuggestion({
      meetingId: MEETING_ID,
      suggestionId: SUGGESTION_ID,
      callerId: OWNER_ID,
      logger,
    })

    expect(result.actionItem.id).toBe(ACTION_ITEM_ID)
    expect(logger.error).toHaveBeenCalled()
  })

  it('is idempotent: a repeat creates no second task and sends no second notification', async () => {
    findSuggestionById.mockResolvedValue(
      proposed({ status: 'accepted', acceptedActionItemId: ACTION_ITEM_ID })
    )

    const result = await acceptSuggestion({
      meetingId: MEETING_ID,
      suggestionId: SUGGESTION_ID,
      callerId: OWNER_ID,
    })

    expect(result.alreadyReviewed).toBe(true)
    expect(insertActionItem).not.toHaveBeenCalled()
    expect(notifyActionItemAssigned).not.toHaveBeenCalled()
  })

  it('discards the action item when another request wins the race', async () => {
    // The status guard matched nothing, so a concurrent accept got there first.
    markSuggestionReviewed.mockResolvedValue(null)

    await expect(
      acceptSuggestion({ meetingId: MEETING_ID, suggestionId: SUGGESTION_ID, callerId: OWNER_ID })
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(notifyActionItemAssigned).not.toHaveBeenCalled()
  })

  it('refuses an assignee who is no longer a participant', async () => {
    findSuggestionById.mockResolvedValue(proposed({ assigneeId: OUTSIDER_ID }))

    await expect(
      acceptSuggestion({ meetingId: MEETING_ID, suggestionId: SUGGESTION_ID, callerId: OWNER_ID })
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(insertActionItem).not.toHaveBeenCalled()
  })

  it('allows an organizer but refuses a plain participant', async () => {
    await expect(
      acceptSuggestion({
        meetingId: MEETING_ID,
        suggestionId: SUGGESTION_ID,
        callerId: ORGANIZER_ID,
      })
    ).resolves.toBeDefined()

    await expect(
      acceptSuggestion({
        meetingId: MEETING_ID,
        suggestionId: SUGGESTION_ID,
        callerId: PARTICIPANT_ID,
      })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('lets an admin who is not in the meeting review, edit and reject', async () => {
    const admin = { callerId: ADMIN_ID, callerRole: 'admin' }
    const ids = { meetingId: MEETING_ID, suggestionId: SUGGESTION_ID }

    await expect(acceptSuggestion({ ...ids, ...admin })).resolves.toBeDefined()
    await expect(
      editSuggestion({ ...ids, ...admin, input: { title: 'Renamed' } })
    ).resolves.toBeDefined()
    await expect(rejectSuggestion({ ...ids, ...admin })).resolves.toBeDefined()
  })

  it('refuses a staff account outside the meeting', async () => {
    await expect(
      acceptSuggestion({
        meetingId: MEETING_ID,
        suggestionId: SUGGESTION_ID,
        callerId: OUTSIDER_ID,
        callerRole: 'staff',
      })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses a suggestion from another meeting', async () => {
    findSuggestionById.mockResolvedValue(proposed({ meetingId: 'other' }))

    await expect(
      acceptSuggestion({ meetingId: MEETING_ID, suggestionId: SUGGESTION_ID, callerId: OWNER_ID })
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('rejecting a suggestion', () => {
  it('records the reviewer and keeps the suggestion', async () => {
    const result = await rejectSuggestion({
      meetingId: MEETING_ID,
      suggestionId: SUGGESTION_ID,
      callerId: OWNER_ID,
    })

    expect(markSuggestionReviewed).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected', reviewedBy: OWNER_ID })
    )
    expect(result.suggestion).toBeDefined()
  })

  it('creates no action item', async () => {
    await rejectSuggestion({
      meetingId: MEETING_ID,
      suggestionId: SUGGESTION_ID,
      callerId: OWNER_ID,
    })

    expect(insertActionItem).not.toHaveBeenCalled()
    expect(notifyActionItemAssigned).not.toHaveBeenCalled()
  })

  it('is idempotent for an already reviewed suggestion', async () => {
    findSuggestionById.mockResolvedValue(proposed({ status: 'rejected' }))

    const result = await rejectSuggestion({
      meetingId: MEETING_ID,
      suggestionId: SUGGESTION_ID,
      callerId: OWNER_ID,
    })

    expect(result.alreadyReviewed).toBe(true)
    expect(markSuggestionReviewed).not.toHaveBeenCalled()
  })
})

describe('editing a suggestion', () => {
  it('updates a proposed suggestion', async () => {
    await editSuggestion({
      meetingId: MEETING_ID,
      suggestionId: SUGGESTION_ID,
      input: { title: 'Edited title', priority: 'low' },
      callerId: OWNER_ID,
    })

    expect(updateProposedSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Edited title', priority: 'low' })
    )
  })

  it('refuses to edit an accepted suggestion', async () => {
    findSuggestionById.mockResolvedValue(
      proposed({ status: 'accepted', acceptedActionItemId: ACTION_ITEM_ID })
    )

    await expect(
      editSuggestion({
        meetingId: MEETING_ID,
        suggestionId: SUGGESTION_ID,
        input: { title: 'Too late' },
        callerId: OWNER_ID,
      })
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(updateProposedSuggestion).not.toHaveBeenCalled()
  })

  it('refuses to edit a rejected suggestion', async () => {
    findSuggestionById.mockResolvedValue(proposed({ status: 'rejected' }))

    await expect(
      editSuggestion({
        meetingId: MEETING_ID,
        suggestionId: SUGGESTION_ID,
        input: { title: 'Too late' },
        callerId: OWNER_ID,
      })
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('validates a new assignee against the meeting', async () => {
    await expect(
      editSuggestion({
        meetingId: MEETING_ID,
        suggestionId: SUGGESTION_ID,
        input: { assigneeId: OUTSIDER_ID },
        callerId: OWNER_ID,
      })
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('reports a conflict when the suggestion is reviewed mid-edit', async () => {
    updateProposedSuggestion.mockResolvedValue(null)

    await expect(
      editSuggestion({
        meetingId: MEETING_ID,
        suggestionId: SUGGESTION_ID,
        input: { title: 'Edited' },
        callerId: OWNER_ID,
      })
    ).rejects.toMatchObject({ statusCode: 409 })
  })
})
