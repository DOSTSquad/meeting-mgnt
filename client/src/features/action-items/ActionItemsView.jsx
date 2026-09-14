import { useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  Flag,
  List,
  ListChecks,
  PieChart,
  Tag,
  User,
  X,
} from 'lucide-react'

import { PageHeader } from '../../components/layout/PageHeader.jsx'
import { isOverdueActionItem } from '../../utils/actionItems.js'
import { formatDateOnly } from '../../utils/date.js'
import { ActionItemsSummary } from './ActionItemsSummary.jsx'

const priorityClass = {
  high: 'bg-rose-100 text-rose-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-sky-100 text-sky-700',
}

const toDisplayString = (value) => (value == null ? '' : String(value))

const toTitleCase = (value = '') =>
  toDisplayString(value)
    .split(' ')
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(' ')

const getDueLabel = (item) => {
  if (item.status === 'completed') {
    return item.completedAt ? `Completed ${formatDateOnly(item.completedAt)}` : 'Completed'
  }

  if (isOverdueActionItem(item)) {
    return `Overdue · Due ${formatDateOnly(item.dueDate)}`
  }

  return item.dueDate ? `Due ${formatDateOnly(item.dueDate)}` : 'No due date'
}

const getFooterStatus = (item) => {
  if (item.status === 'completed') {
    return { label: 'Closed', className: 'bg-emerald-100 text-emerald-700' }
  }

  if (isOverdueActionItem(item)) {
    return { label: 'Overdue', className: 'bg-rose-100 text-rose-700' }
  }

  return {
    label: item.priority || 'medium',
    className: priorityClass[item.priority] || priorityClass.medium,
  }
}

const statusLabel = {
  todo: 'To-do',
  in_progress: 'In Progress',
  completed: 'Done',
  cancelled: 'Cancelled',
}

const statusClass = {
  todo: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-rose-100 text-rose-700',
}

const initialListFilters = {
  title: '',
  dueDate: '',
  priority: '',
  status: '',
  meeting: '',
}

const listFilterClass =
  'h-9 w-full min-w-28 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

const SortableHeader = ({ column, label, sortConfig, onSort }) => {
  const isActive = sortConfig.column === column
  const ariaSort = isActive ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'

  return (
    <th className="px-4 py-3" aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide transition ${
          isActive ? 'text-blue-700' : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        {label}
        {isActive ? (
          sortConfig.direction === 'asc' ? (
            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
    </th>
  )
}

const DetailField = ({ icon, label, value, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className={`flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left ${
      onClick ? 'transition hover:border-blue-200 hover:bg-blue-50' : ''
    }`}
  >
    {icon}
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase text-slate-400">{label}</p>
      <p
        className={`mt-0.5 truncate text-sm font-bold ${onClick ? 'text-blue-700' : 'text-slate-700'}`}
      >
        {value}
      </p>
    </div>
  </button>
)

export const ActionItemDetailModal = ({
  item,
  assigneeName,
  tagLabel,
  meetingTitle,
  isLoading = false,
  onClose,
  onOpenMeeting,
}) => {
  if (!item) {
    return null
  }

  const footerStatus = getFooterStatus(item)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`flex h-6 shrink-0 items-center rounded-md px-2 text-[11px] font-extrabold capitalize ${footerStatus.className}`}
              >
                {footerStatus.label}
              </span>
              {tagLabel ? (
                <span className="flex h-6 max-w-full items-center rounded-md bg-blue-50 px-2 text-[11px] font-extrabold text-blue-700">
                  <span className="truncate">{tagLabel}</span>
                </span>
              ) : null}
            </div>
            <h2 className="mt-3 text-xl font-extrabold leading-tight text-slate-900">
              {item.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close action item detail"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailField
              icon={<User className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
              label="Owner"
              value={assigneeName}
            />
            <DetailField
              icon={
                <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              }
              label="Timeline"
              value={getDueLabel(item)}
            />
            <DetailField
              icon={<Flag className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
              label="Status"
              value={statusLabel[item.status] || item.status}
            />
            <DetailField
              icon={<Tag className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
              label="Meeting"
              value={meetingTitle || 'Meeting'}
              onClick={
                item.meetingId
                  ? () => {
                      onClose()
                      onOpenMeeting?.(item.meetingId)
                    }
                  : undefined
              }
            />
          </div>

          <div>
            <p className="text-xs font-bold uppercase text-slate-400">Description</p>
            <p className="mt-2 min-h-20 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-700">
              {isLoading ? 'Loading details...' : item.description || 'No description'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export const ActionItemsView = ({
  actionItems,
  summaryActionItems = [],
  meetings = [],
  users = [],
  currentUserId,
  selectedActionItemId: selectedActionItemIdProp = null,
  onSelectedActionItemHandled,
  onMoveActionItem,
  onOpenMeeting,
}) => {
  const [selectedActionItemId, setSelectedActionItemId] = useState(null)
  const [viewMode, setViewMode] = useState('summary')
  const [listFilters, setListFilters] = useState(initialListFilters)
  const [sortConfig, setSortConfig] = useState({ column: 'dueDate', direction: 'asc' })

  const meetingsById = new Map(meetings.map((meeting) => [meeting.id, meeting]))
  const usersById = new Map(users.map((user) => [user.id, user]))
  const activeSelectedActionItemId = selectedActionItemIdProp || selectedActionItemId
  const selectedActionItem = actionItems.find((item) => item.id === activeSelectedActionItemId)
  const selectedAssignee = selectedActionItem ? usersById.get(selectedActionItem.assigneeId) : null
  const selectedMeeting = selectedActionItem ? meetingsById.get(selectedActionItem.meetingId) : null
  const [currentTime] = useState(() => Date.now())
  const isMeetingReviewed = (meeting) => {
    if (!meeting) return false
    return (
      new Date(meeting.startsAt).getTime() <= currentTime ||
      (typeof window !== 'undefined' &&
        window.localStorage.getItem(
          `meeting-confirmation:${meeting.id}:${currentUserId}:confirmed`
        ) === '1')
    )
  }
  const hasActiveListFilters = Object.values(listFilters).some(Boolean)

  const updateListFilter = (column, value) => {
    setListFilters((current) => ({ ...current, [column]: value }))
  }

  const handleListSort = (column) => {
    setSortConfig((current) => ({
      column,
      direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  const getListSortValue = (item, column) => {
    if (column === 'dueDate') {
      return item.dueDate ? new Date(item.dueDate).getTime() : null
    }

    if (column === 'priority') {
      return { high: 1, medium: 2, low: 3 }[item.priority] || 4
    }

    if (column === 'status') {
      return (statusLabel[item.status] || item.status || '').toLowerCase()
    }

    if (column === 'meeting') {
      return meetingsById.get(item.meetingId)?.title?.toLowerCase() || ''
    }

    return toDisplayString(item.title).toLowerCase()
  }

  const listActionItems = actionItems
    .filter((item) => {
      const dueDateValue = item.dueDate ? item.dueDate.slice(0, 10) : ''
      const meetingValue = item.meetingId == null ? 'none' : String(item.meetingId)

      return (
        toDisplayString(item.title).toLowerCase().includes(listFilters.title.toLowerCase()) &&
        (!listFilters.dueDate || dueDateValue === listFilters.dueDate) &&
        (!listFilters.priority || item.priority === listFilters.priority) &&
        (!listFilters.status || item.status === listFilters.status) &&
        (!listFilters.meeting || meetingValue === listFilters.meeting)
      )
    })
    .sort((left, right) => {
      const leftCompleted = left.status === 'completed'
      const rightCompleted = right.status === 'completed'

      if (leftCompleted !== rightCompleted) {
        return leftCompleted ? 1 : -1
      }

      if (sortConfig.column === 'dueDate' && sortConfig.direction === 'asc') {
        const leftOverdue = isOverdueActionItem(left)
        const rightOverdue = isOverdueActionItem(right)

        if (leftOverdue !== rightOverdue) {
          return leftOverdue ? -1 : 1
        }
      }

      const leftValue = getListSortValue(left, sortConfig.column)
      const rightValue = getListSortValue(right, sortConfig.column)

      if (leftValue == null || rightValue == null) {
        if (leftValue == null && rightValue == null) {
          return 0
        }

        return leftValue == null ? 1 : -1
      }

      const comparison =
        typeof leftValue === 'number'
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue))

      return sortConfig.direction === 'asc' ? comparison : -comparison
    })

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Personal workflow"
        title="Action Items"
        description={
          viewMode === 'summary'
            ? 'Monitor completion, priority, and deadlines across meetings you own.'
            : 'Track action items assigned to you without losing sight of what is due next.'
        }
        icon={ListChecks}
        accent="emerald"
        action={
          <div
            className="inline-flex rounded-xl border border-slate-200/80 bg-white/80 p-1 shadow-sm"
            role="group"
            aria-label="Action item view"
          >
            <button
              type="button"
              onClick={() => setViewMode('summary')}
              aria-pressed={viewMode === 'summary'}
              className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-bold transition ${
                viewMode === 'summary'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <PieChart className="h-4 w-4" aria-hidden="true" />
              Summary
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-bold transition ${
                viewMode === 'list'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <List className="h-4 w-4" aria-hidden="true" />
              To-do List
            </button>
          </div>
        }
      />

      {viewMode === 'summary' ? (
        <ActionItemsSummary actionItems={summaryActionItems} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <p className="text-sm font-semibold text-slate-600">
              Showing{' '}
              <span className="font-extrabold text-slate-900">{listActionItems.length}</span> of{' '}
              {actionItems.length} action items
            </p>
            {hasActiveListFilters ? (
              <button
                type="button"
                onClick={() => setListFilters(initialListFilters)}
                className="text-xs font-bold text-blue-700 hover:text-blue-900"
              >
                Clear all filters
              </button>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <SortableHeader
                    column="title"
                    label="Title"
                    sortConfig={sortConfig}
                    onSort={handleListSort}
                  />
                  <SortableHeader
                    column="dueDate"
                    label="Due date"
                    sortConfig={sortConfig}
                    onSort={handleListSort}
                  />
                  <SortableHeader
                    column="priority"
                    label="Priority"
                    sortConfig={sortConfig}
                    onSort={handleListSort}
                  />
                  <SortableHeader
                    column="status"
                    label="Status"
                    sortConfig={sortConfig}
                    onSort={handleListSort}
                  />
                  <SortableHeader
                    column="meeting"
                    label="Meeting"
                    sortConfig={sortConfig}
                    onSort={handleListSort}
                  />
                  <th className="px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-slate-400">
                    Review pulse
                  </th>
                </tr>
                <tr className="border-t border-slate-200 bg-white">
                  <th className="px-4 py-2">
                    <input
                      value={listFilters.title}
                      onChange={(event) => updateListFilter('title', event.target.value)}
                      className={listFilterClass}
                      placeholder="Filter title"
                      aria-label="Filter by title"
                    />
                  </th>
                  <th className="px-4 py-2">
                    <input
                      type="date"
                      value={listFilters.dueDate}
                      onChange={(event) => updateListFilter('dueDate', event.target.value)}
                      className={listFilterClass}
                      aria-label="Filter by due date"
                    />
                  </th>
                  <th className="px-4 py-2">
                    <select
                      value={listFilters.priority}
                      onChange={(event) => updateListFilter('priority', event.target.value)}
                      className={listFilterClass}
                      aria-label="Filter by priority"
                    >
                      <option value="">All priorities</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </th>
                  <th className="px-4 py-2">
                    <select
                      value={listFilters.status}
                      onChange={(event) => updateListFilter('status', event.target.value)}
                      className={listFilterClass}
                      aria-label="Filter by status"
                    >
                      <option value="">All statuses</option>
                      {Object.entries(statusLabel).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </th>
                  <th className="px-4 py-2">
                    <select
                      value={listFilters.meeting}
                      onChange={(event) => updateListFilter('meeting', event.target.value)}
                      className={listFilterClass}
                      aria-label="Filter by meeting"
                    >
                      <option value="">All meetings</option>
                      <option value="none">No meeting</option>
                      {meetings.map((meeting) => (
                        <option key={meeting.id} value={meeting.id}>
                          {meeting.title}
                        </option>
                      ))}
                    </select>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {listActionItems.map((item) => {
                  const meeting = meetingsById.get(item.meetingId)
                  const tagLabel = toTitleCase(meeting?.tag)
                  const isOverdue = isOverdueActionItem(item)

                  return (
                    <tr
                      key={item.id}
                      tabIndex={0}
                      onClick={() => setSelectedActionItemId(item.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setSelectedActionItemId(item.id)
                        }
                      }}
                      className="cursor-pointer transition hover:bg-blue-50/60 focus:bg-blue-50/60 focus:outline-none"
                    >
                      <td className="max-w-72 px-4 py-3.5">
                        <div className="flex items-start gap-2">
                          {isOverdue ? (
                            <AlertTriangle
                              className="mt-0.5 h-4 w-4 shrink-0 text-rose-500"
                              aria-hidden="true"
                            />
                          ) : null}
                          <span className="truncate text-sm font-extrabold text-slate-900">
                            {item.title}
                          </span>
                        </div>
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3.5 text-sm font-semibold ${
                          isOverdue ? 'text-rose-600' : 'text-slate-600'
                        }`}
                      >
                        {getDueLabel(item)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex rounded-md px-2 py-1 text-xs font-extrabold capitalize ${
                            priorityClass[item.priority] || priorityClass.medium
                          }`}
                        >
                          {item.priority || 'medium'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <select
                          value={item.status}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            event.stopPropagation()
                            onMoveActionItem?.(item.id, event.target.value)
                          }}
                          className={`h-9 rounded-md border-0 px-2 text-xs font-extrabold outline-none focus:ring-2 focus:ring-blue-300 ${
                            statusClass[item.status] || statusClass.todo
                          }`}
                          aria-label={`Change status for ${item.title}`}
                        >
                          {Object.entries(statusLabel).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="max-w-52 px-4 py-3.5">
                        <p className="truncate text-sm font-semibold text-slate-700">
                          {meeting?.title || 'No meeting'}
                        </p>
                        {tagLabel ? (
                          <p className="mt-0.5 truncate text-xs font-bold text-blue-600">
                            {tagLabel}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex rounded-md px-2 py-1 text-xs font-extrabold ${
                            meeting?.ownerId === currentUserId
                              ? 'bg-blue-50 text-blue-700'
                              : isMeetingReviewed(meeting)
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {meeting?.ownerId === currentUserId
                            ? 'Owner'
                            : isMeetingReviewed(meeting)
                              ? 'Reviewed'
                              : 'Not reviewed'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {listActionItems.length === 0 ? (
            <div className="border-t border-slate-100 px-4 py-10 text-center text-sm text-slate-500">
              {hasActiveListFilters
                ? 'No action items match the current filters.'
                : 'No action items yet.'}
            </div>
          ) : null}
        </div>
      )}

      <ActionItemDetailModal
        item={selectedActionItem}
        assigneeName={selectedAssignee?.name || 'Unassigned'}
        tagLabel={toTitleCase(selectedMeeting?.tag)}
        meetingTitle={selectedMeeting?.title}
        onClose={() => {
          setSelectedActionItemId(null)
          onSelectedActionItemHandled?.()
        }}
        onOpenMeeting={onOpenMeeting}
      />
    </section>
  )
}
