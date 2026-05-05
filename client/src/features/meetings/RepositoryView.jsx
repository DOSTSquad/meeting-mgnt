import { useState } from 'react'

import { formatDateOnly } from '../../utils/date.js'

const projectPalette = [
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
  const filteredMeetings = meetings.filter((meeting) => {
    if (statusFilter !== 'all' && meeting.status !== statusFilter) {
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
    .slice(0, 6)
  const projectGroups = Array.from(
    meetings.reduce((groups, meeting) => {
      const key = meeting.tag || 'General'
      const current = groups.get(key) || []
      current.push(meeting)
      groups.set(key, current)
      return groups
    }, new Map())
  ).slice(0, 4)
  const upcomingCount = filteredMeetings.filter(
    (meeting) => new Date(meeting.endsAt).getTime() >= currentTimestamp
  ).length

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">
          Meeting Repository
        </h1>
        <p className="mt-1 text-sm text-slate-500">Manage and access all your meeting documents</p>
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
      </div>

      <div className="flex min-h-24 flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-100 px-4 py-6 text-center">
        <p className="text-sm font-bold text-slate-700">Drag and drop files here or browse</p>
        <p className="mt-1 text-xs text-slate-500">Upload meeting documents, agendas, or minutes</p>
      </div>

      <div>
        <h2 className="text-base font-bold text-slate-800">Projects</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {projectGroups.map(([tag, items], index) => {
            const palette = projectPalette[index % projectPalette.length]

            return (
              <button
                key={tag}
                type="button"
                onClick={() => onSearch(tag)}
                className={`rounded-lg border ${palette.border} bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm`}
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-md ${palette.bg} text-xs font-bold text-white`}
                >
                  {tag.slice(0, 1).toUpperCase()}
                </span>
                <p className="mt-3 truncate text-sm font-bold text-slate-800">{tag}</p>
                <p className="mt-1 text-xs text-slate-500">{items.length} meetings</p>
              </button>
            )
          })}
          {projectGroups.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
              No meeting projects yet.
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <h2 className="text-base font-bold text-slate-800">All Documents</h2>
        <div className="mt-3 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {recentDocuments.map((meeting, index) => {
            const palette = documentPalette[index % documentPalette.length]
            const participantNames = meetingParticipantsByMeeting[meeting.id] || []

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
                  <span className="mt-1 block truncate text-xs font-semibold text-blue-600">
                    {meeting.tag || participantNames.slice(0, 2).join(', ') || meeting.status}
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
