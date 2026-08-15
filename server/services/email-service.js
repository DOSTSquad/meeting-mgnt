import MarkdownIt from 'markdown-it'

import { createEmailProvider } from './email-provider.js'

const markdown = new MarkdownIt({ html: false, linkify: true })

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

export const createEmailService = ({ transport, from, clientUrl }) => ({
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
  sendMeetingConfirmation: async ({ invitee, meeting }) => {
    const greeting = invitee.name ? `Hello ${invitee.name},` : 'Hello,'
    const agenda = meeting.description || 'No agenda was provided.'
    const startsAt = new Date(meeting.startsAt).toLocaleString('en-AU', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: meeting.timezoneName,
    })
    const meetingUrl = `${clientUrl.replace(/\/$/, '')}/meetings/${encodeURIComponent(meeting.id)}`

    return transport.sendMail({
      from,
      to: invitee.email,
      subject: `Meeting confirmed: ${meeting.title}`,
      text: `${greeting}\n\nThe meeting has been confirmed.\n\nWhen: ${startsAt} (${meeting.timezoneName})\nLocation: ${meeting.location || 'To be confirmed'}\n\nAgenda\n------\n${agenda}\n\nMeeting details: ${meetingUrl}`,
      html: `
        <p>${escapeHtml(greeting)}</p>
        <p>The meeting has been confirmed.</p>
        <p><strong>When:</strong> ${escapeHtml(startsAt)} (${escapeHtml(meeting.timezoneName)})<br>
        <strong>Location:</strong> ${escapeHtml(meeting.location || 'To be confirmed')}</p>
        <h2>Agenda</h2>
        ${markdown.render(agenda)}
        <p><a href="${escapeHtml(meetingUrl)}">View meeting details</a></p>
      `,
    })
  },
})

const getConfiguredEmailService = () => createEmailService(createEmailProvider())

export const sendMeetingInvitation = async (invitation) => {
  return getConfiguredEmailService().sendMeetingInvitation(invitation)
}

export const sendMeetingConfirmation = async (confirmation) => {
  return getConfiguredEmailService().sendMeetingConfirmation(confirmation)
}
