import { useState } from 'react'

import { formatDateOnly } from '../../utils/date.js'

const tagPalette = [
  { bg: 'bg-blue-500', text: 'text-blue-600', border: 'border-blue-100' },
  { bg: 'bg-purple-500', text: 'text-purple-600', border: 'border-purple-100' },
  { bg: 'bg-emerald-500', text: 'text-emerald-600', border: 'border-emerald-100' },
  { bg: 'bg-orange-500', text: 'text-orange-600', border: 'border-orange-100' },
]

const documentPalette = [
  { bg: 'bg-red-50', text: 'text-red-600' },
  { bg: 'bg-orange-50', text: 'text-orange-600' },
  { bg: 'bg-emerald-50', text: 'text-emerald-600' },
]

const getMeetingTime = (value) =>
  new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

const getFileCount = (meeting) => Number(meeting.fileCount ?? 0)

const getTagLabel = (meeting) => meeting.tag || 'Untagged'

const getTagKey = (meeting) => meeting.tagId || `tag:${getTagLabel(meeting)}`

const formatLatestMeeting = (timestamp) => {
  if (!timestamp) {
    return 'No meetings yet'
  }

  return `Latest ${formatDateOnly(timestamp)}`
}

export const RepositoryView = ({
  meetings,
  meetingParticipantsByMeeting,
  search,
  onSearch,
  onOpenMeeting,
}) => {
  const keyword = search.trim().toLowerCase()
  const [currentTimestamp] = useState(() => Date.now())
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedTagKey, setSelectedTagKey] = useState('all')
  const tagGroups = Array.from(
    meetings
      .reduce((groups, meeting) => {
        const key = getTagKey(meeting)
        const current = groups.get(key) || {
          key,
          label: getTagLabel(meeting),
          meetings: [],
          fileCount: 0,
          latestTimestamp: 0,
        }

        current.meetings.push(meeting)
        current.fileCount += getFileCount(meeting)
        current.latestTimestamp = Math.max(
          current.latestTimestamp,
          new Date(meeting.startsAt).getTime()
        )
        groups.set(key, current)
        return groups
      }, new Map())
      .values()
  ).sort((first, second) => {
    if (second.fileCount !== first.fileCount) {
      return second.fileCount - first.fileCount
    }

    return second.meetings.length - first.meetings.length
  })
  const totalFileCount = meetings.reduce((total, meeting) => total + getFileCount(meeting), 0)
  const latestMeetingTimestamp = meetings.reduce(
    (latest, meeting) => Math.max(latest, new Date(meeting.startsAt).getTime()),
    0
  )
  const tagCards = [
    {
      key: 'all',
      label: 'All Meetings',
      meetings,
      fileCount: totalFileCount,
      latestTimestamp: latestMeetingTimestamp,
    },
    ...tagGroups.slice(0, 3),
  ]
  const filteredMeetings = meetings.filter((meeting) => {
    if (statusFilter !== 'all' && meeting.status !== statusFilter) {
      return false
    }

    if (selectedTagKey !== 'all' && getTagKey(meeting) !== selectedTagKey) {
      return false
    }

    if (!keyword) {
      return true
    }

    const participantNames = meetingParticipantsByMeeting[meeting.id] || []
    const searchable = [meeting.title, meeting.tag || '', ...participantNames]
      .join(' ')
      .toLowerCase()
    return searchable.includes(keyword)
  })
  const recentDocuments = filteredMeetings
    .slice()
    .sort(
      (first, second) => new Date(second.startsAt).getTime() - new Date(first.startsAt).getTime()
    )
    .slice(0, 9)
  const upcomingCount = filteredMeetings.filter(
    (meeting) => new Date(meeting.endsAt).getTime() >= currentTimestamp
  ).length
  const selectedTagLabel =
    tagCards.find((card) => card.key === selectedTagKey)?.label ||
    tagGroups.find((group) => group.key === selectedTagKey)?.label ||
    'Meeting Tag'

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">
          Meeting Repository
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Browse meeting files through the meetings and tags they belong to
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50 p-2 sm:flex-row sm:items-center">
        <label className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-500">
          <span className="text-xs font-bold text-slate-400">S</span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search meetings..."
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        </label>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-300"
        >
          <option value="all">All Meetings</option>
          <option value="scheduled">Scheduled</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="archived">Archived</option>
        </select>
        <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">
          <span className="text-slate-400">D</span>
          <span>{upcomingCount} upcoming</span>
        </div>
        {selectedTagKey !== 'all' ? (
          <button
            type="button"
            onClick={() => setSelectedTagKey('all')}
            className="h-9 rounded-lg border border-blue-100 bg-blue-50 px-3 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
          >
            Clear tag
          </button>
        ) : null}
      </div>

      <div className="flex min-h-24 flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-100 px-4 py-6 text-center">
        <p className="text-sm font-bold text-slate-700">Drag and drop files here or browse</p>
        <p className="mt-1 text-xs text-slate-500">
          Upload files from a meeting detail page so every document stays tied to its meeting
        </p>
      </div>

      <div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-800">Meeting Tags</h2>
            <p className="mt-1 text-xs text-slate-500">
              Tags group meetings; files stay attached to each meeting.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-400">{totalFileCount} files total</span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tagCards.map((tag, index) => {
            const palette = tagPalette[index % tagPalette.length]
            const isSelected = selectedTagKey === tag.key

            return (
              <button
                key={tag.key}
                type="button"
                onClick={() => setSelectedTagKey(tag.key)}
                className={`rounded-lg border bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
                  isSelected ? 'border-blue-300 ring-2 ring-blue-100' : palette.border
                }`}
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-md ${palette.bg} text-xs font-bold text-white`}
                >
                  {tag.label.slice(0, 1).toUpperCase()}
                </span>
                <p className="mt-3 truncate text-sm font-bold text-slate-800">{tag.label}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {tag.meetings.length} meetings / {tag.fileCount} files
                </p>
                <p className={`mt-2 text-xs font-semibold ${palette.text}`}>
                  {formatLatestMeeting(tag.latestTimestamp)}
                </p>
              </button>
            )
          })}
          {tagCards.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
              No meeting tags yet.
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-800">Meetings & Files</h2>
            <p className="mt-1 text-xs text-slate-500">
              {selectedTagKey === 'all'
                ? 'Open a meeting to manage its files, minutes, and participants.'
                : `Showing meetings tagged ${selectedTagLabel}.`}
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-400">
            {recentDocuments.length} shown
          </span>
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {recentDocuments.map((meeting, index) => {
            const palette = documentPalette[index % documentPalette.length]
            const participantNames = meetingParticipantsByMeeting[meeting.id] || []
            const fileCount = getFileCount(meeting)

            return (
              <button
                key={meeting.id}
                type="button"
                onClick={() => onOpenMeeting(meeting.id)}
                className="flex min-h-24 gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-blue-200 hover:shadow-sm"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${palette.bg} ${palette.text} text-xs font-bold`}
                >
                  M
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-slate-800">
                    {meeting.title}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {formatDateOnly(meeting.startsAt)} at {getMeetingTime(meeting.startsAt)}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-600">
                      {meeting.tag || 'Untagged'}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                      {fileCount} files
                    </span>
                  </span>
                  <span className="mt-2 block truncate text-xs text-slate-500">
                    {participantNames.slice(0, 2).join(', ') || meeting.status}
                  </span>
                </span>
              </button>
            )
          })}
          {recentDocuments.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
              No meetings match the current filters.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
