import { useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  Flag,
  LayoutDashboard,
  List,
  ListChecks,
  Tag,
  User,
  X,
} from 'lucide-react'

import { PageHeader } from '../../components/layout/PageHeader.jsx'
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

const toDisplayString = (value) => (value == null ? '' : String(value))

const getInitials = (name = '') =>
  toDisplayString(name)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'NA'

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

const columnStatus = {
  todo: 'todo',
  in_progress: 'in_progress',
  done: 'completed',
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

const sortActionItemsForColumn = (items) =>
  [...items].sort((left, right) => {
    const leftOverdue = isOverdueActionItem(left)
    const rightOverdue = isOverdueActionItem(right)

    if (leftOverdue !== rightOverdue) {
      return leftOverdue ? -1 : 1
    }

    const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.POSITIVE_INFINITY
    const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.POSITIVE_INFINITY

    if (leftDue !== rightDue) {
      return leftDue - rightDue
    }

    return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()
  })

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
  meetings = [],
  users = [],
  selectedActionItemId: selectedActionItemIdProp = null,
  onSelectedActionItemHandled,
  onMoveActionItem,
  onOpenMeeting,
}) => {
  const [draggingItemId, setDraggingItemId] = useState(null)
  const [dragOverColumnId, setDragOverColumnId] = useState(null)
  const [selectedActionItemId, setSelectedActionItemId] = useState(null)
  const [viewMode, setViewMode] = useState('list')
  const [listFilters, setListFilters] = useState(initialListFilters)
  const [sortConfig, setSortConfig] = useState({ column: 'dueDate', direction: 'asc' })

  const grouped = {
    todo: sortActionItemsForColumn(actionItems.filter((item) => item.status === 'todo')),
    in_progress: sortActionItemsForColumn(
      actionItems.filter((item) => item.status === 'in_progress')
    ),
    done: actionItems.filter((item) => item.status === 'completed'),
  }
  const meetingsById = new Map(meetings.map((meeting) => [meeting.id, meeting]))
  const usersById = new Map(users.map((user) => [user.id, user]))
  const draggingItem = actionItems.find((item) => item.id === draggingItemId)
  const activeSelectedActionItemId = selectedActionItemIdProp || selectedActionItemId
  const selectedActionItem = actionItems.find((item) => item.id === activeSelectedActionItemId)
  const selectedAssignee = selectedActionItem ? usersById.get(selectedActionItem.assigneeId) : null
  const selectedMeeting = selectedActionItem ? meetingsById.get(selectedActionItem.meetingId) : null
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

  const handleDragStart = (event, item) => {
    setDraggingItemId(item.id)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(item.id))
  }

  const finishDrag = () => {
    setDraggingItemId(null)
    setDragOverColumnId(null)
  }

  const handleDrop = async (event, columnId) => {
    event.preventDefault()
    const droppedItemId = Number(event.dataTransfer.getData('text/plain')) || draggingItemId
    const item = actionItems.find((candidate) => candidate.id === droppedItemId)
    const nextStatus = columnStatus[columnId]

    finishDrag()

    if (!item || !nextStatus || item.status === nextStatus) {
      return
    }

    await onMoveActionItem?.(item.id, nextStatus)
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Personal workflow"
        title="Action Items"
        description="Track every follow-up without losing sight of what is due next."
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
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-bold transition ${
                viewMode === 'list'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <List className="h-4 w-4" aria-hidden="true" />
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode('board')}
              aria-pressed={viewMode === 'board'}
              className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-bold transition ${
                viewMode === 'board'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              Board
            </button>
          </div>
        }
      />

      {viewMode === 'board' ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {columnConfig.map((column) => {
            const acceptsDrop = Boolean(columnStatus[column.id])

            return (
              <div key={column.id} className="space-y-3 p-2">
                <div
                  className={`flex h-10 items-center justify-between rounded-lg px-3 ${column.headerClass}`}
                >
                  <h2 className="text-sm font-bold">{column.label}</h2>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${column.countClass}`}>
                    {grouped[column.id].length}
                  </span>
                </div>
                <div
                  className={`min-h-56 space-y-3 rounded-xl border border-dashed transition duration-200 ${
                    acceptsDrop && draggingItemId && dragOverColumnId === column.id
                      ? 'scale-[1.01] border-blue-300 bg-blue-50/70 shadow-inner'
                      : acceptsDrop && draggingItemId
                        ? 'border-slate-200 bg-slate-50/70'
                        : 'border-transparent'
                  }`}
                  onDragOver={(event) => {
                    if (!acceptsDrop) {
                      return
                    }

                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    setDragOverColumnId(column.id)
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setDragOverColumnId(null)
                    }
                  }}
                  onDrop={acceptsDrop ? (event) => handleDrop(event, column.id) : undefined}
                >
                  {acceptsDrop && draggingItemId && dragOverColumnId === column.id ? (
                    <div className="flex h-12 items-center justify-center rounded-lg border border-blue-200 bg-white/80 text-xs font-bold text-blue-700 shadow-sm transition">
                      Drop to move
                      {draggingItem && columnStatus[column.id] !== draggingItem.status
                        ? ` to ${column.label}`
                        : ''}
                    </div>
                  ) : null}
                  {grouped[column.id].map((item, index) => {
                    const assignee = usersById.get(item.assigneeId)
                    const ownerName = assignee?.name || 'Unassigned'
                    const tagLabel = toTitleCase(meetingsById.get(item.meetingId)?.tag)
                    const footerStatus = getFooterStatus(item)
                    const isDone = item.status === 'completed'
                    const isOverdue = isOverdueActionItem(item)

                    return (
                      <article
                        key={item.id}
                        draggable
                        tabIndex={0}
                        role="button"
                        onClick={() => setSelectedActionItemId(item.id)}
                        onDragEnd={finishDrag}
                        onDragStart={(event) => handleDragStart(event, item)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setSelectedActionItemId(item.id)
                          }
                        }}
                        className={`min-h-36 cursor-grab rounded-lg border bg-white p-3.5 shadow-sm transition duration-200 active:cursor-grabbing ${
                          draggingItemId === item.id
                            ? 'rotate-1 scale-[0.98] opacity-40 shadow-xl'
                            : `${isDone ? 'opacity-95' : ''} hover:-translate-y-0.5 hover:shadow-md`
                        } ${
                          isDone
                            ? 'border-emerald-100'
                            : isOverdue
                              ? 'border-rose-200'
                              : 'border-slate-200'
                        }`}
                      >
                        <div className="flex h-full flex-col gap-2.5">
                          <div className="flex min-h-10 items-start gap-2">
                            {isOverdue ? (
                              <AlertTriangle
                                className="mt-0.5 h-4 w-4 shrink-0 text-rose-500"
                                aria-hidden="true"
                              />
                            ) : null}
                            <p className="text-sm font-extrabold leading-tight text-slate-900">
                              {item.title}
                            </p>
                          </div>

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
                              className={`flex h-5 shrink-0 items-center rounded-md px-2 text-[11px] font-extrabold capitalize ${footerStatus.className}`}
                            >
                              {footerStatus.label}
                            </span>
                            {tagLabel ? (
                              <span className="flex h-5 min-w-0 max-w-[58%] items-center rounded-md bg-blue-50 px-2 text-[11px] font-extrabold text-blue-700">
                                <span className="truncate">{tagLabel}</span>
                              </span>
                            ) : (
                              <span />
                            )}
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
                </div>
              </div>
            )
          })}
        </div>
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
