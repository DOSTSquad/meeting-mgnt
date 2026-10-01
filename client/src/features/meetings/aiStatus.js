export const AI_STATUS_POLL_INTERVAL_MS = 15000

const AI_STATUS_LABELS = {
  processing: 'Generating minutes…',
  failed: 'Minutes generation failed',
}

export const getAiStatusLabel = (aiStatus) => AI_STATUS_LABELS[aiStatus] ?? null

export const shouldPollAiStatus = ({ isMeetingListShown, meetings }) =>
  isMeetingListShown &&
  Array.isArray(meetings) &&
  meetings.some((meeting) => meeting?.aiStatus === 'processing')
