import { useState } from 'react'
import { Eye, FileAudio, Trash2, UploadCloud } from 'lucide-react'

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

const padDatePart = (value) => String(value).padStart(2, '0')

const getDateInputValue = (value) => {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`
}

const getTimeInputValue = (value) => {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`
}

export const MeetingDetailView = ({
  detail,
  onBack,
  onChange,
  onSaveMeetingField,
  onAddActionItem,
  onActionItemChange,
  onActionItemSave,
  onActionItemStatusChange,
  onActionItemPatch,
  onActionItemRemove,
  pendingMaterialFiles,
  pendingAudioFiles,
  onAddPendingMaterialFiles,
  onAddPendingAudioFiles,
  onDownloadMeetingFile,
  onPreview,
}) => {
  const [isDragOverMaterialFiles, setIsDragOverMaterialFiles] = useState(false)
  const [isDragOverAudioFiles, setIsDragOverAudioFiles] = useState(false)
  const [newActionItem, setNewActionItem] = useState({
    title: '',
    assigneeId: '',
    dueDate: '',
    priority: 'medium',
  })

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
      priority: newActionItem.priority,
    })
    setNewActionItem({ title: '', assigneeId: '', dueDate: '', priority: 'medium' })
  }
  const audioFiles = detail.files.filter(
    (file) => file.bucketName === 'meeting-audio' || file.mimeType?.startsWith('audio/')
  )
  const materialFiles = detail.files.filter((file) => !audioFiles.includes(file))
  const saveOnEnter = (event, field) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
      onSaveMeetingField(field)
    }
  }
  const saveTextareaOnShortcut = (event, field) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.currentTarget.blur()
      onSaveMeetingField(field)
    }
  }

  return (
    <section>
      <div className="mb-4">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Back to repository
        </button>
      </div>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-4xl font-semibold text-slate-800">{detail.meeting.title}</h1>
          <p className="mt-1 text-slate-500">{formatDateTime(detail.meeting.startsAt)}</p>
        </div>
        <button
          type="button"
          onClick={onPreview}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          Preview & export
        </button>
      </header>

      <div className="mt-6 grid gap-5 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-2xl font-semibold text-slate-700">Meeting Information</h2>
            <p className="mt-1 text-sm text-slate-500">
              Title and location save when the field loses focus.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Meeting Title
                </span>
                <input
                  value={detail.meeting.title || ''}
                  onChange={(event) => onChange('title', event.target.value)}
                  onBlur={() => onSaveMeetingField('title')}
                  onKeyDown={(event) => saveOnEnter(event, 'title')}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3"
                  placeholder="Meeting title"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Location
                </span>
                <input
                  value={detail.meeting.location || ''}
                  onChange={(event) => onChange('location', event.target.value)}
                  onBlur={() => onSaveMeetingField('location')}
                  onKeyDown={(event) => saveOnEnter(event, 'location')}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3"
                  placeholder="Location"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Date
                </span>
                <input
                  type="date"
                  value={getDateInputValue(detail.meeting.startsAt)}
                  disabled
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 text-slate-500"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Time
                </span>
                <input
                  type="time"
                  value={getTimeInputValue(detail.meeting.startsAt)}
                  disabled
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 text-slate-500"
                />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-2xl font-semibold text-slate-700">Agenda</h2>
            <p className="mt-1 text-sm text-slate-500">
              Planned objective and discussion scope. This is separate from meeting minutes.
            </p>
            <textarea
              rows={4}
              value={detail.meeting.description || ''}
              onChange={(event) => onChange('description', event.target.value)}
              onBlur={() => onSaveMeetingField('description')}
              onKeyDown={(event) => saveTextareaOnShortcut(event, 'description')}
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
              className="mt-4 grid gap-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3 lg:grid-cols-[minmax(0,1fr)_10rem_9rem_8rem_auto]"
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
              <label className="block">
                <span className="sr-only">New action item priority</span>
                <select
                  value={newActionItem.priority}
                  onChange={(event) =>
                    setNewActionItem((prev) => ({ ...prev, priority: event.target.value }))
                  }
                  className="h-10 w-full rounded-lg border border-blue-100 bg-white px-3 text-sm font-medium capitalize text-slate-700"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
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
                const isCompleted = item.status === 'completed'

                return (
                  <article
                    key={item.id}
                    className={`rounded-xl border p-3 shadow-sm transition ${
                      isCompleted
                        ? 'border-emerald-100 bg-emerald-50/50 opacity-95'
                        : 'border-slate-200 bg-white hover:border-blue-100 hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <label className="block min-w-0 flex-1">
                        <span className="sr-only">Task</span>
                        <input
                          value={item.title}
                          onChange={(event) => onActionItemChange(item.id, event.target.value)}
                          onBlur={() => onActionItemSave(item.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.currentTarget.blur()
                            }
                          }}
                          className={`h-8 w-full rounded-md border border-transparent bg-transparent px-0 text-base font-extrabold text-slate-900 outline-none transition focus:border-blue-300 focus:px-2 focus:ring-2 focus:ring-blue-100 ${
                            isCompleted
                              ? 'text-slate-500 line-through focus:bg-emerald-50'
                              : 'focus:bg-blue-50/40'
                          }`}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => onActionItemRemove(item.id)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                        aria-label="Remove action item"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="block">
                        <span className="sr-only">Owner</span>
                        <select
                          value={item.assigneeId || ''}
                          onChange={(event) =>
                            onActionItemPatch(item.id, { assigneeId: event.target.value || null })
                          }
                          className="h-8 max-w-48 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700"
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
                        <span className="sr-only">Deadline</span>
                        <input
                          type="date"
                          value={item.dueDate ? item.dueDate.slice(0, 10) : ''}
                          onChange={(event) => {
                            const dueDate = event.target.value
                              ? new Date(`${event.target.value}T00:00:00Z`).toISOString()
                              : null
                            onActionItemPatch(item.id, { dueDate })
                          }}
                          className="h-8 w-36 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700"
                        />
                      </label>

                      <label className="block">
                        <span className="sr-only">Status</span>
                        <select
                          value={item.status}
                          onChange={(event) =>
                            onActionItemStatusChange(item.id, event.target.value)
                          }
                          className={`h-8 w-32 rounded-md border px-2 text-xs font-extrabold ${
                            actionStatusStyles[item.status]?.className ||
                            actionStatusStyles.todo.className
                          }`}
                        >
                          <option value="todo">To do</option>
                          <option value="in_progress">In progress</option>
                          <option value="blocked">Blocked</option>
                          <option value="completed">Done</option>
                        </select>
                      </label>

                      <label className="block">
                        <span className="sr-only">Priority</span>
                        <select
                          value={item.priority || 'medium'}
                          onChange={(event) =>
                            onActionItemPatch(item.id, { priority: event.target.value })
                          }
                          className={`h-8 w-28 rounded-md border border-transparent px-2 text-xs font-extrabold capitalize ${
                            priorityStyles[item.priority] || priorityStyles.medium
                          }`}
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </label>
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
            <label
              className={`mt-3 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center text-sm transition ${
                isDragOverMaterialFiles
                  ? 'border-blue-400 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-500 hover:border-blue-300 hover:bg-blue-50/50'
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
                <UploadCloud className="h-5 w-5" />
              </div>
              <span className="font-semibold">Drag & drop files here or click to browse</span>
              <input
                type="file"
                multiple
                className="sr-only"
                onChange={(event) => {
                  onAddPendingMaterialFiles(event.target.files)
                  event.target.value = ''
                }}
              />
            </label>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {materialFiles.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-700" title={file.fileName}>
                      {file.fileName}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDateOnly(file.createdAt)}
                    </p>
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
                <li
                  key={`${file.name}-${file.size}-${index}`}
                  className="flex items-center justify-between text-blue-700"
                >
                  <span>{file.name} (uploading...)</span>
                </li>
              ))}
              {materialFiles.length === 0 && pendingMaterialFiles.length === 0 ? (
                <li className="rounded-lg bg-slate-50 px-3 py-2 text-slate-500">
                  No files uploaded
                </li>
              ) : null}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-2xl font-semibold text-slate-700">Upload Meeting Audio</h2>
            <p className="mt-1 text-sm text-slate-500">
              Audio recordings for transcription and archive.
            </p>
            <label
              className={`mt-3 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center text-sm transition ${
                isDragOverAudioFiles
                  ? 'border-blue-400 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-500 hover:border-blue-300 hover:bg-blue-50/50'
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
              <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-300">
                <FileAudio className="h-5 w-5" />
              </div>
              <span className="font-semibold">Drop audio here or click to browse</span>
              <span className="mt-1 text-xs text-slate-400">Supports MP3, WAV, M4A</span>
              <input
                type="file"
                multiple
                accept=".mp3,.wav,.m4a,audio/*"
                className="sr-only"
                onChange={(event) => {
                  onAddPendingAudioFiles(event.target.files)
                  event.target.value = ''
                }}
              />
            </label>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {audioFiles.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-700" title={file.fileName}>
                      {file.fileName}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDateOnly(file.createdAt)}
                    </p>
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
              {pendingAudioFiles.map((file, index) => (
                <li
                  key={`${file.name}-${file.size}-${index}`}
                  className="flex items-center justify-between text-blue-700"
                >
                  <span>{file.name} (uploading...)</span>
                </li>
              ))}
              {audioFiles.length === 0 && pendingAudioFiles.length === 0 ? (
                <li className="rounded-lg bg-slate-50 px-3 py-2 text-slate-500">No audio queued</li>
              ) : null}
            </ul>
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
