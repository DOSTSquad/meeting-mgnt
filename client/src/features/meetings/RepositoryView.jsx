import { useState } from 'react'
import { CalendarDays, ChevronRight, FileText, Users } from 'lucide-react'

import { formatDateOnly } from '../../utils/date.js'

const tagPalette = [
  { bg: 'bg-blue-500', text: 'text-blue-600', border: 'border-blue-100' },
  { bg: 'bg-purple-500', text: 'text-purple-600', border: 'border-purple-100' },
  { bg: 'bg-emerald-500', text: 'text-emerald-600', border: 'border-emerald-100' },
  { bg: 'bg-orange-500', text: 'text-orange-600', border: 'border-orange-100' },
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

const formatStatus = (status) => status.replaceAll('_', ' ')

const statusStyles = {
  scheduled: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-amber-50 text-amber-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-rose-50 text-rose-700',
  archived: 'bg-slate-100 text-slate-600',
}

export const RepositoryView = ({
  meetings,
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

    const participantNames = meeting.participantNames || []
    const searchable = [meeting.title, meeting.tag || '', ...participantNames]
      .join(' ')
      .toLowerCase()
    return searchable.includes(keyword)
  })
  const shownMeetings = filteredMeetings
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
          <span className="text-xs font-semibold text-slate-400">{shownMeetings.length} shown</span>
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="hidden grid-cols-[minmax(0,1.7fr)_10rem_8rem_6rem_7rem_2rem] items-center gap-4 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-400 lg:grid">
            <span>Meeting</span>
            <span>Date</span>
            <span>Tag</span>
            <span>Files</span>
            <span>Status</span>
            <span />
          </div>
          <div className="divide-y divide-slate-100">
            {shownMeetings.map((meeting) => {
              const participantNames = meeting.participantNames || []
              const fileCount = getFileCount(meeting)
              const participantOverflow = Math.max(
                Number(meeting.participantCount || 0) - participantNames.slice(0, 3).length,
                0
              )
              const statusClass = statusStyles[meeting.status] || statusStyles.archived

              return (
                <button
                  key={meeting.id}
                  type="button"
                  onClick={() => onOpenMeeting(meeting.id)}
                  className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-blue-50/40 lg:grid-cols-[minmax(0,1.7fr)_10rem_8rem_6rem_7rem_2rem] lg:items-center lg:gap-4"
                >
                  <span className="flex min-w-0 gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-xs font-bold text-blue-600">
                      M
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-slate-800">
                        {meeting.title}
                      </span>
                      <span className="mt-1 flex min-w-0 items-center gap-1 text-xs text-slate-500">
                        <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">
                          {participantNames.slice(0, 3).join(', ') || 'No attendees listed'}
                          {participantOverflow > 0 ? ` +${participantOverflow}` : ''}
                        </span>
                      </span>
                    </span>
                  </span>

                  <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <CalendarDays className="h-4 w-4 text-slate-400" />
                    <span>
                      {formatDateOnly(meeting.startsAt)}
                      <span className="text-slate-400"> at </span>
                      {getMeetingTime(meeting.startsAt)}
                    </span>
                  </span>

                  <span>
                    <span className="inline-flex max-w-full items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                      <span className="truncate">{meeting.tag || 'Untagged'}</span>
                    </span>
                  </span>

                  <span className="flex items-center gap-2 text-xs font-bold text-slate-600">
                    <FileText className="h-4 w-4 text-slate-400" />
                    {fileCount}
                  </span>

                  <span>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusClass}`}
                    >
                      {formatStatus(meeting.status)}
                    </span>
                  </span>

                  <ChevronRight className="hidden h-4 w-4 justify-self-end text-slate-300 lg:block" />
                </button>
              )
            })}
            {shownMeetings.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No meetings match the current filters.</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
