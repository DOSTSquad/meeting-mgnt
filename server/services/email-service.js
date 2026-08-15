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
  },
  created: {
    subject: 'Meeting created',
    message: 'The meeting has been created.',
  },
  updated: {
    subject: 'Meeting updated',
    message: 'The meeting details have been updated.',
  },
  cancelled: {
    subject: 'Meeting cancelled',
    message: 'The meeting has been cancelled.',
  },
}

export const createEmailService = ({ transport, from, clientUrl }) => {
  const sendMeetingCalendarEmail = async ({ recipient, organizer, meeting, action }) => {
    const greeting = recipient.name ? `Hello ${recipient.name},` : 'Hello,'
    const agenda = meeting.description || 'No agenda was provided.'
    const startsAt = new Date(meeting.startsAt).toLocaleString('en-AU', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: meeting.timezoneName,
    })
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
      html: `
        <p>${escapeHtml(greeting)}</p>
        <p>${escapeHtml(copy.message)}</p>
        <p><strong>When:</strong> ${escapeHtml(startsAt)} (${escapeHtml(meeting.timezoneName)})<br>
        <strong>Location:</strong> ${escapeHtml(meeting.location || 'To be confirmed')}</p>
        <h2>Agenda</h2>
        ${markdown.render(agenda)}
        <p><a href="${escapeHtml(meetingUrl)}">View meeting details</a></p>
      `,
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
      const deadline = new Date(meetingRequest.responseDeadline).toLocaleString('en-AU', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'UTC',
      })

      return transport.sendMail({
        from,
        to: invitee.email,
        subject: `Meeting invitation: ${meetingRequest.title}`,
        text: `${greeting}\n\nYou have been invited to share your availability.\n\nAgenda\n------\n${agenda}\n\nRespond by ${deadline} UTC:\n${invitationUrl}`,
        html: `
        <p>${escapeHtml(greeting)}</p>
        <p>You have been invited to share your availability.</p>
        <h2>Agenda</h2>
        ${markdown.render(agenda)}
        <p>Respond by ${escapeHtml(deadline)} UTC.</p>
        <p><a href="${escapeHtml(invitationUrl)}">Share your availability</a></p>
      `,
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
