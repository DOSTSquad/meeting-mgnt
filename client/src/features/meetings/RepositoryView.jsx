import { useState } from 'react'

import { formatDateOnly } from '../../utils/date.js'

export const RepositoryView = ({ meetings, meetingParticipantsByMeeting, search, onSearch, onOpenMeeting }) => {
  const keyword = search.trim().toLowerCase()
  const [currentTimestamp] = useState(() => Date.now())
  const filteredMeetings = meetings.filter((meeting) => {
    if (!keyword) {
      return true
    }

    const participantNames = meetingParticipantsByMeeting[meeting.id] || []
    const searchable = [meeting.title, meeting.tag || '', ...participantNames].join(' ').toLowerCase()
    return searchable.includes(keyword)
  })
  const upcomingMeetings = filteredMeetings.filter(
    (meeting) => new Date(meeting.endsAt).getTime() >= currentTimestamp
  )
  const endedMeetings = filteredMeetings.filter(
    (meeting) => new Date(meeting.endsAt).getTime() < currentTimestamp
  )

  const renderMeetingRows = (items) =>
    items.map((meeting) => {
      const date = new Date(meeting.startsAt)
      const time = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      }).format(date)

      return (
        <tr
          key={meeting.id}
          className="cursor-pointer text-sm text-slate-700 hover:bg-slate-50"
          onClick={() => onOpenMeeting(meeting.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onOpenMeeting(meeting.id)
            }
          }}
          role="button"
          tabIndex={0}
        >
          <td className="border-b border-slate-100 px-3 py-3 font-medium text-blue-700">{meeting.title}</td>
          <td className="border-b border-slate-100 px-3 py-3">{formatDateOnly(meeting.startsAt)}</td>
          <td className="border-b border-slate-100 px-3 py-3">{time}</td>
          <td className="border-b border-slate-100 px-3 py-3">
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-500">
              {meeting.tag || '-'}
            </span>
          </td>
        </tr>
      )
    })

  return (
    <section>
      <h1 className="text-5xl font-semibold text-slate-800">Meeting List</h1>
      <p className="mt-2 text-lg text-slate-500">Manage and access all your meeting documents</p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search meeting name, participant, or tag..."
          className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
        />

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-700">Upcoming Meetings</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {upcomingMeetings.length}
              </span>
            </div>
            <div className="overflow-auto">
              <table className="min-w-full border-separate border-spacing-0">
                <thead>
                  <tr className="bg-slate-100 text-left text-sm text-slate-600">
                    <th className="rounded-l-lg px-3 py-2">Meeting Title</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Time</th>
                    <th className="rounded-r-lg px-3 py-2">Tag</th>
                  </tr>
                </thead>
                <tbody>{renderMeetingRows(upcomingMeetings)}</tbody>
              </table>
              {upcomingMeetings.length === 0 ? (
                <p className="p-3 text-sm text-slate-500">No upcoming meetings.</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-700">Ended Meetings</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {endedMeetings.length}
              </span>
            </div>
            <div className="overflow-auto">
              <table className="min-w-full border-separate border-spacing-0">
                <thead>
                  <tr className="bg-slate-100 text-left text-sm text-slate-600">
                    <th className="rounded-l-lg px-3 py-2">Meeting Title</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Time</th>
                    <th className="rounded-r-lg px-3 py-2">Tag</th>
                  </tr>
                </thead>
                <tbody>{renderMeetingRows(endedMeetings)}</tbody>
              </table>
              {endedMeetings.length === 0 ? (
                <p className="p-3 text-sm text-slate-500">No ended meetings yet.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
