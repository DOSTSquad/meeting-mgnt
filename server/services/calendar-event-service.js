const formatCalendarDate = (value) =>
  new Date(value)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')

const escapeText = (value) =>
  String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll(/\r?\n/g, '\\n')
    .replaceAll(',', '\\,')
    .replaceAll(';', '\\;')

const escapeParameter = (value) =>
  String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')

const foldLine = (line) => {
  const folded = []
  let current = ''

  for (const character of line) {
    const prefix = folded.length > 0 ? ' ' : ''
    if (Buffer.byteLength(`${prefix}${current}${character}`) > 75) {
      folded.push(`${prefix}${current}`)
      current = character
    } else {
      current += character
    }
  }

  folded.push(`${folded.length > 0 ? ' ' : ''}${current}`)
  return folded
}

const attendeeRole = (role) => (role === 'optional' ? 'OPT-PARTICIPANT' : 'REQ-PARTICIPANT')

export const createCalendarEvent = ({
  meeting,
  organizer,
  attendee,
  method = 'REQUEST',
  now = new Date(),
  meetingUrl,
}) => {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DOST//Meeting Management//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${meeting.id}@meeting-mgnt`,
    `SEQUENCE:${meeting.calendarSequence ?? 0}`,
    `DTSTAMP:${formatCalendarDate(now)}`,
    `DTSTART:${formatCalendarDate(meeting.startsAt)}`,
    `DTEND:${formatCalendarDate(meeting.endsAt)}`,
    `SUMMARY:${escapeText(meeting.title)}`,
  ]

  if (meeting.description) {
    lines.push(`DESCRIPTION:${escapeText(meeting.description)}`)
  }

  if (meeting.location) {
    lines.push(`LOCATION:${escapeText(meeting.location)}`)
  }

  if (organizer?.email) {
    lines.push(
      `ORGANIZER;CN="${escapeParameter(organizer.name || organizer.email)}":mailto:${organizer.email}`
    )
  }

  if (attendee?.email) {
    lines.push(
      `ATTENDEE;CN="${escapeParameter(attendee.name || attendee.email)}";ROLE=${attendeeRole(attendee.role)};PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendee.email}`
    )
  }

  if (meetingUrl) {
    lines.push(`URL:${meetingUrl}`)
  }

  lines.push('TRANSP:OPAQUE')
  if (method === 'CANCEL') {
    lines.push('STATUS:CANCELLED')
  }
  lines.push('END:VEVENT', 'END:VCALENDAR')

  return `${lines.flatMap(foldLine).join('\r\n')}\r\n`
}
