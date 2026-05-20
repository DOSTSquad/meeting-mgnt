import { describe, expect, it } from '@jest/globals'

import { getMeetingRequestDerivedState } from '../utils/meeting-requests.js'

const NOW = new Date('2026-05-20T04:00:00.000Z')

describe('meeting request derived state', () => {
  it('keeps availability open before the response deadline', () => {
    expect(
      getMeetingRequestDerivedState(
        {
          status: 'collecting_availability',
          responseDeadline: '2026-05-20T05:00:00.000Z',
        },
        NOW
      )
    ).toEqual({
      responseDeadlinePassed: false,
      availabilityClosed: false,
      canConfirm: false,
    })
  })

  it('closes availability and allows confirmation after the response deadline', () => {
    expect(
      getMeetingRequestDerivedState(
        {
          status: 'collecting_availability',
          responseDeadline: '2026-05-20T03:59:59.000Z',
        },
        NOW
      )
    ).toEqual({
      responseDeadlinePassed: true,
      availabilityClosed: true,
      canConfirm: true,
    })
  })

  it('allows confirmation when all responses are already in', () => {
    expect(
      getMeetingRequestDerivedState(
        {
          status: 'ready_to_confirm',
          responseDeadline: '2026-05-20T05:00:00.000Z',
        },
        NOW
      )
    ).toMatchObject({
      responseDeadlinePassed: false,
      availabilityClosed: false,
      canConfirm: true,
    })
  })
})
