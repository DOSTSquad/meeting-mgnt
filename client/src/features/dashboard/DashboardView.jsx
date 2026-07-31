import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LayoutDashboard,
  ListTodo,
  TrendingUp,
} from 'lucide-react'

import { PageHeader } from '../../components/layout/PageHeader.jsx'
import { isOverdueActionItem } from '../../utils/actionItems.js'
import { formatDateTime } from '../../utils/date.js'

const startOfWeek = (value) => {
  const date = new Date(value)
  const day = date.getDay()
  const offset = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + offset)
  date.setHours(0, 0, 0, 0)
  return date
}

const getMeetingTrend = (meetings) => {
  const currentWeek = startOfWeek(new Date())

  return Array.from({ length: 6 }, (_, index) => {
    const weekStart = new Date(currentWeek)
    weekStart.setDate(currentWeek.getDate() - (5 - index) * 7)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)

    return {
      label: weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      count: meetings.filter((meeting) => {
        const startsAt = new Date(meeting.startsAt)
        return (
          startsAt >= weekStart &&
          startsAt < weekEnd &&
          !['cancelled', 'archived'].includes(meeting.status)
        )
      }).length,
    }
  })
}

const getActionItemBreakdown = (items) => {
  const config = [
    { id: 'todo', label: 'To-do', color: '#94a3b8', dotClass: 'bg-slate-400' },
    { id: 'in_progress', label: 'In progress', color: '#3b82f6', dotClass: 'bg-blue-500' },
    { id: 'completed', label: 'Completed', color: '#10b981', dotClass: 'bg-emerald-500' },
  ]

  return config.map((entry) => ({
    ...entry,
    count: items.filter((item) => item.status === entry.id).length,
  }))
}

const getPriorityBreakdown = (items) => {
  const trackedItems = items.filter((item) =>
    ['todo', 'in_progress', 'completed'].includes(item.status)
  )
  const config = [
    { id: 'high', label: 'High', color: '#f43f5e', dotClass: 'bg-rose-500' },
    { id: 'medium', label: 'Medium', color: '#f59e0b', dotClass: 'bg-amber-500' },
    { id: 'low', label: 'Low', color: '#38bdf8', dotClass: 'bg-sky-400' },
  ]

  return config.map((entry) => ({
    ...entry,
    count: trackedItems.filter((item) => item.priority === entry.id).length,
  }))
}

const getDonutSegments = (breakdown, circumference) => {
  const total = breakdown.reduce((sum, item) => sum + item.count, 0)

  return breakdown.map((item, index) => {
    const previousCount = breakdown
      .slice(0, index)
      .reduce((sum, previousItem) => sum + previousItem.count, 0)

    return {
      ...item,
      segmentLength: total ? (item.count / total) * circumference : 0,
      dashOffset: total ? -(previousCount / total) * circumference : 0,
    }
  })
}

const getDueSoonCount = (items) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const sevenDaysFromToday = new Date(today)
  sevenDaysFromToday.setDate(today.getDate() + 7)
  sevenDaysFromToday.setHours(23, 59, 59, 999)

  return items.filter((item) => {
    if (!item.dueDate || !['todo', 'in_progress'].includes(item.status)) return false
    const dueDate = new Date(item.dueDate)
    return dueDate >= today && dueDate <= sevenDaysFromToday
  }).length
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

const MeetingsTrendChart = ({ meetings }) => {
  const trend = getMeetingTrend(meetings)
  const maxCount = Math.max(1, ...trend.map((item) => item.count))
  const chartHeight = 132

  return (
    <div>
      <svg
        viewBox="0 0 600 190"
        className="h-52 w-full"
        role="img"
        aria-label="Meetings per week over the last six weeks"
      >
        {[0, 1, 2, 3].map((line) => {
          const y = 18 + (chartHeight / 3) * line
          return <line key={line} x1="28" x2="580" y1={y} y2={y} stroke="#e2e8f0" />
        })}
        {trend.map((item, index) => {
          const barHeight = (item.count / maxCount) * 112
          const x = 48 + index * 88
          const y = 150 - barHeight

          return (
            <g key={item.label}>
              <rect x={x} y={y} width="50" height={barHeight} rx="8" fill="#3b82f6" />
              <text
                x={x + 25}
                y={Math.max(18, y - 8)}
                textAnchor="middle"
                fill="#334155"
                fontSize="13"
                fontWeight="700"
              >
                {item.count}
              </text>
              <text x={x + 25} y="177" textAnchor="middle" fill="#64748b" fontSize="12">
                {item.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

const ActionItemHealthChart = ({ items }) => {
  const breakdown = getActionItemBreakdown(items)
  const priorityBreakdown = getPriorityBreakdown(items)
  const total = breakdown.reduce((sum, item) => sum + item.count, 0)
  const completed = breakdown.find((item) => item.id === 'completed')?.count || 0
  const completionRate = total ? Math.round((completed / total) * 100) : 0
  const statusRadius = 56
  const priorityRadius = 40
  const statusCircumference = 2 * Math.PI * statusRadius
  const priorityCircumference = 2 * Math.PI * priorityRadius
  const statusSegments = getDonutSegments(breakdown, statusCircumference)
  const prioritySegments = getDonutSegments(priorityBreakdown, priorityCircumference)

  return (
    <div className="grid items-center gap-5 sm:grid-cols-[180px_1fr]">
      <div className="relative mx-auto h-44 w-44">
        <svg
          viewBox="0 0 140 140"
          className="h-full w-full -rotate-90"
          role="img"
          aria-label={`${completionRate}% action item completion rate, with status on the outer ring and priority on the inner ring`}
        >
          <circle cx="70" cy="70" r={statusRadius} fill="none" stroke="#e2e8f0" strokeWidth="12" />
          {statusSegments.map((item) => (
            <circle
              key={item.id}
              cx="70"
              cy="70"
              r={statusRadius}
              fill="none"
              stroke={item.color}
              strokeWidth="12"
              strokeDasharray={`${item.segmentLength} ${statusCircumference - item.segmentLength}`}
              strokeDashoffset={item.dashOffset}
            />
          ))}
          <circle cx="70" cy="70" r={priorityRadius} fill="none" stroke="#f1f5f9" strokeWidth="8" />
          {prioritySegments.map((item) => (
            <circle
              key={item.id}
              cx="70"
              cy="70"
              r={priorityRadius}
              fill="none"
              stroke={item.color}
              strokeWidth="8"
              strokeDasharray={`${item.segmentLength} ${priorityCircumference - item.segmentLength}`}
              strokeDashoffset={item.dashOffset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-extrabold text-slate-900">{completionRate}%</span>
          <span className="text-xs font-bold text-slate-500">completed</span>
        </div>
      </div>
      <div className="space-y-3">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
          Status · outer ring
        </p>
        {breakdown.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-600">
              <span className={`h-2.5 w-2.5 rounded-full ${item.dotClass}`} />
              {item.label}
            </span>
            <span className="text-sm font-extrabold text-slate-900">{item.count}</span>
          </div>
        ))}
        <div className="border-t border-slate-100 pt-3">
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
            Priority · inner ring
          </p>
          <div className="flex flex-wrap gap-2">
            {priorityBreakdown.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600"
              >
                <span className={`h-2 w-2 rounded-full ${item.dotClass}`} />
                {item.label} {item.count}
              </span>
            ))}
          </div>
        </div>
      </div>
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
  onViewAllActionItems,
}) => {
  const dashboardActionItems = data?.myActionItems ?? []
  const chartActionItems = allActionItems.length ? allActionItems : dashboardActionItems
  const overdueCount = chartActionItems.filter(isOverdueActionItem).length
  const dueSoonCount = getDueSoonCount(chartActionItems)
  const completionCount = chartActionItems.filter((item) => item.status === 'completed').length
  const completionRate = chartActionItems.length
    ? Math.round((completionCount / chartActionItems.length) * 100)
    : 0

  return (
    <section className="min-w-0 space-y-6">
      <PageHeader
        eyebrow="Workspace overview"
        title="Dashboard"
        description={`Welcome back, ${currentUser?.name || 'there'}. Your meeting performance at a glance.`}
        icon={LayoutDashboard}
        accent="blue"
      />

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
              <CalendarDays className="h-5 w-5 text-blue-600" aria-hidden="true" />
              <p className="mt-3 text-3xl font-extrabold text-slate-900">{meetings.length}</p>
              <p className="text-xs font-bold text-slate-500">Accessible meetings</p>
            </article>
            <article className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              <p className="mt-3 text-3xl font-extrabold text-slate-900">{completionRate}%</p>
              <p className="text-xs font-bold text-slate-500">Action items completed</p>
            </article>
            <article className="rounded-2xl border border-rose-100 bg-rose-50/70 p-4">
              <AlertTriangle className="h-5 w-5 text-rose-600" aria-hidden="true" />
              <p className="mt-3 text-3xl font-extrabold text-slate-900">{overdueCount}</p>
              <p className="text-xs font-bold text-slate-500">Overdue action items</p>
            </article>
            <article className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
              <CalendarClock className="h-5 w-5 text-amber-600" aria-hidden="true" />
              <p className="mt-3 text-3xl font-extrabold text-slate-900">{dueSoonCount}</p>
              <p className="text-xs font-bold text-slate-500">Due in the next 7 days</p>
            </article>
          </div>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-slate-800">Meetings per week</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Six-week meeting cadence
                </p>
              </div>
              <TrendingUp className="h-5 w-5 text-blue-600" aria-hidden="true" />
            </div>
            <MeetingsTrendChart meetings={meetings} />
          </article>

          <div className="grid gap-5 lg:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-800">Action item health</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Workload by current status
                  </p>
                </div>
                <ListTodo className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              </div>
              <ActionItemHealthChart items={chartActionItems} />
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-800">Meeting duration by tag</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Total time and meeting count for each tag
                  </p>
                </div>
                <Clock3 className="h-5 w-5 text-violet-600" aria-hidden="true" />
              </div>
              <DurationByTagChart meetings={meetings} />
            </article>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onViewAllActionItems}
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-700"
            >
              Open Action Item Tracker <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </main>

        <aside className="min-w-0 space-y-4">
          <SidebarSection
            title="Upcoming Meetings"
            count={data?.recentMeetings?.length || 0}
            icon={<CalendarDays className="h-4 w-4 text-blue-600" aria-hidden="true" />}
          >
            {(data?.recentMeetings ?? []).map((meeting) => (
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
            {(data?.recentMeetings ?? []).length === 0 ? (
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

          <button
            type="button"
            onClick={onOpenCreateModal}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-700"
          >
            <span className="text-lg leading-none" aria-hidden="true">
              +
            </span>
            New Meeting
          </button>
        </aside>
      </div>
    </section>
  )
}
