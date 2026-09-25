import { useState } from 'react'

import { AnalysisActionItemsPanel } from './AnalysisActionItemsPanel.jsx'
import { AnalysisSummaryPanel } from './AnalysisSummaryPanel.jsx'
import { TranscriptPanel } from './TranscriptPanel.jsx'
import { MeetingChangeRequestDialog } from './MeetingChangeRequestDialog.jsx'
import { MeetingChangeRequestInbox } from './MeetingChangeRequestInbox.jsx'
import {
  CheckCircle2,
  ChevronDown,
  CircleX,
  Eye,
  FileAudio,
  Trash2,
  UploadCloud,
} from 'lucide-react'

import { formatDateOnly, formatDateTime } from '../../utils/date.js'
import { formatMeetingStatus, getMeetingDisplayStatus } from '../../utils/meetingStatus.js'

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

const meetingStatusStyles = {
  scheduled: 'border-blue-200 bg-blue-50 text-blue-700',
  awaiting_completion: 'border-amber-200 bg-amber-50 text-amber-700',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  cancelled: 'border-rose-200 bg-rose-50 text-rose-700',
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

const MeetingTagEditor = ({ currentTag, tags, onSave }) => {
  const hasExistingTag = tags.some((tag) => tag.name === currentTag)
  const [tagMode, setTagMode] = useState(hasExistingTag ? 'existing' : 'new')
  const [tagValue, setTagValue] = useState(currentTag || '')
  const [saveState, setSaveState] = useState('idle')
  const sortedTags = [...tags].sort((left, right) => left.name.localeCompare(right.name))

  const saveTag = async () => {
    const normalizedTag = tagValue.trim()
    if (!normalizedTag || saveState === 'saving') {
      return
    }

    setSaveState('saving')
    const updatedMeeting = await onSave?.(normalizedTag)
    setSaveState(updatedMeeting ? 'saved' : 'idle')
  }

  return (
    <div className="sm:col-span-2">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        Meeting Tag
      </span>
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => {
            setTagMode('existing')
            setTagValue(hasExistingTag ? currentTag : '')
            setSaveState('idle')
          }}
          className={`rounded-md px-3 py-2 text-sm font-bold transition ${
            tagMode === 'existing'
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Use existing tag
        </button>
        <button
          type="button"
          onClick={() => {
            setTagMode('new')
            if (tags.some((tag) => tag.name === tagValue)) {
              setTagValue('')
            }
            setSaveState('idle')
          }}
          className={`rounded-md px-3 py-2 text-sm font-bold transition ${
            tagMode === 'new'
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Create new tag
        </button>
      </div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        {tagMode === 'existing' ? (
          <div className="relative min-w-0 flex-1">
            <select
              value={tags.some((tag) => tag.name === tagValue) ? tagValue : ''}
              onChange={(event) => {
                setTagValue(event.target.value)
                setSaveState('idle')
              }}
              className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-10 text-sm font-medium text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="" disabled>
                Select an existing tag
              </option>
              {sortedTags.map((tag) => (
                <option key={tag.id} value={tag.name}>
                  {tag.name}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
          </div>
        ) : (
          <input
            value={tagValue}
            onChange={(event) => {
              setTagValue(event.target.value)
              setSaveState('idle')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                saveTag()
              }
            }}
            maxLength={100}
            className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            placeholder="Enter a new meeting tag"
          />
        )}
        <button
          type="button"
          onClick={saveTag}
          disabled={!tagValue.trim() || saveState === 'saving'}
          className="h-11 shrink-0 rounded-xl bg-blue-600 px-4 text-sm font-extrabold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved' : 'Save tag'}
        </button>
      </div>
    </div>
  )
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
  onSaveMeetingTag,
  onUpdateMeetingStatus,
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
  onGenerateMinutesFromRecording,
  onDownloadMeetingFile,
  onPreview,
  canManageMeeting = false,
  canUpdateMeetingStatus = false,
  canEditMeetingTag = false,
  currentUserId,
  users = [],
  tags = [],
  onAddParticipant,
  onRemoveParticipant,
  onRequestMeetingChange,
  changeRequestInbox = { items: [], status: 'loading', error: '' },
  onRefreshChangeRequests,
  onMarkChangeRequestRead,
  openChangeRequestInbox = false,
  onCloseChangeRequestInbox,
}) => {
  const [changeRequestDialog, setChangeRequestDialog] = useState(null)
  const [isDragOverMaterialFiles, setIsDragOverMaterialFiles] = useState(false)
  const [isDragOverRecording, setIsDragOverRecording] = useState(false)
  const [pendingMeetingStatus, setPendingMeetingStatus] = useState(null)
  const [isGeneratingMinutes, setIsGeneratingMinutes] = useState(false)
  const [currentTime] = useState(() => Date.now())
  const confirmationStorageKey = detail
    ? `meeting-confirmation:${detail.meeting.id}:${currentUserId}`
    : ''
  const [isConfirmationSent, setIsConfirmationSent] = useState(() =>
    typeof window !== 'undefined' && confirmationStorageKey
      ? window.localStorage.getItem(`${confirmationStorageKey}:sent`) === '1'
      : false
  )
  const [showReviewSentPopup, setShowReviewSentPopup] = useState(false)
  const [isAttendeeConfirmed, setIsAttendeeConfirmed] = useState(() =>
    typeof window !== 'undefined' && confirmationStorageKey
      ? window.localStorage.getItem(`${confirmationStorageKey}:confirmed`) === '1'
      : false
  )
  const [confirmedParticipantIds, setConfirmedParticipantIds] = useState(() => {
    if (typeof window === 'undefined' || !detail) return []
    return detail.participants
      .filter(
        (participant) =>
          window.localStorage.getItem(
            `meeting-confirmation:${detail.meeting.id}:${participant.userId}:confirmed`
          ) === '1'
      )
      .map((participant) => participant.userId)
  })

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
  const isMeetingOwner = detail.meeting.ownerId === currentUserId
  const canRequestChange =
    !isMeetingOwner &&
    detail.participants.some(
      (participant) =>
        participant.userId === currentUserId && ['attendee', 'optional'].includes(participant.role)
    )
  const displayMeetingStatus = getMeetingDisplayStatus(detail.meeting)
  const nonAdminParticipants = detail.participants.filter(
    (participant) => users.find((user) => user.id === participant.userId)?.role !== 'admin'
  )
  const confirmationParticipants = nonAdminParticipants.filter(
    (participant) => participant.userId !== detail.meeting.ownerId
  )
  const isFutureMeeting = new Date(detail.meeting.startsAt).getTime() > currentTime
  const reviewedParticipantCount = confirmationParticipants.filter(
    (participant) => !isFutureMeeting || confirmedParticipantIds.includes(participant.userId)
  ).length
  const visibleParticipants = [...nonAdminParticipants]
    .sort((left, right) => {
      const leftIsOwner = left.userId === detail.meeting.ownerId
      const rightIsOwner = right.userId === detail.meeting.ownerId
      return Number(rightIsOwner) - Number(leftIsOwner)
    })
    .slice(0, 6)
  const hiddenParticipantCount = Math.max(
    nonAdminParticipants.length - visibleParticipants.length,
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
  const participantOptions = nonAdminParticipants.map((participant) => ({
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
  const updateStatus = async (status) => {
    const action = status === 'completed' ? 'completed' : 'cancelled'
    if (!window.confirm(`Mark this meeting as ${action}?`)) {
      return
    }

    setPendingMeetingStatus(status)
    try {
      await onUpdateMeetingStatus?.(status)
    } finally {
      setPendingMeetingStatus(null)
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
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-extrabold capitalize ${
                meetingStatusStyles[displayMeetingStatus] ||
                'border-slate-200 bg-slate-50 text-slate-600'
              }`}
            >
              {formatMeetingStatus(displayMeetingStatus)}
            </span>
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
            {visibleParticipants.map((participant) => {
              const isOwner = participant.userId === detail.meeting.ownerId

              return (
                <div
                  key={participant.userId}
                  className={`inline-flex max-w-56 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold shadow-sm ${
                    isOwner
                      ? 'border-amber-300 bg-amber-50 text-amber-800'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                  title={isOwner ? `${participant.name} · Meeting owner` : participant.name}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${
                      isOwner ? 'bg-amber-200 text-amber-800' : 'bg-blue-50 text-blue-700'
                    }`}
                  >
                    {getParticipantInitials(participant.name)}
                  </span>
                  <span className="truncate">{participant.name}</span>
                  {isOwner ? (
                    <span className="shrink-0 rounded-full bg-amber-200 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-amber-900">
                      Owner
                    </span>
                  ) : null}
                </div>
              )
            })}
            {hiddenParticipantCount > 0 ? (
              <span className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-500">
                +{hiddenParticipantCount}
              </span>
            ) : null}
          </div>
          {canManageMeeting ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/50 p-2">
              <span className="px-1 text-xs font-bold text-slate-600">Manage attendees</span>
              <select
                id="meeting-add-participant"
                className="h-9 min-w-44 rounded-lg border border-slate-200 bg-white px-2 text-xs"
                defaultValue=""
                onChange={(event) => {
                  if (event.target.value) {
                    onAddParticipant?.(event.target.value)
                    event.target.value = ''
                  }
                }}
              >
                <option value="">Add person...</option>
                {users
                  .filter(
                    (user) =>
                      !detail.participants.some((participant) => participant.userId === user.id)
                  )
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} · {user.email}
                    </option>
                  ))}
              </select>
              {detail.participants.map((participant) => (
                <button
                  key={participant.userId}
                  type="button"
                  title={`Remove ${participant.name}`}
                  onClick={() => onRemoveParticipant?.(participant.userId)}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                >
                  {participant.name}
                  <span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      {canManageMeeting ? (
        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-extrabold text-slate-800">Attendee review status</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Review each attendee&apos;s response before finalising the meeting.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700">
                {confirmationParticipants.length} attendee
                {confirmationParticipants.length === 1 ? '' : 's'}
              </span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-extrabold text-amber-700">
                Overall: {`${reviewedParticipantCount}/${confirmationParticipants.length} reviewed`}
              </span>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {confirmationParticipants.map((participant) => {
              const status =
                !isFutureMeeting ||
                confirmedParticipantIds.includes(participant.userId) ||
                (participant.userId === currentUserId && isAttendeeConfirmed)
                  ? 'confirmed'
                  : 'not_confirmed'
              const isPending = status === 'not_confirmed'
              return (
                <div
                  key={participant.userId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-xs font-bold text-slate-700">
                    {participant.name}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-extrabold capitalize ${
                      isPending ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {isPending ? 'Not reviewed' : 'Reviewed'}
                  </span>
                </div>
              )
            })}
            {confirmationParticipants.length === 0 ? (
              <p className="text-xs font-semibold text-slate-500">No attendees to review yet.</p>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setIsConfirmationSent(true)
                setShowReviewSentPopup(true)
                if (confirmationStorageKey) {
                  window.localStorage.setItem(`${confirmationStorageKey}:sent`, '1')
                  const sentIds = JSON.parse(
                    window.localStorage.getItem('meeting-confirmation-sent') || '[]'
                  )
                  const nextIds = [...new Set([...sentIds, detail.meeting.id])]
                  window.localStorage.setItem('meeting-confirmation-sent', JSON.stringify(nextIds))
                }
              }}
              className="rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-700"
            >
              {isConfirmationSent ? 'Sent review request' : 'Send review request'}
            </button>
            {isMeetingOwner ? (
              <MeetingChangeRequestInbox
                {...changeRequestInbox}
                onRefresh={onRefreshChangeRequests}
                onMarkRead={onMarkChangeRequestRead}
                openOnArrival={openChangeRequestInbox}
                onClose={onCloseChangeRequestInbox}
              />
            ) : null}
          </div>
          {showReviewSentPopup ? (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-xs font-extrabold text-emerald-700">
              Review requests are sent
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="mt-6 space-y-4">
        <div id="meeting-information" className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-2xl font-semibold text-slate-700">Meeting Information</h2>
          <p className="mt-1 text-sm text-slate-500">
            {canManageMeeting
              ? 'Title and location/meeting link save when the field loses focus.'
              : 'Meeting information is read-only for participants.'}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {canEditMeetingTag ? (
              <MeetingTagEditor
                key={detail.meeting.id}
                currentTag={detail.meeting.tag}
                tags={tags}
                onSave={onSaveMeetingTag}
              />
            ) : (
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Meeting Tag
                </span>
                <input
                  value={detail.meeting.tag || 'Untagged'}
                  disabled
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 text-slate-500"
                />
              </label>
            )}
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

        <div id="meeting-agenda" className="rounded-2xl border border-slate-200 bg-white p-4">
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

        <div id="meeting-minutes" className="rounded-2xl border border-slate-200 bg-white p-4">
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
                      <button
                        type="button"
                        disabled={isGeneratingMinutes}
                        onClick={async () => {
                          setIsGeneratingMinutes(true)
                          try {
                            await onGenerateMinutesFromRecording?.()
                          } finally {
                            setIsGeneratingMinutes(false)
                          }
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isGeneratingMinutes ? 'Running...' : 'Text generation'}
                      </button>
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
                <TranscriptPanel transcript={detail.transcript} />
                <AnalysisSummaryPanel
                  review={analysisReview}
                  canApply={canManageMeeting}
                  applyState={applyMinutesState}
                  onApply={onApplyGeneratedMinutes}
                  onDismissApplyState={onDismissApplyMinutesState}
                />
                <AnalysisActionItemsPanel
                  review={analysisReview}
                  canReview={canManageMeeting}
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

        <div id="meeting-action-items" className="rounded-2xl border border-slate-200 bg-white p-4">
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

        <div id="meeting-files" className="rounded-2xl border border-slate-200 bg-white p-4">
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

        {canUpdateMeetingStatus && detail.meeting.status === 'scheduled' ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold text-slate-900">Update meeting status</p>
              <p className="mt-1 text-sm text-slate-600">
                Only the meeting owner can complete or cancel this meeting.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={Boolean(pendingMeetingStatus)}
                onClick={() => updateStatus('cancelled')}
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 text-sm font-extrabold text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-rose-300"
              >
                <CircleX className="h-4 w-4" aria-hidden="true" />
                {pendingMeetingStatus === 'cancelled' ? 'Updating...' : 'Mark as cancelled'}
              </button>
              <button
                type="button"
                disabled={Boolean(pendingMeetingStatus)}
                onClick={() => updateStatus('completed')}
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {pendingMeetingStatus === 'completed' ? 'Updating...' : 'Mark as completed'}
              </button>
            </div>
          </div>
        ) : null}
        {!canManageMeeting ? (
          <div className="flex flex-wrap justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {canRequestChange ? (
              <button
                type="button"
                onClick={() => setChangeRequestDialog(true)}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-extrabold text-amber-800 shadow-sm transition hover:bg-amber-100"
              >
                Request to change
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setIsAttendeeConfirmed((confirmed) => {
                  const next = !confirmed
                  setConfirmedParticipantIds((ids) =>
                    next
                      ? [...new Set([...ids, currentUserId])]
                      : ids.filter((id) => id !== currentUserId)
                  )
                  if (confirmationStorageKey) {
                    window.localStorage.setItem(
                      `${confirmationStorageKey}:confirmed`,
                      next ? '1' : '0'
                    )
                  }
                  return next
                })
              }}
              className={`rounded-lg px-3.5 py-2 text-xs font-extrabold text-white shadow-sm transition ${
                isAttendeeConfirmed
                  ? 'bg-slate-600 hover:bg-slate-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {isAttendeeConfirmed ? 'Set as not reviewed' : 'Mark meeting detail as reviewed'}
            </button>
          </div>
        ) : null}
      </div>
      {changeRequestDialog ? (
        <MeetingChangeRequestDialog
          onSubmit={onRequestMeetingChange}
          onClose={() => setChangeRequestDialog(null)}
        />
      ) : null}
    </section>
  )
}
