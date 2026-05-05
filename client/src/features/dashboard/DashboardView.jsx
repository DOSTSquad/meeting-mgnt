import { formatDateOnly, formatDateTime } from '../../utils/date.js'

export const DashboardView = ({ data, onOpenCreateModal, onOpenMeeting, onOpenMeetingRequest }) => (
  <section className="space-y-6">
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Overview</p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-800 lg:text-5xl">
            Dashboard
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Welcome back! Here&apos;s what&apos;s happening today.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onOpenCreateModal}
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            + New Meeting
          </button>
        </div>
      </div>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs text-slate-500">Recent Meetings</p>
        <p className="mt-1 text-3xl font-semibold text-slate-800">
          {data?.recentMeetings?.length || 0}
        </p>
      </article>
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs text-slate-500">Pending Requests</p>
        <p className="mt-1 text-3xl font-semibold text-slate-800">
          {data?.pendingMeetingRequests?.length || 0}
        </p>
      </article>
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs text-slate-500">My Action Items</p>
        <p className="mt-1 text-3xl font-semibold text-slate-800">
          {data?.myActionItems?.length || 0}
        </p>
      </article>
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs text-slate-500">Pending RSVP</p>
        <p className="mt-1 text-3xl font-semibold text-slate-800">
          {data?.pendingRsvpMeetings?.length || 0}
        </p>
      </article>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-slate-700">Recent Meetings</h2>
        <div className="space-y-3">
          {(data?.recentMeetings ?? []).map((meeting) => (
            <button
              key={meeting.id}
              type="button"
              onClick={() => onOpenMeeting(meeting.id)}
              className="block w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-300 hover:bg-white"
            >
              <p className="truncate text-base font-semibold text-slate-800">{meeting.title}</p>
              <p className="mt-2 text-sm text-slate-500">{formatDateTime(meeting.startsAt)}</p>
            </button>
          ))}
          {(data?.recentMeetings ?? []).length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              No recent meetings.
            </p>
          ) : null}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-slate-700">Pending Meeting Requests</h2>
        <div className="space-y-3">
          {(data?.pendingMeetingRequests ?? []).map((request) => (
            <button
              key={request.id}
              type="button"
              onClick={() => onOpenMeetingRequest(request.id)}
              className="block w-full rounded-2xl border border-amber-100 bg-amber-50/60 p-4 text-left transition hover:border-amber-200 hover:bg-amber-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-slate-800">{request.title}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {request.durationMinutes} min · {request.timeOptionCount} options
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold capitalize text-amber-700">
                  {request.status.replaceAll('_', ' ')}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                <span>{request.inviteeCounts.submitted} submitted</span>
                <span>{request.inviteeCounts.pending} pending</span>
                {request.responseDeadline ? (
                  <span>Deadline {formatDateOnly(request.responseDeadline)}</span>
                ) : null}
              </div>
            </button>
          ))}
          {(data?.pendingMeetingRequests ?? []).length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              No pending meeting requests.
            </p>
          ) : null}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-slate-700">My Action Items</h2>
        <div className="space-y-3">
          {(data?.myActionItems ?? []).map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="truncate font-semibold text-slate-700">{item.title}</p>
              <p className="mt-1 text-sm text-slate-500">Due: {formatDateOnly(item.dueDate)}</p>
            </article>
          ))}
          {(data?.myActionItems ?? []).length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              No action items assigned.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  </section>
)
