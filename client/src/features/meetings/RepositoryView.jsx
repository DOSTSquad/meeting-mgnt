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
import { formatMeetingStatus, getMeetingDisplayStatus } from '../../utils/meetingStatus.js'
import { MeetingAiStatusIcon } from './MeetingAiStatusIcon.jsx'

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

const getMeetingDateValue = (value) => {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

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

const getMatchingFileNames = (meeting, keyword) => {
  if (!keyword) {
    return []
  }

  return getFileNames(meeting).filter((fileName) => fileName.toLowerCase().includes(keyword))
}

const statusStyles = {
  scheduled: 'bg-blue-50 text-blue-700',
  awaiting_completion: 'bg-amber-50 text-amber-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-rose-50 text-rose-700',
  archived: 'bg-slate-100 text-slate-600',
}

const PAGE_SIZE = 6
const TAG_PAGE_SIZE = 4

export const RepositoryView = ({
  meetings,
  search,
  onSearch,
  onOpenMeeting,
  title = 'Meeting Repository',
  description = 'Browse meeting files through the meetings and tags they belong to.',
}) => {
  const keyword = search.trim().toLowerCase()
  const [searchDraft, setSearchDraft] = useState(search)
  const [statusDraft, setStatusDraft] = useState('all')
  const [tagDraft, setTagDraft] = useState('all')
  const [dateDraft, setDateDraft] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedTagKey, setSelectedTagKey] = useState('all')
  const [dateFilter, setDateFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [currentTagPage, setCurrentTagPage] = useState(1)
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
  ).sort((first, second) =>
    first.label.localeCompare(second.label, undefined, { sensitivity: 'base', numeric: true })
  )
  const totalFileCount = meetings.reduce((total, meeting) => total + getFileCount(meeting), 0)
  const latestMeetingTimestamp = meetings.reduce(
    (latest, meeting) => Math.max(latest, new Date(meeting.startsAt).getTime()),
    0
  )
  const allTagCards = [
    {
      key: 'all',
      label: 'All Meetings',
      meetings,
      fileCount: totalFileCount,
      latestTimestamp: latestMeetingTimestamp,
    },
    ...tagGroups,
  ]
  const totalTagPages = Math.max(1, Math.ceil(allTagCards.length / TAG_PAGE_SIZE))
  const visibleTagPage = Math.min(currentTagPage, totalTagPages)
  const tagPageStartIndex = (visibleTagPage - 1) * TAG_PAGE_SIZE
  const tagCards = allTagCards.slice(tagPageStartIndex, tagPageStartIndex + TAG_PAGE_SIZE)
  const tagFilterOptions = [
    {
      key: 'all',
      label: 'All Tags',
      meetings,
      fileCount: totalFileCount,
    },
    ...tagGroups,
  ]
  const filteredMeetings = meetings.filter((meeting) => {
    if (statusFilter !== 'all' && getMeetingDisplayStatus(meeting) !== statusFilter) {
      return false
    }

    if (selectedTagKey !== 'all' && getTagKey(meeting) !== selectedTagKey) {
      return false
    }

    if (dateFilter && getMeetingDateValue(meeting.startsAt) !== dateFilter) {
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
  const selectedTagLabel =
    allTagCards.find((card) => card.key === selectedTagKey)?.label || 'Meeting Tag'

  const handleSearchSubmit = (event) => {
    event.preventDefault()
    setCurrentPage(1)
    onSearch(searchDraft)
    setStatusFilter(statusDraft)
    setSelectedTagKey(tagDraft)
    setDateFilter(dateDraft)
    const tagIndex = allTagCards.findIndex((tag) => tag.key === tagDraft)
    if (tagIndex >= 0) {
      setCurrentTagPage(Math.floor(tagIndex / TAG_PAGE_SIZE) + 1)
    }
  }

  const handleTagSelect = (tagKey) => {
    setCurrentPage(1)
    setTagDraft(tagKey)
    setSelectedTagKey(tagKey)
    const tagIndex = allTagCards.findIndex((tag) => tag.key === tagKey)
    if (tagIndex >= 0) {
      setCurrentTagPage(Math.floor(tagIndex / TAG_PAGE_SIZE) + 1)
    }
  }

  return (
    <section className="min-w-0 space-y-6">
      <PageHeader
        eyebrow="Meeting library"
        title={title}
        description={description}
        icon={FolderOpen}
        accent="violet"
      />

      <form
        onSubmit={handleSearchSubmit}
        className="flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50 p-2 sm:flex-row sm:flex-wrap sm:items-center"
      >
        <label className="flex h-9 min-w-56 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-500">
          <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search meeting, tag, or file name..."
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        </label>
        <select
          value={statusDraft}
          onChange={(event) => setStatusDraft(event.target.value)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-300"
        >
          <option value="all">All Statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="awaiting_completion">Awaiting completion</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={tagDraft}
          onChange={(event) => setTagDraft(event.target.value)}
          aria-label="Filter by meeting tag"
          className="h-9 min-w-40 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-300"
        >
          {tagFilterOptions.map((tag) => (
            <option key={tag.key} value={tag.key}>
              {tag.label} ({tag.meetings.length})
            </option>
          ))}
        </select>
        <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">
          <CalendarDays className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <span className="sr-only">Filter by date</span>
          <input
            type="date"
            value={dateDraft}
            onChange={(event) => setDateDraft(event.target.value)}
            aria-label="Filter by date"
            className="bg-transparent text-xs font-semibold text-slate-700 outline-none"
          />
        </label>
        <button
          type="submit"
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-700"
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          Search
        </button>
      </form>

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
        {totalTagPages > 1 ? (
          <div className="mt-3 hidden items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 sm:flex">
            <p className="text-xs font-semibold text-slate-500">
              Tag page {visibleTagPage} of {totalTagPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentTagPage((page) => Math.max(1, page - 1))}
                disabled={visibleTagPage === 1}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Prev
              </button>
              <button
                type="button"
                onClick={() => setCurrentTagPage((page) => Math.min(totalTagPages, page + 1))}
                disabled={visibleTagPage === totalTagPages}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
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
              const displayStatus = getMeetingDisplayStatus(meeting)
              const participantNames = meeting.participantNames || []
              const fileCount = getFileCount(meeting)
              const matchingFileNames = getMatchingFileNames(meeting, keyword)
              const participantOverflow = Math.max(
                Number(meeting.participantCount || 0) - participantNames.slice(0, 3).length,
                0
              )
              const statusClass = statusStyles[displayStatus] || statusStyles.archived

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
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="min-w-0 truncate text-sm font-bold text-slate-800">
                          {meeting.title}
                        </span>
                        <MeetingAiStatusIcon status={meeting.aiStatus} />
                      </span>
                      <span className="mt-1 flex min-w-0 items-center gap-1 text-xs text-slate-500">
                        <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">
                          {participantNames.slice(0, 3).join(', ') || 'No attendees listed'}
                          {participantOverflow > 0 ? ` +${participantOverflow}` : ''}
                        </span>
                      </span>
                      <span className="mt-1 block truncate text-xs font-semibold text-blue-700">
                        Meeting owner: {meeting.ownerName || 'Unknown'}
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
                      {formatMeetingStatus(displayStatus)}
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
                      {formatMeetingStatus(displayStatus)}
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
