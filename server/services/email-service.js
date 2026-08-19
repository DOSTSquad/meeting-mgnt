import MarkdownIt from 'markdown-it'

import { createCalendarEvent } from './calendar-event-service.js'
import { createEmailProvider } from './email-provider.js'

const markdown = new MarkdownIt({ html: false, linkify: true })

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

const CALENDAR_EMAIL_COPY = {
  confirmed: {
    subject: 'Meeting confirmed',
    message: 'The meeting has been confirmed.',
    heading: 'Meeting Confirmed',
    description: 'Your meeting has been successfully scheduled. Please review the details below.',
  },
  created: {
    subject: 'Meeting created',
    message: 'The meeting has been created.',
    heading: 'Meeting Created',
    description: 'A new meeting has been created. Please review the details below.',
  },
  updated: {
    subject: 'Meeting updated',
    message: 'The meeting details have been updated.',
    heading: 'Meeting Updated',
    description: 'The meeting details have changed. Please review the latest information below.',
  },
  cancelled: {
    subject: 'Meeting cancelled',
    message: 'The meeting has been cancelled.',
    heading: 'Meeting Cancelled',
    description: 'This meeting has been cancelled. The previous meeting details are shown below.',
  },
}

const formatDate = (value, timeZone) =>
  new Intl.DateTimeFormat('en-AU', { dateStyle: 'long', timeZone }).format(new Date(value))

const formatTime = (value, timeZone) =>
  new Intl.DateTimeFormat('en-AU', { timeStyle: 'short', timeZone }).format(new Date(value))

const renderMeetingEmail = ({
  documentTitle,
  heading,
  description,
  recipientName,
  details,
  agendaHtml,
  ctaLabel,
  ctaUrl,
}) => {
  const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,'
  const detailRows = details
    .map(
      ({ label, value }, index) => `
        <p style="margin:0 0 ${index === details.length - 1 ? '0' : '14px'}; font-size:15px; line-height:1.5;">
          <strong>${escapeHtml(label)}:</strong><br>
          ${escapeHtml(value)}
        </p>`
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(documentTitle)}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif; color:#2d3748;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:#f4f6f8;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <!--[if mso]><table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td><![endif]-->
        <table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:10px; overflow:hidden;">
          <tr>
            <td style="padding:28px 40px; background-color:#1f3a5f; text-align:center;">
              <h2 style="margin:0; color:#ffffff; font-size:22px; font-weight:600; letter-spacing:0.3px;">Meeting Management System</h2>
              <p style="margin:8px 0 0; color:#dbe4ef; font-size:14px;">Official Meeting Notification</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 20px; font-size:16px;">${escapeHtml(greeting)}</p>
              <h1 style="margin:0 0 12px; font-size:28px; line-height:1.3; color:#1f2937;">${escapeHtml(heading)}</h1>
              <p style="margin:0 0 32px; font-size:16px; line-height:1.6; color:#5f6368;">${escapeHtml(description)}</p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:#f8f9fa; border-radius:8px; margin-bottom:28px;">
                <tr>
                  <td style="padding:24px;">
                    <p style="margin:0 0 18px; font-size:14px; font-weight:bold; text-transform:uppercase; color:#777;">Meeting Details</p>
                    ${detailRows}
                    <div style="margin:14px 0 0; font-size:15px; line-height:1.5;">
                      <strong>Agenda:</strong><br>
                      ${agendaHtml}
                    </div>
                  </td>
                </tr>
              </table>
              <table cellpadding="0" cellspacing="0" border="0" role="presentation">
                <tr>
                  <td style="background-color:#2563eb; border-radius:6px; mso-padding-alt:13px 24px;">
                    <a href="${escapeHtml(ctaUrl)}" style="display:inline-block; padding:13px 24px; color:#ffffff; text-decoration:none; font-size:15px; font-weight:bold;">${escapeHtml(ctaLabel)}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0; font-size:12px; line-height:1.5; color:#8a8f98;">
                If the button does not work, open this link:<br>
                <a href="${escapeHtml(ctaUrl)}" style="color:#2563eb; word-break:break-all;">${escapeHtml(ctaUrl)}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px; background-color:#f8f9fa; border-top:1px solid #e8eaed;">
              <p style="margin:0; font-size:12px; line-height:1.5; color:#8a8f98;">This is an automated notification from the Meeting Management System. Please do not reply to this email.</p>
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`
}

export const createEmailService = ({ transport, from, clientUrl }) => {
  const sendMeetingCalendarEmail = async ({ recipient, organizer, meeting, action }) => {
    const greeting = recipient.name ? `Hello ${recipient.name},` : 'Hello,'
    const agenda = meeting.description || 'No agenda was provided.'
    const meetingDate = formatDate(meeting.startsAt, meeting.timezoneName)
    const meetingTime = formatTime(meeting.startsAt, meeting.timezoneName)
    const startsAt = `${meetingDate} at ${meetingTime}`
    const meetingUrl = `${clientUrl.replace(/\/$/, '')}/meetings/${encodeURIComponent(meeting.id)}`
    const copy = CALENDAR_EMAIL_COPY[action]
    const method = action === 'cancelled' ? 'CANCEL' : 'REQUEST'
    const calendarContent = createCalendarEvent({
      meeting,
      organizer,
      attendee: recipient,
      method,
      meetingUrl,
    })

    return transport.sendMail({
      from,
      to: recipient.email,
      subject: `${copy.subject}: ${meeting.title}`,
      text: `${greeting}\n\n${copy.message}\n\nWhen: ${startsAt} (${meeting.timezoneName})\nLocation: ${meeting.location || 'To be confirmed'}\n\nAgenda\n------\n${agenda}\n\nMeeting details: ${meetingUrl}`,
      html: renderMeetingEmail({
        documentTitle: copy.heading,
        heading: copy.heading,
        description: copy.description,
        recipientName: recipient.name,
        details: [
          { label: 'Title', value: meeting.title },
          { label: 'Date', value: meetingDate },
          { label: 'Time', value: `${meetingTime} (${meeting.timezoneName})` },
          { label: 'Location', value: meeting.location || 'To be confirmed' },
        ],
        agendaHtml: markdown.render(agenda),
        ctaLabel: 'View Meeting Details',
        ctaUrl: meetingUrl,
      }),
      icalEvent: {
        filename: 'meeting.ics',
        method,
        content: calendarContent,
      },
    })
  }

  return {
    sendMeetingInvitation: async ({ invitee, meetingRequest, invitationToken }) => {
      const invitationUrl = `${clientUrl.replace(/\/$/, '')}/invitations/${encodeURIComponent(invitationToken)}`
      const greeting = invitee.name ? `Hello ${invitee.name},` : 'Hello,'
      const agenda = meetingRequest.description || 'No agenda was provided.'
      const timeZone = meetingRequest.timezoneName || 'UTC'
      const deadlineDate = formatDate(meetingRequest.responseDeadline, timeZone)
      const deadlineTime = formatTime(meetingRequest.responseDeadline, timeZone)
      const deadline = `${deadlineDate} at ${deadlineTime}`

      return transport.sendMail({
        from,
        to: invitee.email,
        subject: `Meeting invitation: ${meetingRequest.title}`,
        text: `${greeting}\n\nYou have been invited to share your availability.\n\nMeeting: ${meetingRequest.title}\n\nAgenda\n------\n${agenda}\n\nRespond by ${deadline} (${timeZone}):\n${invitationUrl}`,
        html: renderMeetingEmail({
          documentTitle: 'Meeting Invitation',
          heading: 'Meeting Invitation',
          description:
            'You have been invited to share your availability. Please review the details below.',
          recipientName: invitee.name,
          details: [
            { label: 'Title', value: meetingRequest.title },
            { label: 'Response Deadline', value: deadline },
            { label: 'Time Zone', value: timeZone },
          ],
          agendaHtml: markdown.render(agenda),
          ctaLabel: 'Share Your Availability',
          ctaUrl: invitationUrl,
        }),
      })
    },
    sendMeetingConfirmation: ({ invitee, organizer, meeting }) =>
      sendMeetingCalendarEmail({
        recipient: invitee,
        organizer,
        meeting,
        action: 'confirmed',
      }),
    sendMeetingCalendarUpdate: ({ recipient, organizer, meeting, action }) =>
      sendMeetingCalendarEmail({ recipient, organizer, meeting, action }),
  }
}

const getConfiguredEmailService = () => createEmailService(createEmailProvider())

export const sendMeetingInvitation = async (invitation) => {
  return getConfiguredEmailService().sendMeetingInvitation(invitation)
}

export const sendMeetingConfirmation = async (confirmation) => {
  return getConfiguredEmailService().sendMeetingConfirmation(confirmation)
}

export const sendMeetingCalendarUpdate = async (update) => {
  return getConfiguredEmailService().sendMeetingCalendarUpdate(update)
}
