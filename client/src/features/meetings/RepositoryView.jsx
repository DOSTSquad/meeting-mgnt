import { useState } from 'react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  Search,
  Users,
} from 'lucide-react'

import { PageHeader } from '../../components/layout/PageHeader.jsx'
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

const getFileNames = (meeting) => (Array.isArray(meeting.fileNames) ? meeting.fileNames : [])

const getTagLabel = (meeting) => meeting.tag || 'Untagged'

const getTagKey = (meeting) => meeting.tagId || `tag:${getTagLabel(meeting)}`

const formatLatestMeeting = (timestamp) => {
  if (!timestamp) {
    return 'No meetings yet'
  }

  return `Latest ${formatDateOnly(timestamp)}`
}

const formatStatus = (status) => status.replaceAll('_', ' ')

const getMatchingFileNames = (meeting, keyword) => {
  if (!keyword) {
    return []
  }

  return getFileNames(meeting).filter((fileName) => fileName.toLowerCase().includes(keyword))
}

const statusStyles = {
  scheduled: 'bg-blue-50 text-blue-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-rose-50 text-rose-700',
  archived: 'bg-slate-100 text-slate-600',
}

const PAGE_SIZE = 6

export const RepositoryView = ({ meetings, search, onSearch, onOpenMeeting }) => {
  const keyword = search.trim().toLowerCase()
  const [currentTimestamp] = useState(() => Date.now())
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedTagKey, setSelectedTagKey] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
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
  const tagFilterOptions = [
    {
      key: 'all',
      label: 'All Meetings',
      meetings,
      fileCount: totalFileCount,
    },
    ...tagGroups,
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
    const searchable = [
      meeting.title,
      meeting.tag || '',
      ...participantNames,
      ...getFileNames(meeting),
    ]
      .join(' ')
      .toLowerCase()
    return searchable.includes(keyword)
  })
  const sortedMeetings = filteredMeetings.slice().sort((first, second) => {
    return new Date(second.startsAt).getTime() - new Date(first.startsAt).getTime()
  })
  const totalPages = Math.max(1, Math.ceil(sortedMeetings.length / PAGE_SIZE))
  const visiblePage = Math.min(currentPage, totalPages)
  const currentPageStartIndex = (visiblePage - 1) * PAGE_SIZE
  const shownMeetings = sortedMeetings.slice(
    currentPageStartIndex,
    currentPageStartIndex + PAGE_SIZE
  )
  const shownStart = sortedMeetings.length === 0 ? 0 : currentPageStartIndex + 1
  const shownEnd = Math.min(currentPageStartIndex + shownMeetings.length, sortedMeetings.length)
  const upcomingCount = filteredMeetings.filter(
    (meeting) => new Date(meeting.endsAt).getTime() >= currentTimestamp
  ).length
  const selectedTagLabel =
    tagCards.find((card) => card.key === selectedTagKey)?.label ||
    tagGroups.find((group) => group.key === selectedTagKey)?.label ||
    'Meeting Tag'

  const handleSearchChange = (value) => {
    setCurrentPage(1)
    onSearch(value)
  }

  const handleStatusFilterChange = (value) => {
    setCurrentPage(1)
    setStatusFilter(value)
  }

  const handleTagSelect = (tagKey) => {
    setCurrentPage(1)
    setSelectedTagKey(tagKey)
  }

  return (
    <section className="min-w-0 space-y-6">
      <PageHeader
        eyebrow="Meeting library"
        title="Meeting Repository"
        description="Browse meeting files through the meetings and tags they belong to."
        icon={FolderOpen}
        accent="violet"
      />

      <div className="flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50 p-2 sm:flex-row sm:items-center">
        <label className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-500">
          <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Search meeting, tag, or file name..."
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        </label>
        <select
          value={statusFilter}
          onChange={(event) => handleStatusFilterChange(event.target.value)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-300"
        >
          <option value="all">All Meetings</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="archived">Archived</option>
        </select>
        <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">
          <CalendarDays className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <span>{upcomingCount} upcoming</span>
        </div>
        {selectedTagKey !== 'all' ? (
          <button
            type="button"
            onClick={() => handleTagSelect('all')}
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
        <label className="mt-3 block sm:hidden">
          <span className="sr-only">Filter by meeting tag</span>
          <select
            value={selectedTagKey}
            onChange={(event) => handleTagSelect(event.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-300"
          >
            {tagFilterOptions.map((tag) => (
              <option key={tag.key} value={tag.key}>
                {tag.label} ({tag.meetings.length} meetings / {tag.fileCount} files)
              </option>
            ))}
          </select>
        </label>
        <div className="mt-3 hidden gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-4">
          {tagCards.map((tag, index) => {
            const palette = tagPalette[index % tagPalette.length]
            const isSelected = selectedTagKey === tag.key

            return (
              <button
                key={tag.key}
                type="button"
                onClick={() => handleTagSelect(tag.key)}
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
            {shownStart}-{shownEnd} of {sortedMeetings.length} shown
          </span>
        </div>
        <div className="mt-3 min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
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
              const matchingFileNames = getMatchingFileNames(meeting, keyword)
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
                  className="grid min-w-0 w-full gap-3 px-4 py-4 text-left transition hover:bg-blue-50/40 lg:grid-cols-[minmax(0,1.7fr)_10rem_8rem_6rem_7rem_2rem] lg:items-center lg:gap-4"
                >
                  <span className="flex min-w-0 gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-xs font-bold text-blue-600">
                      <CalendarDays className="h-4 w-4" aria-hidden="true" />
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
                      {matchingFileNames.length > 0 ? (
                        <span className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                          {matchingFileNames.slice(0, 2).map((fileName) => (
                            <span
                              key={fileName}
                              className="inline-flex max-w-full items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"
                              title={fileName}
                            >
                              <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span className="truncate">{fileName}</span>
                            </span>
                          ))}
                          {matchingFileNames.length > 2 ? (
                            <span className="text-xs font-semibold text-slate-400">
                              +{matchingFileNames.length - 2} more
                            </span>
                          ) : null}
                        </span>
                      ) : null}
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

                  <span className="flex min-w-0 flex-wrap items-center gap-2 lg:hidden">
                    <span className="inline-flex max-w-full items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                      <span className="truncate">{meeting.tag || 'Untagged'}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                      <FileText className="h-4 w-4 text-slate-400" />
                      {fileCount}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusClass}`}
                    >
                      {formatStatus(meeting.status)}
                    </span>
                  </span>

                  <span className="hidden lg:block">
                    <span className="inline-flex max-w-full items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                      <span className="truncate">{meeting.tag || 'Untagged'}</span>
                    </span>
                  </span>

                  <span className="hidden items-center gap-2 text-xs font-bold text-slate-600 lg:flex">
                    <FileText className="h-4 w-4 text-slate-400" />
                    {fileCount}
                  </span>

                  <span className="hidden lg:block">
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
        {sortedMeetings.length > PAGE_SIZE ? (
          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold text-slate-500">
              Page {visiblePage} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={visiblePage === 1}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:bg-white disabled:hover:text-slate-600"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Prev
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={visiblePage === totalPages}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:bg-white disabled:hover:text-slate-600"
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
