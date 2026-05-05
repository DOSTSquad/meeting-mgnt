import { isOverdueActionItem } from '../../utils/actionItems.js'
import { formatDateOnly } from '../../utils/date.js'

const columnConfig = [
  {
    id: 'todo',
    label: 'To-do',
    headerClass: 'bg-slate-200 text-slate-800',
    countClass: 'bg-slate-100 text-slate-600',
  },
  {
    id: 'in_progress',
    label: 'In Progress',
    headerClass: 'bg-blue-100 text-blue-800',
    countClass: 'bg-white text-blue-700',
  },
  {
    id: 'done',
    label: 'Done',
    headerClass: 'bg-emerald-100 text-emerald-800',
    countClass: 'bg-white text-emerald-700',
  },
]

const priorityClass = {
  high: 'bg-rose-100 text-rose-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-sky-100 text-sky-700',
}

const avatarColors = [
  'bg-amber-500',
  'bg-violet-500',
  'bg-sky-500',
  'bg-teal-500',
  'bg-emerald-500',
]

const getInitials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'NA'

const getDueLabel = (item) => {
  if (item.status === 'completed') {
    return item.completedAt ? `Completed ${formatDateOnly(item.completedAt)}` : 'Completed'
  }

  if (isOverdueActionItem(item)) {
    return 'Due today'
  }

  return item.dueDate ? `Due ${formatDateOnly(item.dueDate)}` : 'No due date'
}

const getFooterStatus = (item) => {
  if (item.status === 'completed') {
    return { label: 'Closed', className: 'bg-emerald-100 text-emerald-700' }
  }

  if (item.status === 'blocked') {
    return { label: 'Blocked', className: 'bg-slate-100 text-slate-700' }
  }

  return {
    label: item.priority || 'medium',
    className: priorityClass[item.priority] || priorityClass.medium,
  }
}

export const ActionItemsView = ({ actionItems, meetings = [], users = [] }) => {
  const grouped = {
    todo: actionItems.filter((item) => item.status === 'todo' || item.status === 'blocked'),
    in_progress: actionItems.filter((item) => item.status === 'in_progress'),
    done: actionItems.filter((item) => item.status === 'completed'),
  }
  const meetingsById = new Map(meetings.map((meeting) => [meeting.id, meeting]))
  const usersById = new Map(users.map((user) => [user.id, user]))
  const openCount = grouped.todo.length + grouped.in_progress.length
  const latestUpdatedAt = actionItems
    .map((item) => item.updatedAt || item.createdAt)
    .filter(Boolean)
    .sort((first, second) => new Date(second).getTime() - new Date(first).getTime())[0]

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">
            Action Items Tracker
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Kanban follow-ups from weekly product meetings
          </p>
        </div>
        <button
          type="button"
          className="rounded-md bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700"
        >
          + New Action Item
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-xs font-bold text-blue-700">
            C
          </span>
          <div>
            <p className="text-sm font-bold text-slate-800">Product weekly sync</p>
            <p className="text-xs font-medium text-slate-500">
              {openCount} open action items
              {latestUpdatedAt ? ` - updated ${formatDateOnly(latestUpdatedAt)}` : ''}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="self-start rounded-md bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100 sm:self-auto"
        >
          Join meeting
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {columnConfig.map((column) => (
          <div key={column.id} className="space-y-3">
            <div
              className={`flex h-10 items-center justify-between rounded-lg px-3 ${column.headerClass}`}
            >
              <h2 className="text-sm font-bold">{column.label}</h2>
              <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${column.countClass}`}>
                {grouped[column.id].length}
              </span>
            </div>
            <div className="space-y-3">
              {grouped[column.id].map((item, index) => {
                const assignee = usersById.get(item.assigneeId)
                const ownerName = assignee?.name || 'Unassigned'
                const meeting = meetingsById.get(item.meetingId)
                const meetingLabel =
                  meeting?.title?.length > 18
                    ? `${meeting.title.slice(0, 18)}...`
                    : meeting?.title || 'Meeting'
                const footerStatus = getFooterStatus(item)
                const isDone = item.status === 'completed'

                return (
                  <article
                    key={item.id}
                    className={`min-h-36 rounded-lg border bg-white p-3.5 shadow-sm ${
                      isDone ? 'border-emerald-100 opacity-95' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex h-full flex-col gap-2.5">
                      <p className="min-h-10 text-sm font-extrabold leading-tight text-slate-900">
                        {item.title}
                      </p>

                      <div className="flex h-6 min-w-0 items-center gap-2">
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-extrabold text-white ${
                            avatarColors[index % avatarColors.length]
                          }`}
                        >
                          {getInitials(ownerName)}
                        </span>
                        {!isDone && assignee ? (
                          <span className="truncate text-xs font-bold text-slate-600">
                            {ownerName}
                          </span>
                        ) : null}
                        <span
                          className={`truncate text-xs font-bold ${
                            isDone
                              ? 'text-emerald-700'
                              : isOverdueActionItem(item)
                                ? 'text-red-600'
                                : 'text-slate-600'
                          }`}
                        >
                          {getDueLabel(item)}
                        </span>
                      </div>

                      <div className="mt-auto flex h-6 items-center justify-between gap-3">
                        <span
                          className={`flex h-6 max-w-[58%] items-center justify-center gap-1 rounded-md px-2 text-[11px] font-bold ${
                            isDone
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-3 w-3 shrink-0"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden="true"
                          >
                            <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
                            <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
                          </svg>
                          <span className="truncate">{meetingLabel}</span>
                        </span>
                        <span
                          className={`flex h-5 shrink-0 items-center rounded-md px-2 text-[11px] font-extrabold capitalize ${footerStatus.className}`}
                        >
                          {footerStatus.label}
                        </span>
                      </div>
                    </div>
                  </article>
                )
              })}
              {grouped[column.id].length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                  No items
                </p>
              ) : null}
              {column.id === 'todo' ? (
                <button
                  type="button"
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-100 text-xs font-bold text-slate-500 transition hover:bg-slate-200"
                >
                  <span>+</span>
                  <span>Add task</span>
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
