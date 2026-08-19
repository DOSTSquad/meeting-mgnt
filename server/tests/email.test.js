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
        description: '- Review delivery health\n- Agree next steps',
        responseDeadline: '2026-08-10T06:00:00.000Z',
        timezoneName: 'Australia/Brisbane',
      },
      invitationToken: 'public-token',
    })

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Meeting Management <meetings@example.com>',
        to: 'invitee@example.com',
        subject: 'Meeting invitation: Quarterly review',
        text: expect.stringMatching(
          /Quarterly review[\s\S]*Respond by 10 August 2026 at 4:00 pm \(Australia\/Brisbane\)[\s\S]*https:\/\/meetings\.example\.com\/invitations\/public-token/
        ),
        html: expect.stringMatching(
          /<!DOCTYPE html>[\s\S]*Meeting Management System[\s\S]*Meeting Invitation[\s\S]*Quarterly review[\s\S]*Response Deadline[\s\S]*10 August 2026[\s\S]*4:00 pm[\s\S]*Australia\/Brisbane[\s\S]*<li>Review delivery health<\/li>[\s\S]*Share Your Availability[\s\S]*https:\/\/meetings\.example\.com\/invitations\/public-token/
        ),
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
        html: expect.stringMatching(
          /<!DOCTYPE html>[\s\S]*Meeting Confirmed[\s\S]*Meeting Details[\s\S]*Quarterly review[\s\S]*12 August 2026[\s\S]*10:00 am[\s\S]*Australia\/Brisbane[\s\S]*Room 4\.1[\s\S]*<li>Delivery health<\/li>[\s\S]*View Meeting Details/
        ),
        icalEvent: expect.objectContaining({
          filename: 'meeting.ics',
          method: 'REQUEST',
          content: expect.stringMatching(
            /METHOD:REQUEST[\s\S]*UID:meeting-1@meeting-mgnt[\s\S]*SEQUENCE:0/
          ),
        }),
      })
    )

    const html = sendMail.mock.calls[0][0].html
    const meetingDetailsStart = html.indexOf('Meeting Details')
    const meetingDetailsEnd = html.indexOf('</table>', meetingDetailsStart)
    const agendaStart = html.indexOf('Agenda', meetingDetailsStart)

    expect(meetingDetailsStart).toBeGreaterThan(-1)
    expect(agendaStart).toBeGreaterThan(meetingDetailsStart)
    expect(agendaStart).toBeLessThan(meetingDetailsEnd)
    expect(html).toContain('<strong>Agenda:</strong><br>')
    expect(html).not.toContain('border-top:1px solid #e1e5e9')
  })

  it.each([
    ['created', 'Meeting Created'],
    ['updated', 'Meeting Updated'],
    ['cancelled', 'Meeting Cancelled'],
  ])('renders the branded %s calendar email', async (action, heading) => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: `message-${action}` })
    const emailService = createEmailService({
      transport: { sendMail },
      from: 'Meeting Management <meetings@example.com>',
      clientUrl: 'https://meetings.example.com',
    })

    await emailService.sendMeetingCalendarUpdate({
      recipient: { email: 'invitee@example.com' },
      organizer: { email: 'organizer@example.com', name: 'Olivia Organizer' },
      action,
      meeting: {
        id: 'meeting-2',
        title: '<Planning & Review>',
        description: 'No raw <script>alert(1)</script>',
        startsAt: '2026-08-12T00:00:00.000Z',
        endsAt: '2026-08-12T01:00:00.000Z',
        timezoneName: 'Australia/Brisbane',
        location: null,
        status: action === 'cancelled' ? 'cancelled' : 'scheduled',
        calendarSequence: 1,
      },
    })

    const email = sendMail.mock.calls[0][0]
    expect(email.html).toContain(heading)
    expect(email.html).toContain('&lt;Planning &amp; Review&gt;')
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('To be confirmed')
    expect(email.html).toContain('If the button does not work, open this link:')
    expect(email.text).toContain('Hello,')
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
