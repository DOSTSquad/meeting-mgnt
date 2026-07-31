import { useState } from 'react'
import { format, isBefore, startOfToday } from 'date-fns'
import { CalendarDays, X } from 'lucide-react'
import { DayPicker } from 'react-day-picker'

import { formatDateTimeInTimeZone, zonedDateTimeToUtcDate } from '../../../utils/timezone.js'

const formatOptionLabel = (option, timezoneName) =>
  `${formatDateTimeInTimeZone(option.startsAt, timezoneName, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })} - ${formatDateTimeInTimeZone(option.endsAt, timezoneName, { timeStyle: 'short' })}`

const toDateValue = (date) => format(date, 'yyyy-MM-dd')

const formatDuration = (durationMinutes) => {
  const hours = Math.floor(durationMinutes / 60)
  const minutes = durationMinutes % 60

  if (!hours) {
    return `${minutes} min`
  }

  if (!minutes) {
    return `${hours} hr${hours === 1 ? '' : 's'}`
  }

  return `${hours} hr ${minutes} min`
}

const getSlotIso = (dateValue, timeValue, timezoneName) =>
  zonedDateTimeToUtcDate({
    date: dateValue,
    time: timeValue,
    timeZone: timezoneName,
  }).toISOString()

const isActiveMeeting = (meeting) => !['cancelled', 'archived'].includes(meeting.status)

const isPastSlot = (dateValue, timeValue, timezoneName) =>
  zonedDateTimeToUtcDate({ date: dateValue, time: timeValue, timeZone: timezoneName }) < new Date()

const findBlockedMeeting = ({ date, time, durationMinutes, timezoneName, blockedMeetings }) => {
  const startsAt = zonedDateTimeToUtcDate({ date, time, timeZone: timezoneName })
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000)

  return blockedMeetings.find((meeting) => {
    if (!isActiveMeeting(meeting)) {
      return false
    }

    const meetingStartsAt = new Date(meeting.startsAt)
    const meetingEndsAt = new Date(meeting.endsAt)

    return startsAt < meetingEndsAt && endsAt > meetingStartsAt
  })
}

export const AddTimeOptionsStep = ({
  options,
  durationMinutes,
  startTime,
  endTime,
  timezoneName,
  blockedMeetings = [],
  onMeetingTimeChange,
  onAddOption,
  onRemoveOption,
}) => {
  const [pendingDate, setPendingDate] = useState()
  const today = startOfToday()
  const hasValidTimeRange = durationMinutes > 0
  const pendingDateValue = pendingDate ? toDateValue(pendingDate) : ''
  const pendingSlotIso = pendingDateValue
    ? getSlotIso(pendingDateValue, startTime, timezoneName)
    : ''
  const isPendingDateSelected = options.some((option) => option.startsAt === pendingSlotIso)
  const isPendingDatePast = pendingDateValue
    ? isPastSlot(pendingDateValue, startTime, timezoneName)
    : false
  const pendingBlockedMeeting = pendingDateValue
    ? findBlockedMeeting({
        date: pendingDateValue,
        time: startTime,
        durationMinutes,
        timezoneName,
        blockedMeetings,
      })
    : null
  const canChoosePendingDate =
    pendingDate &&
    hasValidTimeRange &&
    !isPendingDateSelected &&
    !isPendingDatePast &&
    !pendingBlockedMeeting

  const chooseDate = (date) => {
    if (!date) {
      return
    }

    const dateValue = toDateValue(date)
    const slotIso = getSlotIso(dateValue, startTime, timezoneName)
    const optionIndex = options.findIndex((option) => option.startsAt === slotIso)

    if (optionIndex >= 0) {
      return
    }

    onAddOption({ date: dateValue, time: startTime })
    setPendingDate(undefined)
  }

  const isDateDisabled = (date) => {
    if (isBefore(date, today) || !hasValidTimeRange) {
      return true
    }

    const dateValue = toDateValue(date)
    const isAlreadySelected = options.some(
      (option) => option.startsAt === getSlotIso(dateValue, startTime, timezoneName)
    )

    if (isAlreadySelected) {
      return false
    }

    return (
      isPastSlot(dateValue, startTime, timezoneName) ||
      Boolean(
        findBlockedMeeting({
          date: dateValue,
          time: startTime,
          durationMinutes,
          timezoneName,
          blockedMeetings,
        })
      )
    )
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="grid gap-5 px-4 py-6 md:grid-cols-[1fr_0.9fr]">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-blue-600" aria-hidden="true" />
              <h4 className="text-sm font-bold text-slate-800">Choose candidate dates</h4>
            </div>
            <DayPicker
              mode="single"
              selected={pendingDate}
              disabled={isDateDisabled}
              onSelect={(selectedDate) => {
                if (selectedDate && !isDateDisabled(selectedDate)) {
                  setPendingDate(selectedDate)
                }
              }}
              classNames={{
                root: 'relative w-full',
                months: 'w-full',
                month: 'w-full',
                month_caption: 'mb-3 flex h-8 items-center justify-center px-16',
                caption_label: 'text-sm font-bold text-slate-800',
                nav: 'absolute right-0 top-0 flex gap-1',
                button_previous:
                  'inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800 aria-disabled:pointer-events-none aria-disabled:opacity-30',
                button_next:
                  'inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800 aria-disabled:pointer-events-none aria-disabled:opacity-30',
                chevron: 'h-4 w-4 fill-current',
                month_grid: 'w-full table-fixed border-collapse',
                weekdays: 'text-xs text-slate-500',
                weekday: 'pb-2 text-center font-semibold',
                week: '',
                day: 'p-0 text-center align-middle',
                day_button:
                  'mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200',
                selected:
                  '[&>button]:bg-blue-600 [&>button]:text-white [&>button:hover]:bg-blue-600 [&>button:hover]:text-white',
                today: 'font-extrabold text-blue-700',
                outside: 'text-slate-300',
                disabled:
                  '[&>button]:cursor-not-allowed [&>button]:text-slate-300 [&>button]:opacity-40 [&>button]:grayscale [&>button:hover]:bg-transparent [&>button:hover]:text-slate-300',
              }}
            />
          </div>

          <div>
            <h4 className="text-sm font-bold text-slate-800">Choose meeting time</h4>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-semibold text-slate-500">Start time</span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => onMeetingTimeChange({ startTime: event.target.value })}
                  className="mt-1 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-500">End time</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(event) => onMeetingTimeChange({ endTime: event.target.value })}
                  className="mt-1 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            </div>
            <p
              className={`mt-2 text-xs font-semibold ${
                hasValidTimeRange ? 'text-slate-500' : 'text-rose-600'
              }`}
            >
              {hasValidTimeRange
                ? `Duration: ${formatDuration(durationMinutes)}`
                : 'End time must be later than start time.'}
            </p>

            <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-700">
              Select a date in the calendar, then confirm it with the button below. Unavailable
              dates are disabled automatically.
            </div>
            <p className="mt-4 text-sm font-bold text-slate-800">
              {pendingDate ? format(pendingDate, 'EEEE, MMMM d, yyyy') : 'No date selected'}
            </p>
            <button
              type="button"
              onClick={() => chooseDate(pendingDate)}
              disabled={!canChoosePendingDate}
              className="mt-2 inline-flex h-12 w-full items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isPendingDateSelected ? 'Date already selected' : 'Choose this date'}
            </button>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-800">Selected options</h4>
          <span className="text-xs font-semibold text-slate-500">{options.length} selected</span>
        </div>
        <div className="mt-3 space-y-2">
          {options.map((option, index) => (
            <div
              key={`${option.startsAt}-${index}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <span className="text-sm font-semibold text-slate-700">
                {formatOptionLabel(option, timezoneName)}
              </span>
              <button
                type="button"
                onClick={() => onRemoveOption(index)}
                aria-label={`Remove ${formatOptionLabel(option, timezoneName)}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          {options.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
              Enter a valid meeting time, then click dates in the calendar to add them.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
