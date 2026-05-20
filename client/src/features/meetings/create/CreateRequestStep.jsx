import { useState } from 'react'
import { format, isBefore, startOfToday } from 'date-fns'
import { CalendarDays, ChevronDown, Clock3 } from 'lucide-react'
import { DayPicker } from 'react-day-picker'

import { zonedDateTimeToUtcDate } from '../../../utils/timezone.js'

const getDeadlineParts = (value) => {
  if (!value) {
    return { date: '', time: '' }
  }

  const [date = '', time = ''] = value.split('T')

  return {
    date,
    time: time.slice(0, 5),
  }
}

const getDeadlineValue = ({ date, time }) => {
  if (!date && !time) {
    return ''
  }

  return `${date || ''}T${time || ''}`
}

const TIME_WINDOWS = [
  { id: 'morning', label: 'Morning', start: 9 * 60, end: 12 * 60 },
  { id: 'afternoon', label: 'Afternoon', start: 12 * 60, end: 17 * 60 },
  { id: 'evening', label: 'Evening', start: 17 * 60, end: 21 * 60 },
]

const toDateFromValue = (value) => {
  if (!value) {
    return undefined
  }

  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

const toDateValue = (date) => format(date, 'yyyy-MM-dd')

const formatDeadlineLabel = ({ date, time }) => {
  const selectedDate = toDateFromValue(date)
  const selectedTime = timeOptions.find((option) => option.value === time)

  if (selectedDate && selectedTime) {
    return `${format(selectedDate, 'MMM d, yyyy')}, ${selectedTime.label}`
  }

  if (selectedDate) {
    return `${format(selectedDate, 'MMM d, yyyy')}, select time`
  }

  return 'Select deadline'
}

const getTimeOptions = (window = { start: 0, end: 24 * 60 }) => {
  const options = []

  for (let minutes = window.start; minutes < window.end; minutes += 30) {
    const hour = String(Math.floor(minutes / 60)).padStart(2, '0')
    const minute = String(minutes % 60).padStart(2, '0')
    const value = `${hour}:${minute}`
    const label = format(new Date(2026, 0, 1, Math.floor(minutes / 60), minutes % 60), 'h:mm a')
    options.push({ value, label })
  }

  return options
}

const timeOptions = getTimeOptions()

const isPastDateTime = (dateValue, timeValue, timezoneName) =>
  zonedDateTimeToUtcDate({ date: dateValue, time: timeValue, timeZone: timezoneName }) < new Date()

const RequiredLabel = ({ children }) => (
  <span className="inline-flex items-center gap-1 text-sm font-bold text-slate-800">
    {children}
    <span className="text-red-500" aria-hidden="true">
      *
    </span>
  </span>
)

export const CreateRequestStep = ({ form, onChange }) => {
  const [isDeadlineCalendarOpen, setIsDeadlineCalendarOpen] = useState(false)
  const [activeTimeWindowId, setActiveTimeWindowId] = useState(TIME_WINDOWS[1].id)
  const deadline = getDeadlineParts(form.responseDeadline)
  const deadlineDate = toDateFromValue(deadline.date)
  const today = startOfToday()
  const activeTimeWindow =
    TIME_WINDOWS.find((window) => window.id === activeTimeWindowId) ?? TIME_WINDOWS[1]
  const visibleTimeOptions = getTimeOptions(activeTimeWindow)

  return (
    <div className="mx-auto w-full max-w-xl space-y-2">
      <label className="block">
        <RequiredLabel>Meeting Title</RequiredLabel>
        <input
          value={form.title}
          onChange={(event) => onChange({ title: event.target.value })}
          className="mt-2 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          placeholder="Project Sync - Q2 Planning"
        />
      </label>

      <label className="block">
        <span className="text-sm font-bold text-slate-800">Description (optional)</span>
        <textarea
          rows={4}
          value={form.description}
          onChange={(event) => onChange({ description: event.target.value })}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          placeholder="Let's align on Q2 roadmap, timelines and key initiatives."
        />
      </label>

      <label className="block max-w-40">
        <RequiredLabel>Duration</RequiredLabel>
        <div className="relative mt-2">
          <select
            value={form.durationMinutes}
            onChange={(event) => onChange({ durationMinutes: Number(event.target.value) })}
            className="h-12 w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 pr-10 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>60 min</option>
            <option value={90}>90 min</option>
            <option value={120}>120 min</option>
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"
            aria-hidden="true"
          />
        </div>
      </label>

      <label className="block">
        <RequiredLabel>Time Zone</RequiredLabel>
        <input
          value={form.timezoneName}
          onChange={(event) => onChange({ timezoneName: event.target.value })}
          className="mt-2 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
        />
      </label>

      <div>
        <span className="text-sm font-bold text-slate-800">Response Deadline</span>
        <div className="relative mt-2">
          <button
            type="button"
            onClick={() => setIsDeadlineCalendarOpen((prev) => !prev)}
            className="flex h-12 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 text-left text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            <span
              className={
                deadline.date || deadline.time ? 'font-medium text-slate-900' : 'text-slate-400'
              }
            >
              {formatDeadlineLabel(deadline)}
            </span>
            <div className="flex items-center gap-2 text-slate-500">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              <Clock3 className="h-4 w-4" aria-hidden="true" />
            </div>
          </button>
        </div>
      </div>
      {isDeadlineCalendarOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close deadline picker"
            onClick={() => setIsDeadlineCalendarOpen(false)}
          />
          <div className="relative max-h-[86vh] w-full max-w-[30rem] overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="space-y-4">
              <DayPicker
                mode="single"
                selected={deadlineDate}
                disabled={{ before: today }}
                onSelect={(date) => {
                  if (!date || isBefore(date, today)) {
                    return
                  }

                  onChange({
                    responseDeadline: getDeadlineValue({
                      date: toDateValue(date),
                      time: deadline.time,
                    }),
                  })
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
              {deadline.date ? (
                <div className="border-t border-slate-100 pt-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                    Time
                  </p>
                  <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
                    {TIME_WINDOWS.map((window) => (
                      <button
                        key={window.id}
                        type="button"
                        onClick={() => setActiveTimeWindowId(window.id)}
                        className={`rounded-md px-2 py-1.5 text-xs font-bold ${
                          window.id === activeTimeWindowId
                            ? 'bg-white text-blue-700 shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {window.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid max-h-44 gap-2 overflow-auto pr-1 sm:grid-cols-2">
                    {visibleTimeOptions.map((option) => {
                      const isPast = isPastDateTime(deadline.date, option.value, form.timezoneName)

                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={isPast}
                          onClick={() => {
                            onChange({
                              responseDeadline: getDeadlineValue({
                                date: deadline.date,
                                time: option.value,
                              }),
                            })
                            setIsDeadlineCalendarOpen(false)
                          }}
                          className={`h-9 rounded-lg border text-sm font-bold ${
                            isPast
                              ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-50 grayscale'
                              : deadline.time === option.value
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-blue-200 bg-white text-blue-700 hover:border-blue-500 hover:bg-blue-50'
                          }`}
                        >
                          {isPast ? `${option.label} passed` : option.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
                  Select a date to choose a response deadline time.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
