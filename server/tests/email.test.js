import { describe, expect, it, jest } from '@jest/globals'

import { createEmailService } from '../services/email-service.js'

describe('meeting invitation email', () => {
  it('sends the invitee a public response link', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'message-1' })
    const emailService = createEmailService({
      transport: { sendMail },
      from: 'Meeting Management <meetings@example.com>',
      clientUrl: 'https://meetings.example.com',
    })

    await emailService.sendMeetingInvitation({
      invitee: { email: 'invitee@example.com', name: 'Alex Invitee' },
      meetingRequest: {
        title: 'Quarterly review',
        description: 'Review delivery health',
        responseDeadline: '2026-08-10T06:00:00.000Z',
      },
      invitationToken: 'public-token',
    })

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Meeting Management <meetings@example.com>',
        to: 'invitee@example.com',
        subject: 'Meeting invitation: Quarterly review',
        text: expect.stringContaining('https://meetings.example.com/invitations/public-token'),
        html: expect.stringContaining('https://meetings.example.com/invitations/public-token'),
      })
    )
  })

  it('includes a Markdown agenda in the meeting confirmation', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'message-2' })
    const emailService = createEmailService({
      transport: { sendMail },
      from: 'Meeting Management <meetings@example.com>',
      clientUrl: 'https://meetings.example.com',
    })

    await emailService.sendMeetingConfirmation({
      invitee: { email: 'invitee@example.com', name: 'Alex Invitee' },
      organizer: { email: 'organizer@example.com', name: 'Olivia Organizer' },
      meeting: {
        id: 'meeting-1',
        title: 'Quarterly review',
        description: '- Delivery health\n- Next steps',
        startsAt: '2026-08-12T00:00:00.000Z',
        endsAt: '2026-08-12T01:00:00.000Z',
        timezoneName: 'Australia/Brisbane',
        location: 'Room 4.1',
        calendarSequence: 0,
      },
    })

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'invitee@example.com',
        subject: 'Meeting confirmed: Quarterly review',
        text: expect.stringContaining('Agenda\n------\n- Delivery health\n- Next steps'),
        html: expect.stringMatching(/<h2>Agenda<\/h2>[\s\S]*<li>Delivery health<\/li>/),
        icalEvent: expect.objectContaining({
          filename: 'meeting.ics',
          method: 'REQUEST',
          content: expect.stringMatching(
            /METHOD:REQUEST[\s\S]*UID:meeting-1@meeting-mgnt[\s\S]*SEQUENCE:0/
          ),
        }),
      })
    )
  })

  it('sends a calendar cancellation with the stable meeting UID', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'message-3' })
    const emailService = createEmailService({
      transport: { sendMail },
      from: 'Meeting Management <meetings@example.com>',
      clientUrl: 'https://meetings.example.com',
    })

    await emailService.sendMeetingCalendarUpdate({
      recipient: { email: 'invitee@example.com', name: 'Alex Invitee' },
      organizer: { email: 'organizer@example.com', name: 'Olivia Organizer' },
      action: 'cancelled',
      meeting: {
        id: 'meeting-1',
        title: 'Quarterly review',
        description: 'Review delivery health',
        startsAt: '2026-08-12T00:00:00.000Z',
        endsAt: '2026-08-12T01:00:00.000Z',
        timezoneName: 'Australia/Brisbane',
        location: 'Room 4.1',
        status: 'cancelled',
        calendarSequence: 2,
      },
    })

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Meeting cancelled: Quarterly review',
        icalEvent: expect.objectContaining({
          method: 'CANCEL',
          content: expect.stringMatching(
            /METHOD:CANCEL[\s\S]*UID:meeting-1@meeting-mgnt[\s\S]*SEQUENCE:2[\s\S]*STATUS:CANCELLED/
          ),
        }),
      })
    )
  })
})
