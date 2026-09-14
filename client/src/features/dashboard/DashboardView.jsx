import { useState } from 'react'
import {
  ArrowRight,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Hourglass,
  LayoutDashboard,
  ListTodo,
} from 'lucide-react'

import { PageHeader } from '../../components/layout/PageHeader.jsx'
import { isOverdueActionItem } from '../../utils/actionItems.js'
import { formatDateTime } from '../../utils/date.js'
import { getMeetingDisplayStatus } from '../../utils/meetingStatus.js'

const startOfWeek = (value) => {
  const date = new Date(value)
  const day = date.getDay()
  const offset = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + offset)
  date.setHours(0, 0, 0, 0)
  return date
}

const getTwoWeekWindow = (value = new Date()) => {
  const start = startOfWeek(value)
  const end = new Date(start)
  end.setDate(start.getDate() + 14)

  return { start, end }
}

const getTwoWeekDailyActivity = (meetings) => {
  const { start: firstDay } = getTwoWeekWindow()

  return Array.from({ length: 14 }, (_, index) => {
    const dayStart = new Date(firstDay)
    dayStart.setDate(firstDay.getDate() + index)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayStart.getDate() + 1)

    return {
      id: dayStart.toISOString(),
      label: dayStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      count: meetings.filter((meeting) => {
        const startsAt = new Date(meeting.startsAt)
        return (
          startsAt >= dayStart &&
          startsAt < dayEnd &&
          getMeetingDisplayStatus(meeting) === 'scheduled'
        )
      }).length,
    }
  })
}

const monthlyMeetingStatuses = [
  {
    id: 'scheduled',
    label: 'Scheduled',
    colorClass: 'bg-blue-500',
    textClass: 'text-white',
  },
  {
    id: 'awaiting_completion',
    label: 'Awaiting completion',
    colorClass: 'bg-amber-400',
    textClass: 'text-amber-950',
  },
  {
    id: 'completed',
    label: 'Completed',
    colorClass: 'bg-emerald-500',
    textClass: 'text-white',
  },
  {
    id: 'cancelled',
    label: 'Cancelled',
    colorClass: 'bg-rose-400',
    textClass: 'text-white',
  },
]

const getMonthlyStatus = (meetings) => {
  const today = new Date()
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const months = Array.from({ length: 13 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() + index - 6, 1)

    return {
      id: `${date.getFullYear()}-${date.getMonth()}`,
      label: date.toLocaleDateString(undefined, { month: 'short' }),
      year: date.getFullYear(),
      isCurrent: date.getTime() === currentMonthStart.getTime(),
      counts: Object.fromEntries(monthlyMeetingStatuses.map((status) => [status.id, 0])),
      total: 0,
    }
  })
  const monthsById = new Map(months.map((month) => [month.id, month]))

  meetings.forEach((meeting) => {
    const startsAt = new Date(meeting.startsAt)
    const displayStatus = getMeetingDisplayStatus(meeting)
    const month = monthsById.get(`${startsAt.getFullYear()}-${startsAt.getMonth()}`)
    if (
      Number.isNaN(startsAt.getTime()) ||
      !month ||
      !monthlyMeetingStatuses.some((status) => status.id === displayStatus)
    ) {
      return
    }

    month.counts[displayStatus] += 1
    month.total += 1
  })

  const firstYear = months[0].year
  const lastYear = months.at(-1).year
  const yearLabel = firstYear === lastYear ? `${firstYear}` : `${firstYear}–${lastYear}`

  return { yearLabel, months }
}

const getDurationByTag = (meetings) => {
  const grouped = new Map()

  meetings.forEach((meeting) => {
    if (
      !meeting.startsAt ||
      !meeting.endsAt ||
      ['cancelled', 'archived'].includes(meeting.status)
    ) {
      return
    }

    const durationMinutes = Math.max(
      0,
      Math.round((new Date(meeting.endsAt) - new Date(meeting.startsAt)) / 60000)
    )
    const tag = meeting.tag?.trim() || 'Untagged'
    const current = grouped.get(tag) || { tag, totalMinutes: 0, count: 0 }
    current.totalMinutes += durationMinutes
    current.count += 1
    grouped.set(tag, current)
  })

  return [...grouped.values()].sort((left, right) => right.totalMinutes - left.totalMinutes)
}

const formatDuration = (minutes) => {
  if (!minutes) return '0m'
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = Math.round(minutes % 60)
  if (!hours) return `${remainingMinutes}m`
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

const getMeetingDurationMinutes = (meeting) => {
  if (!meeting.startsAt || !meeting.endsAt) return null
  const duration = Math.round((new Date(meeting.endsAt) - new Date(meeting.startsAt)) / 60000)
  return Number.isFinite(duration) && duration > 0 ? duration : null
}

const getAverageMeetingDuration = (meetings) => {
  const durations = meetings
    .filter((meeting) => meeting.status === 'completed')
    .map(getMeetingDurationMinutes)
    .filter((duration) => duration !== null)

  if (!durations.length) return 0
  return Math.round(durations.reduce((total, duration) => total + duration, 0) / durations.length)
}

const MeetingsTrendChart = ({ meetings }) => {
  const trend = getTwoWeekDailyActivity(meetings)
  const maxCount = Math.max(1, ...trend.map((item) => item.count))
  const chartHeight = 132
  const chartTop = 18
  const chartBottom = 150
  const chartLeft = 32
  const chartWidth = 852
  const xStep = chartWidth / (trend.length - 1)
  const getPoint = (item, index) => {
    const x = chartLeft + index * xStep
    const y = chartBottom - (item.count / maxCount) * chartHeight
    return { x, y }
  }
  const points = trend.map(getPoint)
  const linePoints = points.map(({ x, y }) => `${x},${y}`).join(' ')
  const areaPoints = `${chartLeft},${chartBottom} ${linePoints} ${chartLeft + chartWidth},${chartBottom}`

  return (
    <div>
      <svg
        viewBox="0 0 900 190"
        className="h-52 w-full"
        role="img"
        aria-label="Meetings per day for this week and next week"
      >
        {[0, 1, 2, 3].map((line) => {
          const y = 18 + (chartHeight / 3) * line
          return <line key={line} x1="24" x2="884" y1={y} y2={y} stroke="#e2e8f0" />
        })}
        <polygon points={areaPoints} fill="#3b82f6" fillOpacity="0.1" />
        <polyline
          points={linePoints}
          fill="none"
          stroke="#2563eb"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {trend.map((item, index) => {
          const { x, y } = points[index]
          return (
            <g key={item.id}>
              <circle cx={x} cy={y} r="5" fill="#fff" stroke="#2563eb" strokeWidth="3" />
              <text
                x={x}
                y={Math.max(chartTop, y - 10)}
                textAnchor="middle"
                fill="#334155"
                fontSize="13"
                fontWeight="700"
              >
                {item.count}
              </text>
              <text x={x} y="177" textAnchor="middle" fill="#64748b" fontSize="10">
                {item.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

const MonthlyStatusChart = ({ meetings }) => {
  const { yearLabel, months } = getMonthlyStatus(meetings)
  const maxCount = Math.max(1, ...months.map((month) => month.total))

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-extrabold text-slate-500">{yearLabel}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {monthlyMeetingStatuses.map((status) => (
            <span
              key={status.id}
              className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600"
            >
              <span className={`h-2.5 w-2.5 rounded-full ${status.colorClass}`} />
              {status.label}
            </span>
          ))}
        </div>
      </div>
      <div
        className="grid h-44 grid-cols-[repeat(13,minmax(0,1fr))] items-end gap-1"
        role="img"
        aria-label={`Monthly meeting status from ${months[0].label} ${months[0].year} to ${months.at(-1).label} ${months.at(-1).year}`}
      >
        {months.map((month) => {
          const activeStatusCount = monthlyMeetingStatuses.filter(
            (status) => month.counts[status.id] > 0
          ).length
          const barHeight = month.total
            ? Math.max(activeStatusCount * 18, (month.total / maxCount) * 112)
            : 4

          return (
            <div
              key={month.id}
              className={`flex h-full min-w-0 flex-col justify-end py-1 text-center ${
                month.isCurrent ? 'rounded-lg bg-blue-50 ring-1 ring-blue-100' : ''
              }`}
            >
              <span className="mb-2 text-xs font-extrabold text-slate-700">{month.total}</span>
              {month.total ? (
                <div
                  className="mx-auto flex w-full max-w-8 flex-col-reverse overflow-hidden rounded-t-md"
                  style={{ height: `${barHeight}px` }}
                >
                  {monthlyMeetingStatuses.map((status) => (
                    <div
                      key={status.id}
                      className={`flex items-center justify-center text-[9px] font-black leading-none ${status.colorClass} ${status.textClass}`}
                      style={{
                        height: `${(month.counts[status.id] / month.total) * 100}%`,
                        minHeight: month.counts[status.id] ? '18px' : 0,
                      }}
                      title={`${month.label} ${status.label}: ${month.counts[status.id]}`}
                    >
                      {month.counts[status.id] || null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mx-auto h-1 w-full max-w-8 rounded-full bg-slate-200" />
              )}
              <span
                className={`mt-2 truncate text-[9px] font-bold ${
                  month.isCurrent ? 'text-blue-700' : 'text-slate-500'
                }`}
              >
                {month.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const ActionItemCompletionChart = ({ actionItems, meetings }) => {
  const [requestedPage, setRequestedPage] = useState(1)
  const rowsPerPage = 5
  const trackedItems = actionItems.filter((item) => item.status !== 'cancelled')
  const completedCount = trackedItems.filter((item) => item.status === 'completed').length
  const completionRate = trackedItems.length
    ? Math.round((completedCount / trackedItems.length) * 100)
    : 0
  const meetingsById = new Map(meetings.map((meeting) => [meeting.id, meeting]))
  const groupedByTag = new Map()

  trackedItems.forEach((item) => {
    const tag = meetingsById.get(item.meetingId)?.tag?.trim() || 'Untagged'
    const group = groupedByTag.get(tag) || { tag, total: 0, completed: 0, overdue: 0 }
    group.total += 1
    group.completed += item.status === 'completed' ? 1 : 0
    group.overdue += isOverdueActionItem(item) ? 1 : 0
    groupedByTag.set(tag, group)
  })

  const tagRows = [...groupedByTag.values()].sort((left, right) =>
    left.tag.localeCompare(right.tag, undefined, { sensitivity: 'base', numeric: true })
  )
  const totalPages = Math.max(1, Math.ceil(tagRows.length / rowsPerPage))
  const currentPage = Math.min(requestedPage, totalPages)
  const visibleTagRows = tagRows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <p className="text-3xl font-extrabold text-slate-900">{completionRate}%</p>
            <p className="text-xs font-bold text-slate-500">
              {completedCount} of {trackedItems.length} completed
            </p>
          </div>
          <p className="text-xs font-bold text-slate-500">Overall completion</p>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${completionRate}%` }}
          />
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
          Progress by meeting tag
        </p>
        <div className="space-y-3">
          {visibleTagRows.map((row) => {
            const rate = row.total ? Math.round((row.completed / row.total) * 100) : 0
            return (
              <div key={row.tag}>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-extrabold text-slate-700">{row.tag}</p>
                    <p className="text-[10px] font-semibold text-slate-500">
                      {row.completed}/{row.total} completed
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-extrabold text-emerald-700">{rate}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${rate}%` }}
                  />
                </div>
              </div>
            )
          })}
          {tagRows.length === 0 ? (
            <p className="text-sm text-slate-500">Action item progress will appear here.</p>
          ) : null}
        </div>
        {totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setRequestedPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Previous
            </button>
            <span className="text-xs font-bold text-slate-500">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setRequestedPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage === totalPages}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

const OverdueActionItemChart = ({ actionItems }) => {
  const overdueItems = actionItems.filter(isOverdueActionItem)
  const priorityRows = [
    { id: 'high', label: 'High priority', colorClass: 'bg-rose-500' },
    { id: 'medium', label: 'Medium priority', colorClass: 'bg-amber-500' },
    { id: 'low', label: 'Low priority', colorClass: 'bg-sky-400' },
  ].map((entry) => ({
    ...entry,
    count: overdueItems.filter((item) => item.priority === entry.id).length,
  }))
  const maxCount = Math.max(1, ...priorityRows.map((row) => row.count))
  const todoCount = overdueItems.filter((item) => item.status === 'todo').length
  const inProgressCount = overdueItems.filter((item) => item.status === 'in_progress').length

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 rounded-xl bg-rose-50 p-3">
        <div>
          <p className="text-3xl font-extrabold text-rose-700">{overdueItems.length}</p>
          <p className="text-xs font-bold text-slate-500">overdue action items</p>
        </div>
        <div className="text-right text-[11px] font-bold text-slate-500">
          <p>{todoCount} to-do</p>
          <p>{inProgressCount} in progress</p>
        </div>
      </div>

      <div className="space-y-4">
        {priorityRows.map((row) => (
          <div key={row.id}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs font-bold">
              <span className="text-slate-600">{row.label}</span>
              <span className="text-slate-900">{row.count}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${row.colorClass}`}
                style={{ width: `${(row.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {overdueItems.length === 0 ? (
        <p className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 p-3 text-sm font-semibold text-emerald-700">
          No overdue action items.
        </p>
      ) : null}
    </div>
  )
}

const DurationByTagChart = ({ meetings }) => {
  const rows = getDurationByTag(meetings)
  const maxMinutes = Math.max(1, ...rows.map((row) => row.totalMinutes))
  const totalMinutes = rows.reduce((total, row) => total + row.totalMinutes, 0)

  return (
    <div>
      <div className="mb-5 rounded-xl bg-violet-50 p-3">
        <p className="text-2xl font-extrabold text-violet-700">{formatDuration(totalMinutes)}</p>
        <p className="text-xs font-bold text-slate-500">total meeting time</p>
      </div>

      <div className="space-y-3">
        {rows.slice(0, 5).map((row) => (
          <div key={row.tag}>
            <div className="mb-1.5 flex items-end justify-between gap-3">
              <p className="truncate text-xs font-extrabold text-slate-700">{row.tag}</p>
              <p className="shrink-0 text-[10px] font-semibold text-slate-500">
                {formatDuration(row.totalMinutes)} total · {row.count} meeting
                {row.count === 1 ? '' : 's'}
              </p>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-violet-500"
                style={{ width: `${(row.totalMinutes / maxMinutes) * 100}%` }}
              />
            </div>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            Meeting duration data will appear here.
          </p>
        ) : null}
      </div>
    </div>
  )
}

const SidebarSection = ({ title, count, icon, children }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex min-w-0 items-center gap-2 text-sm font-extrabold text-slate-800">
        {icon}
        <span className="truncate">{title}</span>
      </h2>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-extrabold text-slate-600">
        {count}
      </span>
    </div>
    <div className="space-y-2">{children}</div>
  </div>
)

export const DashboardView = ({
  data,
  currentUser,
  meetings = [],
  allActionItems = [],
  onOpenCreateModal,
  onOpenMeeting,
  onOpenMeetingRequest,
  onOpenAvailabilityRequest,
  onViewAllMeetings,
}) => {
  const [pendingToConfirmPage, setPendingToConfirmPage] = useState(1)
  const [sentConfirmationIds] = useState(() => {
    if (typeof window === 'undefined') return []
    try {
      return JSON.parse(window.localStorage.getItem('meeting-confirmation-sent') || '[]')
    } catch {
      return []
    }
  })
  const currentTime = new Date()
  const { end: twoWeekEnd } = getTwoWeekWindow(currentTime)
  const upcomingMeetings = meetings
    .filter(
      (meeting) =>
        getMeetingDisplayStatus(meeting, currentTime.getTime()) === 'scheduled' &&
        new Date(meeting.startsAt) >= currentTime &&
        new Date(meeting.startsAt) < twoWeekEnd
    )
    .sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt))
  const awaitingOwnedMeetings = meetings.filter(
    (meeting) =>
      meeting.ownerId === currentUser?.id &&
      getMeetingDisplayStatus(meeting, currentTime.getTime()) === 'awaiting_completion'
  ).length
  const pendingToConfirmRequests = (data?.pendingMeetingRequests ?? [])
    .filter((request) => request.canConfirm)
    .sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: 'base' }))
  const pendingToConfirmMeetings = meetings
    .filter(
      (meeting) =>
        meeting.ownerId !== currentUser?.id &&
        sentConfirmationIds.includes(meeting.id) &&
        new Date(meeting.startsAt).getTime() > currentTime.getTime() &&
        meeting.status !== 'cancelled'
    )
    .map((meeting) => ({ ...meeting, itemType: 'meeting' }))
  const pendingToConfirmItems = [
    ...pendingToConfirmRequests.map((request) => ({ ...request, itemType: 'request' })),
    ...pendingToConfirmMeetings,
  ].sort((left, right) =>
    left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
  )
  const pendingToConfirmPageCount = Math.max(1, Math.ceil(pendingToConfirmItems.length / 5))
  const pendingToConfirmPageItems = pendingToConfirmItems.slice(
    (pendingToConfirmPage - 1) * 5,
    pendingToConfirmPage * 5
  )
  const averageDuration = getAverageMeetingDuration(meetings)
  const dashboardActionItems = data?.myActionItems ?? []
  const chartActionItems = allActionItems.length ? allActionItems : dashboardActionItems
  const trackedActionItems = chartActionItems.filter((item) => item.status !== 'cancelled')
  const completedActionItems = trackedActionItems.filter(
    (item) => item.status === 'completed'
  ).length
  const actionItemCompletionRate = trackedActionItems.length
    ? Math.round((completedActionItems / trackedActionItems.length) * 100)
    : 0

  return (
    <section className="min-w-0 space-y-6">
      <PageHeader
        eyebrow="Workspace overview"
        title="Dashboard"
        description={`Welcome back, ${currentUser?.name || 'there'}. Your meeting performance at a glance.`}
        icon={LayoutDashboard}
        accent="blue"
        action={
          <button
            type="button"
            onClick={onOpenCreateModal}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-extrabold text-white shadow-md shadow-blue-200 transition hover:bg-blue-700 hover:shadow-lg"
          >
            <span className="text-xl leading-none" aria-hidden="true">
              +
            </span>
            New Meeting
          </button>
        }
      />

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60 transition hover:-translate-y-0.5 hover:shadow-md">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
                <CalendarClock className="h-5 w-5 text-violet-600" aria-hidden="true" />
              </span>
              <p className="mt-3 text-3xl font-extrabold text-slate-900">
                {upcomingMeetings.length}
              </p>
              <p className="text-xs font-bold text-slate-500">Upcoming meetings · 2 weeks</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60 transition hover:-translate-y-0.5 hover:shadow-md">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                <ListTodo className="h-5 w-5 text-amber-600" aria-hidden="true" />
              </span>
              <p className="mt-3 text-3xl font-extrabold text-slate-900">
                {actionItemCompletionRate}%
              </p>
              <p className="text-xs font-bold text-slate-500">Action item completion</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60 transition hover:-translate-y-0.5 hover:shadow-md">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50">
                <Hourglass className="h-5 w-5 text-orange-600" aria-hidden="true" />
              </span>
              <p className="mt-3 text-3xl font-extrabold text-slate-900">{awaitingOwnedMeetings}</p>
              <p className="text-xs font-bold text-slate-500">Awaiting your completion</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60 transition hover:-translate-y-0.5 hover:shadow-md">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                <Clock3 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              </span>
              <p className="mt-3 text-3xl font-extrabold text-slate-900">
                {formatDuration(averageDuration)}
              </p>
              <p className="text-xs font-bold text-slate-500">Average meeting duration</p>
            </article>
          </div>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-slate-800">Meetings over 2 weeks</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  This week and next week, including days with no meetings
                </p>
              </div>
            </div>
            <MeetingsTrendChart meetings={meetings} />
          </article>

          <div className="grid gap-5 lg:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-800">Monthly meeting status</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Six months before and after the current month
                  </p>
                </div>
              </div>
              <MonthlyStatusChart meetings={meetings} />
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-800">Meeting duration by tag</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Total time and meeting count for each tag
                  </p>
                </div>
              </div>
              <DurationByTagChart meetings={meetings} />
            </article>
          </div>

          <div>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-emerald-600">
                  Action item progress
                </p>
                <h2 className="mt-1 text-xl font-extrabold text-slate-900">Follow-up health</h2>
              </div>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-extrabold text-slate-800">Completion by meeting tag</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Completed workload across meeting categories
                </p>
                <div className="mt-5">
                  <ActionItemCompletionChart actionItems={chartActionItems} meetings={meetings} />
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-800">Overdue breakdown</h3>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      Outstanding tasks grouped by priority
                    </p>
                  </div>
                </div>
                <div className="mt-5">
                  <OverdueActionItemChart actionItems={chartActionItems} />
                </div>
              </article>
            </div>
          </div>
        </main>

        <aside className="min-w-0 space-y-4">
          <SidebarSection
            title="Upcoming Meetings"
            count={upcomingMeetings.length}
            icon={<CalendarDays className="h-4 w-4 text-blue-600" aria-hidden="true" />}
          >
            {upcomingMeetings.map((meeting) => (
              <button
                key={meeting.id}
                type="button"
                onClick={() => onOpenMeeting(meeting.id)}
                className="block w-full rounded-xl border border-slate-100 bg-slate-50 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50/50"
              >
                <p className="truncate text-sm font-bold text-slate-800">{meeting.title}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {formatDateTime(meeting.startsAt)}
                </p>
              </button>
            ))}
            {upcomingMeetings.length === 0 ? (
              <p className="text-sm text-slate-500">No upcoming meetings.</p>
            ) : null}
            <button
              type="button"
              onClick={onViewAllMeetings}
              className="inline-flex items-center gap-1 pt-1 text-xs font-bold text-blue-700"
            >
              View all meetings <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </SidebarSection>

          <SidebarSection
            title="Availability Requests"
            count={data?.pendingAvailabilityRequests?.length || 0}
            icon={<CalendarCheck className="h-4 w-4 text-violet-600" aria-hidden="true" />}
          >
            {(data?.pendingAvailabilityRequests ?? []).map((request) => (
              <button
                key={`${request.id}-${request.inviteeId}`}
                type="button"
                onClick={() => onOpenAvailabilityRequest(request)}
                className="block w-full rounded-xl border border-violet-100 bg-violet-50/60 p-3 text-left transition hover:border-violet-300"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-bold text-slate-800">
                    {request.title}
                  </p>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold text-violet-700">
                    Vote
                  </span>
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {request.timeOptionCount} options · {request.durationMinutes} min
                </p>
              </button>
            ))}
            {(data?.pendingAvailabilityRequests ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No votes waiting for you.</p>
            ) : null}
          </SidebarSection>

          <SidebarSection
            title="Pending Meetings"
            count={data?.pendingMeetingRequests?.length || 0}
            icon={<Clock3 className="h-4 w-4 text-amber-600" aria-hidden="true" />}
          >
            {(data?.pendingMeetingRequests ?? []).map((request) => (
              <button
                key={request.id}
                type="button"
                onClick={() => onOpenMeetingRequest(request.id)}
                className="block w-full rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-left transition hover:border-amber-300"
              >
                <p className="truncate text-sm font-bold text-slate-800">{request.title}</p>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs font-semibold text-slate-500">
                  <span>
                    {request.inviteeCounts.submitted}/{request.inviteeCounts.total} responses
                  </span>
                  <span className="capitalize text-amber-700">
                    {request.canConfirm ? 'ready' : request.status.replaceAll('_', ' ')}
                  </span>
                </div>
              </button>
            ))}
            {(data?.pendingMeetingRequests ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No pending meeting requests.</p>
            ) : null}
          </SidebarSection>

          <SidebarSection
            title="Pending to review"
            count={pendingToConfirmItems.length}
            icon={<CalendarCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />}
          >
            {pendingToConfirmPageItems.map((request) => (
              <button
                key={`confirm-${request.id}`}
                type="button"
                onClick={() =>
                  request.itemType === 'request'
                    ? onOpenMeetingRequest(request.id)
                    : onOpenMeeting(request.id)
                }
                className="block w-full rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-left transition hover:border-emerald-300"
              >
                <p className="truncate text-sm font-bold text-slate-800">{request.title}</p>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs font-semibold text-slate-500">
                  <span>
                    {request.itemType === 'request'
                      ? `${request.inviteeCounts.submitted}/${request.inviteeCounts.total} responses`
                      : formatDateTime(request.startsAt)}
                  </span>
                  <span className="font-extrabold text-emerald-700">
                    {request.itemType === 'request' ? 'Ready' : 'Not reviewed'}
                  </span>
                </div>
              </button>
            ))}
            {pendingToConfirmItems.length === 0 ? (
              <p className="text-sm text-slate-500">No meetings waiting for review.</p>
            ) : null}
            {pendingToConfirmItems.length > 5 ? (
              <div className="flex items-center justify-between border-t border-emerald-100 pt-2">
                <button
                  type="button"
                  onClick={() => setPendingToConfirmPage((page) => Math.max(1, page - 1))}
                  disabled={pendingToConfirmPage === 1}
                  className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Prev
                </button>
                <span className="text-[10px] font-bold text-slate-500">
                  Page {Math.min(pendingToConfirmPage, pendingToConfirmPageCount)} of {pendingToConfirmPageCount}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPendingToConfirmPage((page) => Math.min(pendingToConfirmPageCount, page + 1))
                  }
                  disabled={pendingToConfirmPage >= pendingToConfirmPageCount}
                  className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </SidebarSection>
        </aside>
      </div>
    </section>
  )
}
