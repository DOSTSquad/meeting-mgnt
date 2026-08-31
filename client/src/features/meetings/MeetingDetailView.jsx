import { useState } from 'react'

import { AnalysisReviewPreview } from './AnalysisReviewPreview.jsx'
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

const getParticipantInitials = (name = '') => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return '?'
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

export const MeetingDetailView = ({
  detail,
  analysisReview,
  applyMinutesState,
  onApplyGeneratedMinutes,
  onDismissApplyMinutesState,
  onAcceptSuggestion,
  onRejectSuggestion,
  onBack,
  onChange,
  onSaveMeetingField,
  onMinutesChange,
  onSaveMinutes,
  onAddActionItem,
  onActionItemChange,
  onActionItemSave,
  onActionItemStatusChange,
  onActionItemPatch,
  onActionItemRemove,
  pendingMaterialFiles,
  pendingRecordingFile,
  onAddPendingMaterialFiles,
  onUploadRecording,
  onRemoveRecording,
  onDownloadMeetingFile,
  onPreview,
  canManageMeeting = false,
}) => {
  const [isDragOverMaterialFiles, setIsDragOverMaterialFiles] = useState(false)
  const [isDragOverRecording, setIsDragOverRecording] = useState(false)
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
  const materialFiles = detail.files
  const visibleParticipants = detail.participants.slice(0, 6)
  const hiddenParticipantCount = Math.max(
    detail.participants.length - visibleParticipants.length,
    0
  )
  const recordingStatus = detail.recording?.status || 'empty'
  const isGenerationQueued =
    recordingStatus === 'uploaded' &&
    (detail.transcript?.status === 'processing' || detail.analysisRun?.status === 'queued')
  const recordingStatusLabel = isGenerationQueued
    ? 'Queued'
    : {
        empty: 'No recording',
        uploaded: 'Uploaded',
        transcribing: 'Transcribing',
        transcribed: 'Transcript ready',
        failed: 'Needs setup',
      }[recordingStatus] || recordingStatus
  const transcriptMessage =
    detail.transcript?.errorMessage ||
    (detail.transcript?.status === 'completed'
      ? 'Transcript is ready.'
      : detail.transcript?.status === 'processing'
        ? recordingStatus === 'transcribing'
          ? 'Transcription is running.'
          : 'Transcription is queued.'
        : null)
  const analysisMessage =
    detail.analysisRun?.errorMessage ||
    (detail.analysisRun?.status === 'queued'
      ? 'Analysis is queued.'
      : detail.analysisRun?.status === 'processing'
        ? 'Analysis is running.'
        : detail.analysisRun?.status === 'ready_for_review'
          ? 'Analysis is ready for review.'
          : null)
  const minuteStatusClass =
    {
      draft: 'bg-amber-50 text-amber-700 border-amber-100',
      approved: 'bg-blue-50 text-blue-700 border-blue-100',
      published: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    }[detail.minutes?.status] || 'bg-slate-100 text-slate-600 border-slate-200'
  const participantOptions = detail.participants.map((participant) => ({
    id: participant.userId,
    name: participant.name,
  }))
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
  const saveMinutesTextareaOnShortcut = (event, field) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.currentTarget.blur()
      onSaveMinutes({ [field]: detail.minutes?.[field] || '' })
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

      <header>
        <div className="min-w-0">
          <h1 className="text-4xl font-semibold text-slate-800">{detail.meeting.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            <span>{formatDateTime(detail.meeting.startsAt)}</span>
            <button
              type="button"
              onClick={onPreview}
              className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-blue-700"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              Preview & export
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {visibleParticipants.map((participant) => (
              <div
                key={participant.userId}
                className="inline-flex max-w-48 items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 text-xs font-semibold text-slate-600 shadow-sm"
                title={participant.name}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-extrabold text-blue-700">
                  {getParticipantInitials(participant.name)}
                </span>
                <span className="truncate">{participant.name}</span>
              </div>
            ))}
            {hiddenParticipantCount > 0 ? (
              <span className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-500">
                +{hiddenParticipantCount}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mt-6 space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-2xl font-semibold text-slate-700">Meeting Information</h2>
          <p className="mt-1 text-sm text-slate-500">
            {canManageMeeting
              ? 'Title and location/meeting link save when the field loses focus.'
              : 'Meeting information is read-only for participants.'}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Meeting Title
              </span>
              <input
                value={detail.meeting.title || ''}
                disabled={!canManageMeeting}
                onChange={(event) => onChange('title', event.target.value)}
                onBlur={() => onSaveMeetingField('title')}
                onKeyDown={(event) => saveOnEnter(event, 'title')}
                className="h-11 w-full rounded-xl border border-slate-200 px-3"
                placeholder="Meeting title"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Location / Meeting Link
              </span>
              <input
                value={detail.meeting.location || ''}
                disabled={!canManageMeeting}
                onChange={(event) => onChange('location', event.target.value)}
                onBlur={() => onSaveMeetingField('location')}
                onKeyDown={(event) => saveOnEnter(event, 'location')}
                className="h-11 w-full rounded-xl border border-slate-200 px-3"
                placeholder="Room 4.1 or https://teams.microsoft.com/..."
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
            disabled={!canManageMeeting}
            onChange={(event) => onChange('description', event.target.value)}
            onBlur={() => onSaveMeetingField('description')}
            onKeyDown={(event) => saveTextareaOnShortcut(event, 'description')}
            className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2"
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-slate-700">Meeting Minutes</h2>
              <p className="mt-1 text-sm text-slate-500">
                Record outcomes, discussion notes, and decisions.
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${minuteStatusClass}`}
            >
              {detail.minutes?.status || 'draft'}
            </span>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </span>
              <select
                value={detail.minutes?.status || 'draft'}
                disabled={!canManageMeeting}
                onChange={(event) => {
                  onMinutesChange('status', event.target.value)
                  onSaveMinutes({ status: event.target.value })
                }}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold capitalize text-slate-700"
              >
                <option value="draft">Draft</option>
                <option value="approved">Approved</option>
                <option value="published">Published</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Facilitator
              </span>
              <select
                value={detail.minutes?.facilitatorId || ''}
                disabled={!canManageMeeting}
                onChange={(event) => {
                  const facilitatorId = event.target.value || null
                  onMinutesChange('facilitatorId', facilitatorId)
                  onSaveMinutes({ facilitatorId })
                }}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
              >
                <option value="">Not assigned</option>
                {participantOptions.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participant.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Recorder
              </span>
              <select
                value={detail.minutes?.recorderId || ''}
                disabled={!canManageMeeting}
                onChange={(event) => {
                  const recorderId = event.target.value || null
                  onMinutesChange('recorderId', recorderId)
                  onSaveMinutes({ recorderId })
                }}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
              >
                <option value="">Not assigned</option>
                {participantOptions.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participant.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Minutes
            </span>
            <textarea
              rows={7}
              value={detail.minutes?.content || ''}
              disabled={!canManageMeeting}
              onChange={(event) => onMinutesChange('content', event.target.value)}
              onBlur={() => onSaveMinutes({ content: detail.minutes?.content || '' })}
              onKeyDown={(event) => saveMinutesTextareaOnShortcut(event, 'content')}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              placeholder="Capture meeting notes, updates, and outcomes..."
            />
          </label>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Key Discussions
              </span>
              <textarea
                rows={5}
                value={detail.minutes?.keyDiscussions || ''}
                disabled={!canManageMeeting}
                onChange={(event) => onMinutesChange('keyDiscussions', event.target.value)}
                onBlur={() =>
                  onSaveMinutes({ keyDiscussions: detail.minutes?.keyDiscussions || '' })
                }
                onKeyDown={(event) => saveMinutesTextareaOnShortcut(event, 'keyDiscussions')}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                placeholder="List important topics discussed..."
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Decisions
              </span>
              <textarea
                rows={5}
                value={detail.minutes?.decisions || ''}
                disabled={!canManageMeeting}
                onChange={(event) => onMinutesChange('decisions', event.target.value)}
                onBlur={() => onSaveMinutes({ decisions: detail.minutes?.decisions || '' })}
                onKeyDown={(event) => saveMinutesTextareaOnShortcut(event, 'decisions')}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                placeholder="Record decisions and approvals..."
              />
            </label>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-700">Recording source</h3>
                <p className="mt-1 text-xs text-slate-500">Source audio for this meeting record.</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                  recordingStatus === 'failed'
                    ? 'bg-amber-100 text-amber-700'
                    : detail.recording
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-slate-100 text-slate-500'
                }`}
              >
                {recordingStatusLabel}
              </span>
            </div>

            {detail.recording ? (
              <div className="mt-4 bg-slate-50 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-500">
                    <FileAudio className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-bold text-slate-800"
                      title={detail.recording.fileName}
                    >
                      {detail.recording.fileName}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Uploaded {formatDateOnly(detail.recording.createdAt)}
                    </p>
                    {transcriptMessage ? (
                      <p
                        className={`mt-2 text-xs font-semibold ${
                          detail.transcript?.status === 'failed'
                            ? 'text-amber-700'
                            : 'text-slate-600'
                        }`}
                      >
                        {transcriptMessage}
                      </p>
                    ) : null}
                    {analysisMessage ? (
                      <p
                        className={`mt-1 text-xs font-semibold ${
                          detail.analysisRun?.status === 'failed'
                            ? 'text-amber-700'
                            : 'text-slate-600'
                        }`}
                      >
                        {analysisMessage}
                      </p>
                    ) : null}
                  </div>
                  {canManageMeeting ? (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700">
                        Replace
                        <input
                          type="file"
                          accept=".mp3,.wav,.m4a,audio/*"
                          className="sr-only"
                          onChange={(event) => {
                            onUploadRecording(event.target.files, { replace: true })
                            event.target.value = ''
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={onRemoveRecording}
                        className="rounded-lg border border-rose-100 bg-white px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-50"
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                </div>
                <AnalysisReviewPreview
                  review={analysisReview}
                  canApply={canManageMeeting}
                  applyState={applyMinutesState}
                  onApply={onApplyGeneratedMinutes}
                  onDismissApplyState={onDismissApplyMinutesState}
                  onAcceptSuggestion={onAcceptSuggestion}
                  onRejectSuggestion={onRejectSuggestion}
                />
              </div>
            ) : canManageMeeting ? (
              <label
                className={`mt-4 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center text-sm transition ${
                  isDragOverRecording
                    ? 'border-blue-400 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-500 hover:border-blue-300 hover:bg-blue-50/50'
                }`}
                onDragOver={(event) => {
                  event.preventDefault()
                  setIsDragOverRecording(true)
                }}
                onDragLeave={() => setIsDragOverRecording(false)}
                onDrop={(event) => {
                  event.preventDefault()
                  setIsDragOverRecording(false)
                  onUploadRecording(event.dataTransfer?.files)
                }}
              >
                <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-300">
                  <FileAudio className="h-5 w-5" aria-hidden="true" />
                </div>
                <span className="font-semibold">Upload optional recording</span>
                <span className="mt-1 text-xs text-slate-400">One active MP3, WAV, or M4A</span>
                <input
                  type="file"
                  accept=".mp3,.wav,.m4a,audio/*"
                  className="sr-only"
                  onChange={(event) => {
                    onUploadRecording(event.target.files)
                    event.target.value = ''
                  }}
                />
              </label>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">
                No recording has been uploaded.
              </p>
            )}

            {pendingRecordingFile ? (
              <p className="mt-3 text-sm font-semibold text-blue-700">
                {pendingRecordingFile.name} uploading...
              </p>
            ) : null}
          </div>
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
                        onChange={(event) => onActionItemStatusChange(item.id, event.target.value)}
                        className={`h-8 w-32 rounded-md border px-2 text-xs font-extrabold ${
                          actionStatusStyles[item.status]?.className ||
                          actionStatusStyles.todo.className
                        }`}
                      >
                        <option value="todo">To do</option>
                        <option value="in_progress">In progress</option>
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
          <p className="mt-1 text-sm text-slate-500">
            Meeting documents, images, audio, and supporting files.
          </p>
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
            <span className="mt-1 text-xs text-slate-400">
              Audio uploaded here stays as an attachment.
            </span>
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
              <li
                key={`${file.name}-${file.size}-${index}`}
                className="flex items-center justify-between text-blue-700"
              >
                <span>{file.name} (uploading...)</span>
              </li>
            ))}
            {materialFiles.length === 0 && pendingMaterialFiles.length === 0 ? (
              <li className="rounded-lg bg-slate-50 px-3 py-2 text-slate-500">No files uploaded</li>
            ) : null}
          </ul>
        </div>
      </div>
    </section>
  )
}
