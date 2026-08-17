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

const MeetingStatusOverview = ({ meetings, pendingRequestCount }) => {
  const statusRows = [
    { id: 'scheduled', label: 'Scheduled', colorClass: 'bg-blue-500' },
    { id: 'completed', label: 'Completed', colorClass: 'bg-emerald-500' },
    { id: 'cancelled', label: 'Cancelled', colorClass: 'bg-rose-400' },
    { id: 'archived', label: 'Archived', colorClass: 'bg-slate-400' },
  ].map((entry) => ({
    ...entry,
    count: meetings.filter((meeting) => meeting.status === entry.id).length,
  }))
  const maxCount = Math.max(1, ...statusRows.map((row) => row.count))

  return (
    <div className="space-y-4">
      {statusRows.map((row) => (
        <div key={row.id}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs font-bold">
            <span className="text-slate-600">{row.label}</span>
            <span className="text-slate-900">{row.count}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${row.colorClass}`}
              style={{ width: `${(row.count / maxCount) * 100}%` }}
            />
          </div>
        </div>
      ))}
      <div className="rounded-xl bg-amber-50 px-3 py-2.5">
        <p className="text-xl font-extrabold text-amber-700">{pendingRequestCount}</p>
        <p className="text-xs font-bold text-slate-500">pending scheduling requests</p>
      </div>
    </div>
  )
}

const ActionItemCompletionChart = ({ actionItems, meetings }) => {
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

  const tagRows = [...groupedByTag.values()]
    .sort((left, right) => right.total - left.total)
    .slice(0, 5)

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
          {tagRows.map((row) => {
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
  const completedMeetings = meetings.filter((meeting) => meeting.status === 'completed').length
  const upcomingMeetings = meetings.filter(
    (meeting) => meeting.status === 'scheduled' && new Date(meeting.startsAt) >= new Date()
  ).length
  const averageDuration = getAverageMeetingDuration(meetings)
  const pendingMeetingRequests = data?.pendingMeetingRequests?.length || 0
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
      />

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
              <CheckCircle2 className="h-5 w-5 text-blue-600" aria-hidden="true" />
              <p className="mt-3 text-3xl font-extrabold text-slate-900">{completedMeetings}</p>
              <p className="text-xs font-bold text-slate-500">Total meetings held</p>
            </article>
            <article className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
              <Clock3 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              <p className="mt-3 text-3xl font-extrabold text-slate-900">
                {formatDuration(averageDuration)}
              </p>
              <p className="text-xs font-bold text-slate-500">Average meeting duration</p>
            </article>
            <article className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
              <CalendarClock className="h-5 w-5 text-violet-600" aria-hidden="true" />
              <p className="mt-3 text-3xl font-extrabold text-slate-900">{upcomingMeetings}</p>
              <p className="text-xs font-bold text-slate-500">Upcoming meetings</p>
            </article>
            <article className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
              <ListTodo className="h-5 w-5 text-amber-600" aria-hidden="true" />
              <p className="mt-3 text-3xl font-extrabold text-slate-900">
                {actionItemCompletionRate}%
              </p>
              <p className="text-xs font-bold text-slate-500">Action item completion</p>
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
                  <h2 className="text-lg font-extrabold text-slate-800">Meeting status</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Scheduled, completed, cancelled, and archived
                  </p>
                </div>
                <CalendarCheck className="h-5 w-5 text-blue-600" aria-hidden="true" />
              </div>
              <MeetingStatusOverview
                meetings={meetings}
                pendingRequestCount={pendingMeetingRequests}
              />
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

          <div>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-emerald-600">
                  Action item progress
                </p>
                <h2 className="mt-1 text-xl font-extrabold text-slate-900">Follow-up health</h2>
              </div>
              <ListTodo className="h-5 w-5 text-emerald-600" aria-hidden="true" />
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
                  <AlertTriangle className="h-5 w-5 text-rose-500" aria-hidden="true" />
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
