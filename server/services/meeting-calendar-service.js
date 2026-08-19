import { listEmailedInviteesByMeetingId } from '../repositories/meeting-request-repository.js'
import { listByMeeting } from '../repositories/participant-repository.js'
import { sendMeetingCalendarUpdate } from './email-service.js'

export const deliverMeetingCalendar = async ({
  meeting,
  action,
  sendCalendar = sendMeetingCalendarUpdate,
}) => {
  const participants = await listByMeeting(meeting.id)
  const emailedInvitees = await listEmailedInviteesByMeetingId(meeting.id)
  const organizer =
    participants.find((participant) => participant.userId === meeting.ownerId) ??
    participants.find((participant) => participant.role === 'organizer')

  if (!organizer) {
    console.error('Meeting calendar delivery skipped: organizer not found', {
      meetingId: meeting.id,
      action,
    })
    return { sentCount: 0, failedCount: 0 }
  }

  const recipientsByEmail = new Map()
  for (const recipient of [...participants, ...emailedInvitees]) {
    const email = recipient.email?.trim().toLowerCase()
    if (email && !recipientsByEmail.has(email)) {
      recipientsByEmail.set(email, recipient)
    }
  }

  const recipients = [...recipientsByEmail.values()]
  const results = await Promise.allSettled(
    recipients.map((recipient) => sendCalendar({ recipient, organizer, meeting, action }))
  )
  const failedCount = results.filter((result) => result.status === 'rejected').length

  if (failedCount > 0) {
    console.error('Meeting calendar email delivery failed', {
      meetingId: meeting.id,
      action,
      failedCount,
    })
  }

  return {
    sentCount: recipients.length - failedCount,
    failedCount,
  }
}
