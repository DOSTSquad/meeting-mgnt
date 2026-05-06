import { useState } from 'react'
import { Calendar, Flag, Tag, User, X } from 'lucide-react'

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

const toTitleCase = (value = '') =>
  value
    .split(' ')
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(' ')

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

const columnStatus = {
  todo: 'todo',
  in_progress: 'in_progress',
  done: 'completed',
}

const statusLabel = {
  todo: 'To-do',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  completed: 'Done',
  cancelled: 'Cancelled',
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
      <p className={`mt-0.5 truncate text-sm font-bold ${onClick ? 'text-blue-700' : 'text-slate-700'}`}>
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
                <Calendar
                  className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
                  aria-hidden="true"
                />
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

  const grouped = {
    todo: actionItems.filter((item) => item.status === 'todo' || item.status === 'blocked'),
    in_progress: actionItems.filter((item) => item.status === 'in_progress'),
    done: actionItems.filter((item) => item.status === 'completed'),
  }
  const meetingsById = new Map(meetings.map((meeting) => [meeting.id, meeting]))
  const usersById = new Map(users.map((user) => [user.id, user]))
  const draggingItem = actionItems.find((item) => item.id === draggingItemId)
  const activeSelectedActionItemId = selectedActionItemIdProp || selectedActionItemId
  const selectedActionItem = actionItems.find((item) => item.id === activeSelectedActionItemId)
  const selectedAssignee = selectedActionItem ? usersById.get(selectedActionItem.assigneeId) : null
  const selectedMeeting = selectedActionItem ? meetingsById.get(selectedActionItem.meetingId) : null

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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">
            Action Items Tracker
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Kanban follow-ups from weekly product meetings
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {columnConfig.map((column) => (
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
                draggingItemId && dragOverColumnId === column.id
                  ? 'scale-[1.01] border-blue-300 bg-blue-50/70 shadow-inner'
                  : draggingItemId
                    ? 'border-slate-200 bg-slate-50/70'
                    : 'border-transparent'
              }`}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setDragOverColumnId(column.id)
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setDragOverColumnId(null)
                }
              }}
              onDrop={(event) => handleDrop(event, column.id)}
            >
              {draggingItemId && dragOverColumnId === column.id ? (
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
                    } ${isDone ? 'border-emerald-100' : 'border-slate-200'}`}
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
        ))}
      </div>

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
