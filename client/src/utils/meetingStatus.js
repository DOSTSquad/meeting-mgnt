export const getMeetingDisplayStatus = (meeting, currentTime = Date.now()) => {
  if (meeting?.status !== 'scheduled') {
    return meeting?.status || 'scheduled'
  }

  const endsAt = new Date(meeting.endsAt).getTime()
  if (Number.isFinite(endsAt) && endsAt < currentTime) {
    return 'awaiting_completion'
  }

  return 'scheduled'
}

export const formatMeetingStatus = (status) => status.replaceAll('_', ' ')
