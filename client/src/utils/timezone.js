export const MEETING_TIMEZONE_OPTIONS = [
  { value: 'Asia/Manila', label: 'Asia/Manila', description: 'Philippines, UTC+8' },
  {
    value: 'Australia/Brisbane',
    label: 'Australia/Brisbane',
    description: 'Queensland, UTC+10',
  },
]

const getZonedParts = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
  )

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: values.hour === '24' ? 0 : Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

const getTimeZoneOffsetMs = (date, timeZone) => {
  const parts = getZonedParts(date, timeZone)
  const zonedTimeAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  )

  return zonedTimeAsUtc - date.getTime()
}

export const zonedDateTimeToUtcDate = ({ date, time, timeZone }) => {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0))
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone)
  const candidate = new Date(utcGuess.getTime() - offset)
  const adjustedOffset = getTimeZoneOffsetMs(candidate, timeZone)

  return new Date(utcGuess.getTime() - adjustedOffset)
}

export const getDateValueInTimeZone = (value, timeZone) => {
  const parts = getZonedParts(new Date(value), timeZone)
  const month = String(parts.month).padStart(2, '0')
  const day = String(parts.day).padStart(2, '0')

  return `${parts.year}-${month}-${day}`
}

export const formatDateTimeInTimeZone = (value, timeZone, options) =>
  new Intl.DateTimeFormat(undefined, { timeZone, ...options }).format(new Date(value))
