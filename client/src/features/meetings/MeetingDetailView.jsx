import { useState } from 'react'

import { isOverdueActionItem } from '../../utils/actionItems.js'
import { formatDateOnly, formatDateTime } from '../../utils/date.js'

const actionStatusStyles = {
  todo: {
    label: 'To do',
    className: 'bg-slate-100 text-slate-700 ring-slate-200',
  },
  in_progress: {
    label: 'In progress',
    className: 'bg-blue-50 text-blue-700 ring-blue-200',
  },
  blocked: {
    label: 'Blocked',
    className: 'bg-rose-50 text-rose-700 ring-rose-200',
  },
  completed: {
    label: 'Done',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
}

const priorityStyles = {
  high: 'bg-rose-100 text-rose-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-sky-100 text-sky-700',
}

const getActionStatus = (item) => {
  if (isOverdueActionItem(item)) {
    return {
      label: 'Overdue',
      className: 'bg-rose-50 text-rose-700 ring-rose-200',
    }
  }

  return actionStatusStyles[item.status] || actionStatusStyles.todo
}

const getDueText = (item) => {
  if (item.status === 'completed') {
    return item.completedAt ? `Completed ${formatDateOnly(item.completedAt)}` : 'Completed'
  }

  return item.dueDate ? `Due ${formatDateOnly(item.dueDate)}` : 'No due date'
}

export const MeetingDetailView = ({
  detail,
  onBack,
  onChange,
  onSave,
  onAddActionItem,
  onActionItemChange,
  onActionItemSave,
  onActionItemAssigneeChange,
  onActionItemDueDateChange,
  onActionItemStatusChange,
  onActionItemRemove,
  pendingMaterialFiles,
  pendingAudioFiles,
  onAddPendingMaterialFiles,
  onRemovePendingMaterialFile,
  onAddPendingAudioFiles,
  onRemovePendingAudioFile,
  onDownloadMeetingFile,
  onPreview,
}) => {
  const [isDragOverMaterialFiles, setIsDragOverMaterialFiles] = useState(false)
  const [isDragOverAudioFiles, setIsDragOverAudioFiles] = useState(false)
  const [newActionItem, setNewActionItem] = useState({
    title: '',
    assigneeId: '',
    dueDate: '',
  })
  const participantsById = Object.fromEntries(
    (detail?.participants || []).map((participant) => [participant.userId, participant.name])
  )

  if (!detail) {
    return null
  }

  const submitNewActionItem = (event) => {
    event.preventDefault()
    if (!newActionItem.title.trim()) {
      return
    }

    onAddActionItem({
      title: newActionItem.title,
      assigneeId: newActionItem.assigneeId || null,
      dueDate: newActionItem.dueDate
        ? new Date(`${newActionItem.dueDate}T00:00:00Z`).toISOString()
        : null,
    })
    setNewActionItem({ title: '', assigneeId: '', dueDate: '' })
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <button type="button" onClick={onBack} className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to repository
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onPreview}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
          >
            Preview
          </button>
          <button
            type="button"
            onClick={onSave}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Save & Finalize
          </button>
        </div>
      </div>

      <h1 className="text-4xl font-semibold text-slate-800">{detail.meeting.title}</h1>
      <p className="mt-1 text-slate-500">{formatDateTime(detail.meeting.startsAt)}</p>

      <div className="mt-6 grid gap-5 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-2xl font-semibold text-slate-700">Meeting Information</h2>
            <p className="mt-1 text-sm text-slate-500">Core meeting metadata (title, schedule, and owner fields).</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Meeting Title</span>
                <input
                  value={detail.meeting.title || ''}
                  onChange={(event) => onChange('title', event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3"
                  placeholder="Meeting title"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Location</span>
                <input
                  value={detail.meeting.location || ''}
                  onChange={(event) => onChange('location', event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3"
                  placeholder="Location"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Date</span>
                <input
                  type="date"
                  value={(detail.meeting.startsAt || '').slice(0, 10)}
                  onChange={(event) => onChange('date', event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Time</span>
                <input
                  type="time"
                  value={new Date(detail.meeting.startsAt).toISOString().slice(11, 16)}
                  onChange={(event) => onChange('time', event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3"
                />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-2xl font-semibold text-slate-700">Agenda</h2>
            <p className="mt-1 text-sm text-slate-500">Meeting objective and discussion scope.</p>
            <textarea
              rows={4}
              value={detail.meeting.description || ''}
              onChange={(event) => onChange('description', event.target.value)}
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-700">Action Items</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Follow-ups captured from this meeting, with ownership and deadline at a glance.
                </p>
              </div>
            </div>

            <form
              onSubmit={submitNewActionItem}
              className="mt-4 grid gap-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3 lg:grid-cols-[minmax(0,1fr)_10rem_9rem_auto]"
            >
              <label className="block">
                <span className="sr-only">New action item task</span>
                <input
                  value={newActionItem.title}
                  onChange={(event) =>
                    setNewActionItem((prev) => ({ ...prev, title: event.target.value }))
                  }
                  className="h-10 w-full rounded-lg border border-blue-100 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  placeholder="Add a new follow-up task..."
                />
              </label>
              <label className="block">
                <span className="sr-only">New action item owner</span>
                <select
                  value={newActionItem.assigneeId}
                  onChange={(event) =>
                    setNewActionItem((prev) => ({ ...prev, assigneeId: event.target.value }))
                  }
                  className="h-10 w-full rounded-lg border border-blue-100 bg-white px-3 text-sm font-medium text-slate-700"
                >
                  <option value="">Owner</option>
                  {detail.participants.map((participant) => (
                    <option key={participant.userId} value={participant.userId}>
                      {participant.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="sr-only">New action item due date</span>
                <input
                  type="date"
                  value={newActionItem.dueDate}
                  onChange={(event) =>
                    setNewActionItem((prev) => ({ ...prev, dueDate: event.target.value }))
                  }
                  className="h-10 w-full rounded-lg border border-blue-100 bg-white px-3 text-sm font-medium text-slate-700"
                />
              </label>
              <button
                type="submit"
                disabled={!newActionItem.title.trim()}
                className="h-10 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white shadow-sm shadow-blue-100 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                Add
              </button>
            </form>

            <div className="mt-3 space-y-3">
              {detail.actionItems.map((item) => {
                const status = getActionStatus(item)
                const priorityClass = priorityStyles[item.priority] || priorityStyles.medium
                const isCompleted = item.status === 'completed'

                return (
                  <article
                    key={item.id}
                    className={`rounded-xl border p-3 ${
                      isCompleted ? 'border-emerald-100 bg-emerald-50/50' : 'border-slate-200 bg-slate-50/80'
                    }`}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 flex-1 gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            onActionItemStatusChange(
                              item.id,
                              isCompleted ? 'todo' : 'completed'
                            )
                          }
                          aria-label={isCompleted ? 'Mark action item open' : 'Mark action item done'}
                          className={`mt-6 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition ${
                            isCompleted
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : 'border-slate-300 bg-white text-transparent hover:border-blue-400 hover:text-blue-600'
                          }`}
                        >
                          ✓
                        </button>
                        <label className="min-w-0 flex-1">
                          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                            Task
                          </span>
                          <input
                            value={item.title}
                            onChange={(event) => onActionItemChange(item.id, event.target.value)}
                            onBlur={() => onActionItemSave(item.id)}
                            className={`h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100 ${
                              isCompleted ? 'text-slate-500 line-through' : ''
                            }`}
                          />
                        </label>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${status.className}`}
                        >
                          {status.label}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${priorityClass}`}>
                          {item.priority || 'medium'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          Owner
                        </span>
                        <select
                          value={item.assigneeId || ''}
                          onChange={(event) => onActionItemAssigneeChange(item.id, event.target.value || null)}
                          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                        >
                          <option value="">Unassigned</option>
                          {detail.participants.map((participant) => (
                            <option key={participant.userId} value={participant.userId}>
                              {participant.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          Deadline
                        </span>
                        <input
                          type="date"
                          value={item.dueDate ? item.dueDate.slice(0, 10) : ''}
                          onChange={(event) => onActionItemDueDateChange(item.id, event.target.value)}
                          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                        />
                      </label>
                    </div>

                    <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                      <span>
                        {participantsById[item.assigneeId] || 'Unassigned'} · {getDueText(item)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onActionItemRemove(item.id)}
                        className="self-start font-semibold text-rose-600 hover:text-rose-700 sm:self-auto"
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                )
              })}
              {detail.actionItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm font-medium text-slate-500">
                  No action items yet.
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-2xl font-semibold text-slate-700">Meeting Materials</h2>
            <p className="mt-1 text-sm text-slate-500">Meeting documents and supporting files.</p>
            <div
              className={`mt-3 rounded-xl border-2 border-dashed p-5 text-center text-sm ${
                isDragOverMaterialFiles
                  ? 'border-blue-400 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-500'
              }`}
              onDragOver={(event) => {
                event.preventDefault()
                setIsDragOverMaterialFiles(true)
              }}
              onDragLeave={() => setIsDragOverMaterialFiles(false)}
              onDrop={(event) => {
                event.preventDefault()
                setIsDragOverMaterialFiles(false)
                onAddPendingMaterialFiles(event.dataTransfer?.files)
              }}
            >
              <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-300">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 16V4" />
                  <path d="m7 9 5-5 5 5" />
                  <path d="M20 16.5v2A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-2" />
                </svg>
              </div>
              Drag & drop files here or click to browse
            </div>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {detail.files.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-700" title={file.fileName}>
                      {file.fileName}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">{formatDateOnly(file.createdAt)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDownloadMeetingFile(file.id)}
                    className="ml-3 shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Download
                  </button>
                </li>
              ))}
              {pendingMaterialFiles.map((file, index) => (
                <li key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between text-blue-700">
                  <span>{file.name} (pending)</span>
                  <button
                    type="button"
                    onClick={() => onRemovePendingMaterialFile(index)}
                    className="text-xs font-semibold text-rose-600"
                  >
                    Remove
                  </button>
                </li>
              ))}
              {detail.files.length === 0 && pendingMaterialFiles.length === 0 ? <li>No files uploaded</li> : null}
            </ul>
            <input
              type="file"
              multiple
              className="mt-3 w-full text-sm"
              onChange={(event) => onAddPendingMaterialFiles(event.target.files)}
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-2xl font-semibold text-slate-700">Upload Meeting Audio</h2>
            <p className="mt-1 text-sm text-slate-500">Audio recordings for transcription and archive.</p>
            <div
              className={`mt-3 rounded-xl border-2 border-dashed p-5 text-center text-sm ${
                isDragOverAudioFiles
                  ? 'border-blue-400 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-500'
              }`}
              onDragOver={(event) => {
                event.preventDefault()
                setIsDragOverAudioFiles(true)
              }}
              onDragLeave={() => setIsDragOverAudioFiles(false)}
              onDrop={(event) => {
                event.preventDefault()
                setIsDragOverAudioFiles(false)
                onAddPendingAudioFiles(event.dataTransfer?.files)
              }}
            >
              Supports MP3, WAV, M4A
            </div>
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              {pendingAudioFiles.map((file, index) => (
                <li key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between text-blue-700">
                  <span>{file.name} (pending audio)</span>
                  <button
                    type="button"
                    onClick={() => onRemovePendingAudioFile(index)}
                    className="text-xs font-semibold text-rose-600"
                  >
                    Remove
                  </button>
                </li>
              ))}
              {pendingAudioFiles.length === 0 ? <li>No audio queued</li> : null}
            </ul>
            <input
              type="file"
              multiple
              accept=".mp3,.wav,.m4a,audio/*"
              className="mt-3 w-full text-sm"
              onChange={(event) => onAddPendingAudioFiles(event.target.files)}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-2xl font-semibold text-slate-700">Attendees</h2>
            <p className="mt-1 text-sm text-slate-500">People involved in this meeting.</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {detail.participants.map((participant) => (
                <li key={participant.userId}>{participant.name}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
