import { useState } from 'react'

import { formatDateOnly, formatDateTime } from '../../utils/date.js'

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
  const participantsById = Object.fromEntries(
    (detail?.participants || []).map((participant) => [participant.userId, participant.name])
  )

  if (!detail) {
    return null
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
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-slate-700">Action Items</h2>
              <button
                type="button"
                onClick={onAddActionItem}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
              >
                + Add Item
              </button>
            </div>
            <p className="mb-2 text-sm text-slate-500">Tasks, assignees, and due dates from this meeting.</p>
            <div className="mb-2 grid grid-cols-[1.4fr_1fr_0.9fr] gap-2 text-xs font-semibold text-slate-500">
              <span>Task</span>
              <span>Responsible Person</span>
              <span>Deadline</span>
            </div>
            <div className="space-y-2">
              {detail.actionItems.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 p-2">
                  <div className="grid grid-cols-[1.4fr_1fr_0.9fr] gap-2">
                    <input
                      value={item.title}
                      onChange={(event) => onActionItemChange(item.id, event.target.value)}
                      onBlur={() => onActionItemSave(item.id)}
                      className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm outline-none"
                    />
                    <select
                      value={item.assigneeId || ''}
                      onChange={(event) => onActionItemAssigneeChange(item.id, event.target.value || null)}
                      className="h-9 w-full rounded-md border border-slate-200 px-2 text-xs"
                    >
                      <option value="">Unassigned</option>
                      {detail.participants.map((participant) => (
                        <option key={participant.userId} value={participant.userId}>
                          {participant.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={item.dueDate ? item.dueDate.slice(0, 10) : ''}
                      onChange={(event) => onActionItemDueDateChange(item.id, event.target.value)}
                      className="h-9 w-full rounded-md border border-slate-200 px-2 text-xs"
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Assigned to: {participantsById[item.assigneeId] || 'Unassigned'}
                  </p>
                  <div className="mt-2 text-right">
                    <button
                      type="button"
                      onClick={() => onActionItemRemove(item.id)}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
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
