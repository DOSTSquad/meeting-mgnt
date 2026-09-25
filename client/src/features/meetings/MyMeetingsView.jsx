import { useState } from 'react'
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CircleX,
  Hourglass,
  LayoutList,
  Search,
  TrendingUp,
} from 'lucide-react'

import { PageHeader } from '../../components/layout/PageHeader.jsx'
import { getApiClient } from '../../lib/apiClient.js'
import { getMeetingDetail } from '../../services/meetingService.js'
import { formatMeetingStatus, getMeetingDisplayStatus } from '../../utils/meetingStatus.js'

const statusLabel = (status) => status.replaceAll('_', ' ')
const formatMeetingDate = (value) =>
  new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(value)
  )

const getProgressColor = (progress) => {
  if (progress <= 25) {
    return '#dc2626'
  }
  if (progress <= 50) return '#f97316'
  if (progress <= 75) return '#eab308'
  return '#16a34a'
}

const actionStatusStyles = {
  todo: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
}

const getMeetingProgress = (meetingId, actionItems) => {
  const meetingActionItems = actionItems.filter((item) => item.meetingId === meetingId)

  if (meetingActionItems.length === 0) {
    return 0
  }

  return Math.round(
    (meetingActionItems.filter((item) => item.status === 'completed').length /
      meetingActionItems.length) *
      100
  )
}

export const MyMeetingsView = ({
  meetings,
  currentUser,
  token,
  actionItems = [],
  onOpenMeeting,
}) => {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [dateFilter, setDateFilter] = useState('')
  const [loadedDetails, setLoadedDetails] = useState({})
  const [loadingDetails, setLoadingDetails] = useState({})
  const statusCounts = meetings.reduce(
    (counts, meeting) => {
      const status = getMeetingDisplayStatus(meeting)
      if (status in counts) counts[status] += 1
      return counts
    },
    { scheduled: 0, awaiting_completion: 0, completed: 0, cancelled: 0 }
  )
  const visibleMeetings = meetings
    .filter((meeting) => {
      const query = search.trim().toLowerCase()
      const meetingStatus = getMeetingDisplayStatus(meeting)
      const attendeeMatch = (meeting.participantNames || []).some((name) =>
        name.toLowerCase().includes(query)
      )
      const dateMatch =
        !dateFilter || new Date(meeting.startsAt).toISOString().slice(0, 10) === dateFilter
      return (
        dateMatch &&
        (!query ||
          meeting.title.toLowerCase().includes(query) ||
          meetingStatus.includes(query.replaceAll(' ', '_')) ||
          attendeeMatch)
      )
    })
    .sort((first, second) => {
      return new Date(second.startsAt).getTime() - new Date(first.startsAt).getTime()
    })

  const pageCount = Math.max(1, Math.ceil(visibleMeetings.length / 10))
  const currentPage = Math.min(page, pageCount)
  const pageStart = (currentPage - 1) * 10
  const pageMeetings = visibleMeetings.slice(pageStart, pageStart + 10)

  const loadMeetingOverview = async (meetingId) => {
    if (loadedDetails[meetingId] || loadingDetails[meetingId]) return
    setLoadingDetails((prev) => ({ ...prev, [meetingId]: true }))
    try {
      const detail = await getMeetingDetail(getApiClient(token), meetingId)
      setLoadedDetails((prev) => ({ ...prev, [meetingId]: detail }))
    } finally {
      setLoadingDetails((prev) => ({ ...prev, [meetingId]: false }))
    }
  }

  return (
    <section className="min-w-0 space-y-6">
      <PageHeader
        eyebrow="Owner workspace"
        title="Meeting Manager"
        description={`Overall view of meetings owned by ${currentUser?.name || 'you'}.`}
        icon={TrendingUp}
        accent="blue"
      />

      <div className="grid gap-3 rounded-2xl border border-blue-100 bg-blue-50/35 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(190px,auto)] sm:p-4">
        <label className="flex h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm shadow-blue-100/40">
          <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span className="sr-only">Search meetings or attendees</span>
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Search meeting or attendee..."
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
          />
        </label>
        <label className="flex h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm shadow-blue-100/40">
          <CalendarDays className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
          <span className="sr-only">Filter meetings by date</span>
          <input
            type="date"
            value={dateFilter}
            onChange={(event) => {
              setDateFilter(event.target.value)
              setPage(1)
            }}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-700 outline-none"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['Total meetings', meetings.length, LayoutList, 'text-blue-600 bg-blue-50'],
          ['Scheduled', statusCounts.scheduled, CalendarClock, 'text-blue-600 bg-blue-50'],
          [
            'Awaiting completion',
            statusCounts.awaiting_completion,
            Hourglass,
            'text-amber-600 bg-amber-50',
          ],
          ['Completed', statusCounts.completed, CalendarCheck, 'text-emerald-600 bg-emerald-50'],
          ['Cancelled', statusCounts.cancelled, CircleX, 'text-rose-600 bg-rose-50'],
        ].map(([label, value, icon, color]) => {
          const StatIcon = icon
          return (
            <article
              key={label}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
                <StatIcon className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="mt-3 text-3xl font-extrabold text-slate-900">{value}</p>
              <p className="text-xs font-bold text-slate-500">{label}</p>
            </article>
          )
        })}
      </div>

      <article className="rounded-3xl border border-white/80 bg-white/90 p-5 shadow-lg shadow-blue-100/60 backdrop-blur sm:p-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900">
              Meeting progress
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-500">
              A simple view of where each owned meeting stands.
            </p>
          </div>
          <span className="hidden rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 sm:inline-flex">
            {visibleMeetings.length ? pageStart + 1 : 0}–{pageStart + pageMeetings.length} of{' '}
            {visibleMeetings.length} meetings
          </span>
        </div>
        <div className="mt-5 space-y-3">
          {pageMeetings.map((meeting) => {
            const loadedActionItems = loadedDetails[meeting.id]?.actionItems
            const meetingActionItems =
              loadedActionItems || actionItems.filter((item) => item.meetingId === meeting.id)
            const progress = getMeetingProgress(meeting.id, meetingActionItems)
            const meetingStatus = getMeetingDisplayStatus(meeting)
            return (
              <details
                key={meeting.id}
                onToggle={(event) => event.currentTarget.open && loadMeetingOverview(meeting.id)}
                className="group rounded-2xl border border-slate-200/80 bg-white transition hover:border-blue-200 hover:shadow-md open:border-blue-300 open:bg-blue-50/20"
              >
                <summary className="cursor-pointer list-none p-4 [&::-webkit-details-marker]:hidden sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-extrabold text-slate-800">
                      {meeting.title}
                      <span className="ml-2 text-xs font-semibold text-slate-400">
                        {formatMeetingDate(meeting.startsAt)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs font-bold capitalize text-slate-500">
                      {formatMeetingStatus(meetingStatus)}
                      <span className="text-slate-400 transition group-open:rotate-180">⌄</span>
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100 shadow-inner">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${progress}%`,
                          background: getProgressColor(progress),
                        }}
                      />
                    </div>
                    <span
                      className="w-10 text-right text-xs font-extrabold"
                      style={{ color: getProgressColor(progress) }}
                    >
                      {progress}%
                    </span>
                  </div>
                </summary>
                <div className="border-t border-blue-100 bg-gradient-to-br from-blue-50/70 via-white to-white px-4 py-4 sm:px-5">
                  {loadingDetails[meeting.id] ? (
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                      Loading meeting overview...
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div className="rounded-xl border border-white bg-white/80 px-3 py-2 shadow-sm">
                          <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
                            Status
                          </p>
                          <p className="mt-1 text-sm font-extrabold capitalize text-blue-700">
                            {formatMeetingStatus(meetingStatus)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-white bg-white/80 px-3 py-2 shadow-sm">
                          <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
                            Progress
                          </p>
                          <p className="mt-1 text-sm font-extrabold text-slate-800">
                            {progress}% complete
                          </p>
                        </div>
                        <div className="rounded-xl border border-white bg-white/80 px-3 py-2 shadow-sm">
                          <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
                            Action items
                          </p>
                          <p className="mt-1 text-sm font-extrabold text-slate-800">
                            {meetingActionItems.length} assigned
                          </p>
                        </div>
                      </div>
                      <div className="rounded-xl border border-blue-100 bg-white/80 p-3">
                        <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
                          Meeting summary
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          {loadedDetails[meeting.id]?.minutes?.content ||
                            meeting.description ||
                            'No summary available yet.'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
                          Assigned action items
                        </p>
                        {meetingActionItems.length ? (
                          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                            {meetingActionItems.map((item) => (
                              <li
                                key={item.id}
                                className="flex min-w-0 items-start gap-2.5 rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm"
                              >
                                <span
                                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-black ${item.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : item.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}
                                >
                                  {item.status === 'completed'
                                    ? '✓'
                                    : item.status === 'in_progress'
                                      ? '→'
                                      : '•'}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-extrabold text-slate-700">
                                    {item.title}
                                  </span>
                                  <span className="mt-1 block truncate text-[10px] font-medium text-slate-400">
                                    {item.assigneeName || 'Unassigned'}
                                  </span>
                                </span>
                                <span
                                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold capitalize ${actionStatusStyles[item.status] || actionStatusStyles.todo}`}
                                >
                                  {statusLabel(item.status)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-xs text-slate-400">No action items assigned.</p>
                        )}
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenMeeting(meeting.id)}
                    className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-xs font-extrabold text-white transition hover:bg-blue-700"
                  >
                    See the detail
                  </button>
                </div>
              </details>
            )
          })}
          {visibleMeetings.length === 0 ? (
            <p className="text-sm text-slate-500">No matching meetings found.</p>
          ) : null}
        </div>
        {pageCount > 1 ? (
          <nav
            aria-label="Meeting owner pagination"
            className="mt-5 flex items-center justify-between gap-3 border-t border-slate-200 pt-4"
          >
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs font-semibold text-slate-500" aria-live="polite">
              Page {currentPage} of {pageCount}
            </span>
            <button
              type="button"
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </nav>
        ) : null}
      </article>
    </section>
  )
}
