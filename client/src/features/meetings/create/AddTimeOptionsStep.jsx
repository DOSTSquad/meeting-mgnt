import { useState } from 'react'
import { addMinutes, format, isSameDay } from 'date-fns'
import { CalendarDays, Check, Clock3, Globe2 } from 'lucide-react'
import { DayPicker } from 'react-day-picker'

const SLOT_INTERVAL_MINUTES = 30
const TIME_WINDOWS = [
  { id: 'morning', label: 'Morning', start: 9 * 60, end: 12 * 60 },
  { id: 'afternoon', label: 'Afternoon', start: 12 * 60, end: 17 * 60 },
  { id: 'evening', label: 'Evening', start: 17 * 60, end: 21 * 60 },
]

const formatOptionLabel = (option) =>
  `${new Date(option.startsAt).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })} - ${new Date(option.endsAt).toLocaleTimeString([], { timeStyle: 'short' })}`

const toDateValue = (date) => format(date, 'yyyy-MM-dd')

const toDateFromValue = (value) => {
  if (!value) {
    return undefined
  }

  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

const toTimeValue = (minutes) => {
  const hour = String(Math.floor(minutes / 60)).padStart(2, '0')
  const minute = String(minutes % 60).padStart(2, '0')
  return `${hour}:${minute}`
}

const getTimeSlots = (durationMinutes, window) => {
  const latestStart = window.end - durationMinutes
  const slots = []

  for (let minutes = window.start; minutes <= latestStart; minutes += SLOT_INTERVAL_MINUTES) {
    slots.push({
      value: toTimeValue(minutes),
      label: format(addMinutes(new Date(2026, 0, 1, 0, 0), minutes), 'h:mm a'),
    })
  }

  return slots
}

const getSlotIso = (dateValue, timeValue) => new Date(`${dateValue}T${timeValue}:00`).toISOString()

const isActiveMeeting = (meeting) => !['cancelled', 'archived'].includes(meeting.status)

const findBlockedMeeting = ({ date, time, durationMinutes, blockedMeetings }) => {
  const startsAt = new Date(`${date}T${time}:00`)
  const endsAt = addMinutes(startsAt, durationMinutes)

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
  draft,
  options,
  durationMinutes,
  timezoneName,
  blockedMeetings = [],
  onDraftChange,
  onAddOption,
  onRemoveOption,
}) => {
  const [activeWindowId, setActiveWindowId] = useState(TIME_WINDOWS[0].id)
  const activeWindow = TIME_WINDOWS.find((window) => window.id === activeWindowId) ?? TIME_WINDOWS[0]
  const selectedDate = toDateFromValue(draft.date)
  const slots = getTimeSlots(durationMinutes, activeWindow)
  const selectedDateOptions = selectedDate
    ? options.filter((option) => isSameDay(new Date(option.startsAt), selectedDate))
    : []

  const addSlot = (time) => {
    if (!draft.date) {
      return
    }

    const candidate = { date: draft.date, time }
    onDraftChange(candidate)
    onAddOption(candidate)
  }

  const toggleSlot = (time) => {
    if (!draft.date) {
      return
    }

    const slotIso = getSlotIso(draft.date, time)
    const optionIndex = options.findIndex((option) => option.startsAt === slotIso)

    if (optionIndex >= 0) {
      onRemoveOption(optionIndex)
      onDraftChange({ date: draft.date, time: '' })
      return
    }

    addSlot(time)
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Meeting poll</p>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              {durationMinutes} min
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Globe2 className="h-4 w-4" aria-hidden="true" />
              {timezoneName}
            </span>
          </div>
        </div>

        <div className="grid gap-5 px-4 py-6 md:grid-cols-[1fr_0.9fr]">
          <div>
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-blue-600" aria-hidden="true" />
                <h4 className="text-sm font-bold text-slate-800">Choose candidate dates</h4>
              </div>
              <DayPicker
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) {
                    onDraftChange({ date: toDateValue(date), time: '' })
                  }
                }}
                classNames={{
                  root: 'w-full',
                  months: 'w-full',
                  month: 'w-full',
                  month_caption: 'mb-3 flex items-center justify-center',
                  caption_label: 'text-sm font-bold text-slate-800',
                  nav: 'absolute right-4 top-[104px] flex gap-1',
                  button_previous:
                    'flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100',
                  button_next:
                    'flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100',
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
                  disabled: 'text-slate-300',
                }}
              />
          </div>

          <div>
            <h4 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              {selectedDate ? format(selectedDate, 'EEEE, MMMM d') : 'Select a date'}
            </h4>
            {selectedDate ? (
              <>
                <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
                  {TIME_WINDOWS.map((window) => (
                    <button
                      key={window.id}
                      type="button"
                      onClick={() => setActiveWindowId(window.id)}
                      className={`rounded-md px-2 py-1.5 text-xs font-bold ${
                        window.id === activeWindowId
                          ? 'bg-white text-blue-700 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {window.label}
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid max-h-64 gap-2 overflow-auto pr-1">
                  {slots.map((slot) => {
                    const isSelected = options.some(
                      (option) => option.startsAt === getSlotIso(draft.date, slot.value)
                    )
                    const blockedMeeting = findBlockedMeeting({
                      date: draft.date,
                      time: slot.value,
                      durationMinutes,
                      blockedMeetings,
                    })

                    return (
                      <button
                        key={slot.value}
                        type="button"
                        onClick={() => toggleSlot(slot.value)}
                        disabled={Boolean(blockedMeeting)}
                        aria-pressed={isSelected}
                        title={
                          blockedMeeting
                            ? `Blocked by ${blockedMeeting.title}`
                            : isSelected
                              ? 'Click to remove this time option'
                              : 'Click to add this time option'
                        }
                        className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-bold ${
                          blockedMeeting
                            ? 'border-slate-200 bg-slate-100 text-slate-400'
                            : isSelected
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-blue-200 bg-white text-blue-700 hover:border-blue-500 hover:bg-blue-50'
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {isSelected ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                        {blockedMeeting ? `${slot.label} blocked` : slot.label}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Showing 30-minute candidate starts within the selected time window. Existing
                  meetings are blocked.
                </p>
              </>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-500">
                Select a date to choose candidate start times.
              </div>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-800">Selected options</h4>
          <span className="text-xs font-semibold text-slate-500">
            {selectedDateOptions.length} on selected date
          </span>
        </div>
        <div className="mt-3 space-y-2">
          {options.map((option, index) => (
            <div
              key={`${option.startsAt}-${index}`}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <span className="text-sm font-semibold text-slate-700">{formatOptionLabel(option)}</span>
            </div>
          ))}
          {options.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
              Select a date and add candidate time slots for participants to vote on.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
