import { AlertTriangle, CalendarClock, Clock3, ListTodo } from 'lucide-react'

import { isOverdueActionItem } from '../../utils/actionItems.js'

const getActionItemBreakdown = (items) => {
  const config = [
    { id: 'todo', label: 'To-do', color: '#94a3b8', dotClass: 'bg-slate-400' },
    { id: 'in_progress', label: 'In progress', color: '#3b82f6', dotClass: 'bg-blue-500' },
  ]

  return config.map((entry) => ({
    ...entry,
    count: items.filter((item) => item.status === entry.id).length,
  }))
}

const getPriorityBreakdown = (items) => {
  const trackedItems = items.filter((item) => ['todo', 'in_progress'].includes(item.status))
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

const ActionItemStatusChart = ({ items }) => {
  const breakdown = getActionItemBreakdown(items)
  const total = breakdown.reduce((sum, item) => sum + item.count, 0)
  const statusRadius = 56
  const statusCircumference = 2 * Math.PI * statusRadius
  const statusSegments = getDonutSegments(breakdown, statusCircumference)

  return (
    <div className="grid items-center gap-8 md:grid-cols-[220px_1fr]">
      <div className="relative mx-auto h-52 w-52">
        <svg
          viewBox="0 0 140 140"
          className="h-full w-full -rotate-90"
          role="img"
          aria-label={`${total} active action items by status`}
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
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-extrabold text-slate-900">{total}</span>
          <span className="text-xs font-bold text-slate-500">active items</span>
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
          Status breakdown
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
      </div>
    </div>
  )
}

const ActionItemPriorityChart = ({ items }) => {
  const breakdown = getPriorityBreakdown(items)
  const maxCount = Math.max(1, ...breakdown.map((item) => item.count))
  const total = breakdown.reduce((sum, item) => sum + item.count, 0)

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-slate-50 p-3">
        <p className="text-3xl font-extrabold text-slate-900">{total}</p>
        <p className="text-xs font-bold text-slate-500">action items with priority</p>
      </div>
      <div className="space-y-5" role="img" aria-label="Action items grouped by priority">
        {breakdown.map((item) => (
          <div key={item.id}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-bold text-slate-600">
                <span className={`h-2.5 w-2.5 rounded-full ${item.dotClass}`} />
                {item.label}
              </span>
              <span className="text-sm font-extrabold text-slate-900">{item.count}</span>
            </div>
            <div className="h-4 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${item.dotClass}`}
                style={{ width: `${(item.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export const ActionItemsSummary = ({ actionItems }) => {
  const trackedItems = actionItems.filter((item) => ['todo', 'in_progress'].includes(item.status))
  const inProgressCount = trackedItems.filter((item) => item.status === 'in_progress').length
  const overdueCount = trackedItems.filter(isOverdueActionItem).length
  const dueSoonCount = getDueSoonCount(trackedItems)

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <ListTodo className="h-5 w-5 text-slate-600" aria-hidden="true" />
          <p className="mt-3 text-3xl font-extrabold text-slate-900">{trackedItems.length}</p>
          <p className="text-xs font-bold text-slate-500">Active action items</p>
        </article>
        <article className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
          <Clock3 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          <p className="mt-3 text-3xl font-extrabold text-slate-900">{inProgressCount}</p>
          <p className="text-xs font-bold text-slate-500">In progress action items</p>
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

      <div className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-slate-800">Active status breakdown</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                To-do and in-progress work
              </p>
            </div>
            <Clock3 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          </div>
          <ActionItemStatusChart items={trackedItems} />
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-slate-800">Priority breakdown</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                High, medium, and low priority workload
              </p>
            </div>
            <ListTodo className="h-5 w-5 text-blue-600" aria-hidden="true" />
          </div>
          <ActionItemPriorityChart items={trackedItems} />
        </article>
      </div>
    </div>
  )
}
