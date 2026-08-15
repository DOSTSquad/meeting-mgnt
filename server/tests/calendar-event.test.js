import { describe, expect, it } from '@jest/globals'

import { createCalendarEvent } from '../services/calendar-event-service.js'

const meeting = {
  id: '4f6bb31d-5512-4d14-a3af-84c97e56de72',
  title: 'Planning, delivery; review',
  description: 'Review milestones\nand risks \\ owners',
  startsAt: '2026-08-20T00:00:00.000Z',
  endsAt: '2026-08-20T01:30:00.000Z',
  location: 'Room 4; North',
  calendarSequence: 2,
}

const organizer = {
  name: 'Paveen Anuntakulnatee',
  email: 'paveen@example.com',
  role: 'organizer',
}

const attendee = {
  name: 'Alex Invitee',
  email: 'alex@example.com',
  role: 'optional',
}

describe('calendar event', () => {
  it('creates an updateable meeting request with escaped content', () => {
    const content = createCalendarEvent({
      meeting,
      organizer,
      attendee,
      method: 'REQUEST',
      now: new Date('2026-08-16T00:00:00.000Z'),
      meetingUrl: 'https://meetings.example.com/meetings/meeting-1',
    })
    const unfolded = content.replaceAll('\r\n ', '')

    expect(content).toContain('METHOD:REQUEST\r\n')
    expect(content).toContain('UID:4f6bb31d-5512-4d14-a3af-84c97e56de72@meeting-mgnt\r\n')
    expect(content).toContain('SEQUENCE:2\r\n')
    expect(content).toContain('DTSTAMP:20260816T000000Z\r\n')
    expect(content).toContain('DTSTART:20260820T000000Z\r\n')
    expect(content).toContain('DTEND:20260820T013000Z\r\n')
    expect(content).toContain('SUMMARY:Planning\\, delivery\\; review\r\n')
    expect(content).toContain('DESCRIPTION:Review milestones\\nand risks \\\\ owners\r\n')
    expect(content).toContain('LOCATION:Room 4\\; North\r\n')
    expect(content).toContain('ORGANIZER;CN="Paveen Anuntakulnatee":mailto:paveen@example.com\r\n')
    expect(unfolded).toContain(
      'ATTENDEE;CN="Alex Invitee";ROLE=OPT-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:alex@example.com\r\n'
    )
    expect(content).toContain('URL:https://meetings.example.com/meetings/meeting-1\r\n')
    expect(content.replaceAll('\r\n', '')).not.toContain('\n')
  })

  it('creates a cancellation with the same UID and current sequence', () => {
    const content = createCalendarEvent({
      meeting: { ...meeting, status: 'cancelled', calendarSequence: 3 },
      organizer,
      attendee,
      method: 'CANCEL',
      now: new Date('2026-08-16T01:00:00.000Z'),
    })

    expect(content).toContain('METHOD:CANCEL\r\n')
    expect(content).toContain('UID:4f6bb31d-5512-4d14-a3af-84c97e56de72@meeting-mgnt\r\n')
    expect(content).toContain('SEQUENCE:3\r\n')
    expect(content).toContain('STATUS:CANCELLED\r\n')
  })

  it('folds long content lines', () => {
    const content = createCalendarEvent({
      meeting: { ...meeting, description: '議程'.repeat(40) },
      organizer,
      attendee,
      method: 'REQUEST',
      now: new Date('2026-08-16T00:00:00.000Z'),
    })

    expect(content).toMatch(/DESCRIPTION:[^\r]+\r\n [^\r]+/)
    for (const line of content.split('\r\n')) {
      expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75)
    }
  })
})
