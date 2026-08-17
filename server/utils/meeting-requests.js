export const hasResponseDeadlinePassed = (responseDeadline, now = new Date()) =>
  Boolean(responseDeadline && new Date(responseDeadline).getTime() <= now.getTime())

export const getMeetingRequestDerivedState = (meetingRequest, now = new Date()) => {
  const responseDeadlinePassed = hasResponseDeadlinePassed(meetingRequest.responseDeadline, now)

  return {
    responseDeadlinePassed,
    availabilityClosed: ['confirmed', 'cancelled'].includes(meetingRequest.status)
      ? true
      : responseDeadlinePassed,
    canConfirm: ['collecting_availability', 'ready_to_confirm'].includes(meetingRequest.status),
  }
}

export const decorateMeetingRequest = (meetingRequest, now = new Date()) => {
  if (!meetingRequest) {
    return null
  }

  return {
    ...meetingRequest,
    ...getMeetingRequestDerivedState(meetingRequest, now),
  }
}
