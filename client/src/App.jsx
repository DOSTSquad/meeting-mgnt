import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

const menuItems = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'repository', label: 'Meeting List' },
  { id: 'file-repository', label: 'File Repository' },
  { id: 'action-items', label: 'Action Items' },
  { id: 'notifications', label: 'Notification' },
]

const formatDateTime = (value) => {
  if (!value) {
    return '-'
  }

  const date = new Date(value)

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const formatDateOnly = (value) => {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(value))
}

const isOverdueActionItem = (item) => {
  if (!item?.dueDate) {
    return false
  }

  if (!['todo', 'in_progress'].includes(item.status)) {
    return false
  }

  return new Date(item.dueDate).getTime() < Date.now()
}

const getApiClient = (token) =>
  axios.create({
    baseURL: apiBaseUrl,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const formatMultilineHtml = (value = '-') => {
  const safe = escapeHtml(value && value.trim().length > 0 ? value : '-')
  return safe.replaceAll('\n', '<br/>')
}

const LoginView = ({ onLogin }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const trimmedEmail = useMemo(() => email.trim(), [email])

  const handleLogin = async (event) => {
    event.preventDefault()

    if (!trimmedEmail || !password) {
      setErrorMessage('Please enter both email and password')
      return
    }

    try {
      setIsSubmitting(true)
      setErrorMessage('')

      const response = await axios.post(`${apiBaseUrl}/api/auth/login`, {
        email: trimmedEmail,
        password,
      })

      const { token, user } = response.data ?? {}

      if (!token || !user) {
        throw new Error('Invalid login response from server')
      }

      onLogin({ token, user })
    } catch (error) {
      setErrorMessage(
        error.response?.data?.error ||
          error.response?.data?.message ||
          error.message ||
          'Unable to sign in right now'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 sm:px-6 sm:py-8">
      <section className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-300/40 lg:grid-cols-2">
        <div className="relative hidden bg-slate-900 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">Welcome</p>
            <h2 className="mt-4 max-w-sm text-3xl font-semibold leading-tight text-white">
              Organize every meeting in one clear workspace
            </h2>
          </div>
          <div className="rounded-2xl border border-slate-700/70 bg-slate-800/60 p-6">
            <p className="text-base font-medium text-slate-200">DOST Meeting Platform</p>
            <p className="mt-2 text-sm text-slate-400">
              meeting organise, summarise and follow-up meetings
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center p-5 sm:p-8 lg:p-12">
          <div className="w-full max-w-md">
            <header className="mb-8 text-center lg:text-left">
              <div className="mb-5 flex items-center justify-center gap-4 lg:justify-start">
                <img src="/logo.png" alt="DOST logo" className="h-16 w-auto sm:h-20" />
                <p className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-600 sm:text-base">
                  Meeting Management System
                </p>
              </div>
              <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Sign In</h1>
              <p className="mt-2 text-sm text-slate-500">Sign in to continue to your workspace</p>
            </header>

            <form className="space-y-4" onSubmit={handleLogin}>
              <div>
                <label htmlFor="email" className="text-sm font-medium text-slate-700">
                  Username / Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 block h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label htmlFor="password" className="text-sm font-medium text-slate-700">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 block h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {errorMessage ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {errorMessage}
                </p>
              ) : null}

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <p>Demo login: <span className="font-semibold">paveen.anuntakulnatee@seed.local</span> / <span className="font-semibold">Password123!</span></p>
                <p>Alt login: <span className="font-semibold">nattanan.thepsathorn@seed.local</span> / <span className="font-semibold">Password123!</span></p>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-3 h-11 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-400"
              >
                {isSubmitting ? 'Signing In...' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  )
}

const Sidebar = ({ activePage, onSelect, onLogout, currentUser, notificationCount }) => (
  <aside className="w-full bg-slate-900 text-white lg:w-72">
    <div className="flex h-full flex-col px-5 py-6">
      <div className="mb-8 flex items-center gap-3">
        <img src="/logo.png" alt="Meeting Manager logo" className="h-8 w-auto" />
        <span className="text-2xl font-semibold">Meeting Manager</span>
      </div>
      <nav className="space-y-1.5">
        {menuItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xl transition ${
              activePage === item.id ? 'bg-slate-800' : 'hover:bg-slate-800/70'
            }`}
          >
            <span>{item.label}</span>
            {item.id === 'notifications' && notificationCount > 0 ? (
              <span className="min-w-6 rounded-full bg-rose-600 px-2 py-0.5 text-center text-xs font-semibold text-white">
                {notificationCount}
              </span>
            ) : null}
          </button>
        ))}
      </nav>
      <div className="mt-auto pt-8">
        <p className="mb-3 text-xs text-slate-300">Signed in as {currentUser.name}</p>
        <button
          type="button"
          onClick={onLogout}
          className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200"
        >
          Log out
        </button>
      </div>
    </div>
  </aside>
)

const DashboardView = ({ data, onOpenCreateModal, onOpenMeeting }) => (
  <section className="space-y-6">
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Overview</p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-800 lg:text-5xl">Dashboard</h1>
          <p className="mt-2 text-sm text-slate-500">Welcome back! Here&apos;s what&apos;s happening today.</p>
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

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs text-slate-500">Recent Meetings</p>
        <p className="mt-1 text-3xl font-semibold text-slate-800">{data?.recentMeetings?.length || 0}</p>
      </article>
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs text-slate-500">My Action Items</p>
        <p className="mt-1 text-3xl font-semibold text-slate-800">{data?.myActionItems?.length || 0}</p>
      </article>
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs text-slate-500">Pending RSVP</p>
        <p className="mt-1 text-3xl font-semibold text-slate-800">{data?.pendingRsvpMeetings?.length || 0}</p>
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

const RepositoryView = ({ meetings, meetingParticipantsByMeeting, search, onSearch, onOpenMeeting }) => {
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

const FileRepositoryView = ({
  meetings,
  filesByMeeting,
  currentUserId,
  meetingParticipantsByMeeting,
  search,
  onSearch,
  selectedMeetingIds,
  onToggleMeetingSelection,
  onUploadFile,
  onDownloadFile,
  onOpenProjectFilesPage,
}) => {
  const documents = meetings.flatMap((meeting) =>
    (filesByMeeting[meeting.id] || []).map((file) => ({ ...file, meetingTitle: meeting.title, tag: meeting.tag }))
  )

  const filteredDocuments = documents.filter((file) =>
    file.fileName.toLowerCase().includes(search.trim().toLowerCase())
  )
  const involvedMeetings = meetings.filter((meeting) => {
    if (meeting.createdBy === currentUserId) {
      return true
    }

    const participantNames = meetingParticipantsByMeeting[meeting.id] || []
    return participantNames.length > 0
  })
  return (
    <section>
      <h1 className="text-5xl font-semibold text-slate-800">File Repository</h1>
      <p className="mt-2 text-lg text-slate-500">Manage and access all your meeting documents</p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search meeting..."
            className="h-9 min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 text-sm"
          />
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 p-3">
          <p className="text-sm font-semibold text-slate-700">Upload to meetings (select one or more)</p>
          <div className="mt-2 grid max-h-40 gap-2 overflow-auto md:grid-cols-2">
            {meetings.map((meeting) => (
              <label key={meeting.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={selectedMeetingIds.includes(meeting.id)}
                  onChange={() => onToggleMeetingSelection(meeting.id)}
                />
                <span>{meeting.title}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="mt-3 block rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
          <div className="mx-auto mb-1 text-base">⇪</div>
          Drag & drop files here or browse
          <div className="text-xs text-slate-400">Upload meeting documents, agenda, or minutes</div>
          <input type="file" multiple className="mt-2 w-full text-xs" onChange={(e) => onUploadFile(e.target.files)} />
        </label>
      </div>

      <div className="mt-5">
        <h2 className="mb-3 text-lg font-semibold text-slate-700">Projects</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {involvedMeetings.map((meeting) => (
            <button
              type="button"
              key={meeting.id}
              onClick={() => onOpenProjectFilesPage(meeting.id)}
              className="rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:shadow-sm"
            >
              <div className="mb-2 flex items-center gap-2">
                <img src="/foldericon.png" alt="Folder" className="h-5 w-5 object-contain" />
                <p className="truncate text-sm font-semibold text-slate-700">{meeting.title}</p>
              </div>
              <p className="text-xs text-slate-500">{(filesByMeeting[meeting.id] || []).length} files</p>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-700">All Documents</h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {filteredDocuments.length} files
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          {filteredDocuments.map((file) => (
            <article
              key={file.id}
              className="group flex min-h-[11rem] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="mb-2 flex h-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg">
                📄
              </div>
              <div className="min-w-0 shrink rounded-lg border border-slate-200 bg-white/80 p-2">
                <p className="truncate text-left text-sm font-semibold leading-5 text-slate-800" title={file.fileName}>
                  {file.fileName}
                </p>
                <div className="mt-1.5 space-y-1">
                  <p className="truncate text-[11px] leading-4 text-slate-500">{formatDateOnly(file.createdAt)}</p>
                  <p className="truncate text-[11px] leading-4 text-slate-400" title={file.meetingTitle}>
                    {file.meetingTitle}
                  </p>
                </div>
              </div>
              <div className="mt-2">
                <span className="inline-flex max-w-full truncate rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600 align-middle">
                  {file.tag || '-'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onDownloadFile(file.id)}
                className="mt-auto shrink-0 w-full rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Download
              </button>
            </article>
          ))}
          {filteredDocuments.length === 0 ? (
            <p className="text-sm text-slate-500">No files uploaded yet</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}

const ProjectFilesView = ({ meeting, files, onBack, onDownloadFile }) => (
  <section>
    <div className="mb-4 flex items-center justify-between">
      <button
        type="button"
        onClick={onBack}
        className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
      >
        Back
      </button>
    </div>
    <h1 className="text-4xl font-semibold text-slate-800">{meeting?.title || 'Project Files'}</h1>
    <p className="mt-2 text-lg text-slate-500">Files in this meeting</p>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {files.map((file) => (
        <article
          key={file.id}
          className="group flex h-48 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="mb-2 flex h-16 items-center justify-center rounded-xl bg-slate-100 text-2xl">📄</div>
          <p className="truncate text-left text-sm font-semibold text-slate-800" title={file.fileName}>
            {file.fileName}
          </p>
          <p className="mt-1 truncate text-xs text-slate-500">{formatDateOnly(file.createdAt)}</p>
          <p className="mt-1 truncate text-xs text-blue-500">{meeting?.tag || '-'}</p>
          <button
            type="button"
            onClick={() => onDownloadFile(file.id)}
            className="mt-auto rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
          >
            Download
          </button>
        </article>
      ))}
      {files.length === 0 ? <p className="text-sm text-slate-500">No files uploaded yet</p> : null}
    </div>
  </section>
)

const MeetingDetailView = ({
  detail,
  onBack,
  onChange,
  onSave,
  onAddActionItem,
  onActionItemChange,
  onActionItemSave,
  onActionItemAssigneeChange,
  onActionItemDueDateChange,
  onActionItemRemove,
  pendingMaterialFiles,
  pendingAudioFiles,
  onAddPendingMaterialFiles,
  onRemovePendingMaterialFile,
  onAddPendingAudioFiles,
  onRemovePendingAudioFile,
  onDownloadMeetingFile,
  onPreview,
}) => {
  const [isDragOverMaterialFiles, setIsDragOverMaterialFiles] = useState(false)
  const [isDragOverAudioFiles, setIsDragOverAudioFiles] = useState(false)
  const participantsById = Object.fromEntries(
    (detail?.participants || []).map((participant) => [participant.userId, participant.name])
  )

  if (!detail) {
    return null
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <button type="button" onClick={onBack} className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to repository
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onPreview}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
          >
            Preview
          </button>
          <button
            type="button"
            onClick={onSave}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Save & Finalize
          </button>
        </div>
      </div>

      <h1 className="text-4xl font-semibold text-slate-800">{detail.meeting.title}</h1>
      <p className="mt-1 text-slate-500">{formatDateTime(detail.meeting.startsAt)}</p>

      <div className="mt-6 grid gap-5 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-2xl font-semibold text-slate-700">Meeting Information</h2>
            <p className="mt-1 text-sm text-slate-500">Core meeting metadata (title, schedule, and owner fields).</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Meeting Title</span>
                <input
                  value={detail.meeting.title || ''}
                  onChange={(event) => onChange('title', event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3"
                  placeholder="Meeting title"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Location</span>
                <input
                  value={detail.meeting.location || ''}
                  onChange={(event) => onChange('location', event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3"
                  placeholder="Location"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Date</span>
                <input
                  type="date"
                  value={(detail.meeting.startsAt || '').slice(0, 10)}
                  onChange={(event) => onChange('date', event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Time</span>
                <input
                  type="time"
                  value={new Date(detail.meeting.startsAt).toISOString().slice(11, 16)}
                  onChange={(event) => onChange('time', event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Facilitator</span>
                <input
                  value={detail.meeting.facilitator || ''}
                  onChange={(event) => onChange('facilitator', event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3"
                  placeholder="Facilitator"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Recorder</span>
                <input
                  value={detail.meeting.recorder || ''}
                  onChange={(event) => onChange('recorder', event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3"
                  placeholder="Recorder"
                />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-2xl font-semibold text-slate-700">Agenda</h2>
            <p className="mt-1 text-sm text-slate-500">Meeting objective and discussion scope.</p>
            <textarea
              rows={4}
              value={detail.meeting.description || ''}
              onChange={(event) => onChange('description', event.target.value)}
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-2xl font-semibold text-slate-700">Key Discussions</h2>
            <p className="mt-1 text-sm text-slate-500">Key points discussed during the meeting.</p>
            <textarea
              rows={4}
              value={detail.meeting.keyDiscussions || ''}
              onChange={(event) => onChange('keyDiscussions', event.target.value)}
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-2xl font-semibold text-slate-700">Meeting Minutes</h2>
            <p className="mt-1 text-sm text-slate-500">Formal meeting notes for records and follow-up.</p>
            <textarea
              rows={6}
              value={detail.meeting.meetingMinutes || ''}
              onChange={(event) => onChange('meetingMinutes', event.target.value)}
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-slate-700">Action Items</h2>
              <button
                type="button"
                onClick={onAddActionItem}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
              >
                + Add Item
              </button>
            </div>
            <p className="mb-2 text-sm text-slate-500">Tasks, assignees, and due dates from this meeting.</p>
            <div className="mb-2 grid grid-cols-[1.4fr_1fr_0.9fr] gap-2 text-xs font-semibold text-slate-500">
              <span>Task</span>
              <span>Responsible Person</span>
              <span>Deadline</span>
            </div>
            <div className="space-y-2">
              {detail.actionItems.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 p-2">
                  <div className="grid grid-cols-[1.4fr_1fr_0.9fr] gap-2">
                    <input
                      value={item.title}
                      onChange={(event) => onActionItemChange(item.id, event.target.value)}
                      onBlur={() => onActionItemSave(item.id)}
                      className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm outline-none"
                    />
                    <select
                      value={item.assigneeId || ''}
                      onChange={(event) => onActionItemAssigneeChange(item.id, event.target.value || null)}
                      className="h-9 w-full rounded-md border border-slate-200 px-2 text-xs"
                    >
                      <option value="">Unassigned</option>
                      {detail.participants.map((participant) => (
                        <option key={participant.userId} value={participant.userId}>
                          {participant.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={item.dueDate ? item.dueDate.slice(0, 10) : ''}
                      onChange={(event) => onActionItemDueDateChange(item.id, event.target.value)}
                      className="h-9 w-full rounded-md border border-slate-200 px-2 text-xs"
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Assigned to: {participantsById[item.assigneeId] || 'Unassigned'}
                  </p>
                  <div className="mt-2 text-right">
                    <button
                      type="button"
                      onClick={() => onActionItemRemove(item.id)}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-2xl font-semibold text-slate-700">Meeting Materials</h2>
            <p className="mt-1 text-sm text-slate-500">Meeting documents and supporting files.</p>
            <div
              className={`mt-3 rounded-xl border-2 border-dashed p-5 text-center text-sm ${
                isDragOverMaterialFiles
                  ? 'border-blue-400 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-500'
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
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 16V4" />
                  <path d="m7 9 5-5 5 5" />
                  <path d="M20 16.5v2A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-2" />
                </svg>
              </div>
              Drag & drop files here or click to browse
            </div>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {detail.files.map((file) => (
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
                <li key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between text-blue-700">
                  <span>{file.name} (pending)</span>
                  <button
                    type="button"
                    onClick={() => onRemovePendingMaterialFile(index)}
                    className="text-xs font-semibold text-rose-600"
                  >
                    Remove
                  </button>
                </li>
              ))}
              {detail.files.length === 0 && pendingMaterialFiles.length === 0 ? <li>No files uploaded</li> : null}
            </ul>
            <input
              type="file"
              multiple
              className="mt-3 w-full text-sm"
              onChange={(event) => onAddPendingMaterialFiles(event.target.files)}
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-2xl font-semibold text-slate-700">Upload Meeting Audio</h2>
            <p className="mt-1 text-sm text-slate-500">Audio recordings for transcription and archive.</p>
            <div
              className={`mt-3 rounded-xl border-2 border-dashed p-5 text-center text-sm ${
                isDragOverAudioFiles
                  ? 'border-blue-400 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-500'
              }`}
              onDragOver={(event) => {
                event.preventDefault()
                setIsDragOverAudioFiles(true)
              }}
              onDragLeave={() => setIsDragOverAudioFiles(false)}
              onDrop={(event) => {
                event.preventDefault()
                setIsDragOverAudioFiles(false)
                onAddPendingAudioFiles(event.dataTransfer?.files)
              }}
            >
              Supports MP3, WAV, M4A
            </div>
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              {pendingAudioFiles.map((file, index) => (
                <li key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between text-blue-700">
                  <span>{file.name} (pending audio)</span>
                  <button
                    type="button"
                    onClick={() => onRemovePendingAudioFile(index)}
                    className="text-xs font-semibold text-rose-600"
                  >
                    Remove
                  </button>
                </li>
              ))}
              {pendingAudioFiles.length === 0 ? <li>No audio queued</li> : null}
            </ul>
            <input
              type="file"
              multiple
              accept=".mp3,.wav,.m4a,audio/*"
              className="mt-3 w-full text-sm"
              onChange={(event) => onAddPendingAudioFiles(event.target.files)}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-2xl font-semibold text-slate-700">Attendees</h2>
            <p className="mt-1 text-sm text-slate-500">People involved in this meeting.</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {detail.participants.map((participant) => (
                <li key={participant.userId}>{participant.name}</li>
              ))}
            </ul>
          </div>

        </div>
      </div>
    </section>
  )
}

const ActionItemsView = ({ actionItems, onMoveActionItem }) => {
  const grouped = {
    todo: actionItems.filter((item) => item.status === 'todo'),
    in_progress: actionItems.filter((item) => item.status === 'in_progress'),
    done: actionItems.filter((item) => item.status === 'completed'),
  }

  const columns = [
    { id: 'todo', label: 'To-do' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'done', label: 'Done' },
  ]

  return (
    <section>
      <h1 className="text-5xl font-semibold text-slate-800">Action Items Tracker</h1>
      <p className="mt-2 text-lg text-slate-500">
        Track and manage post-meeting action items across all projects
      </p>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        {columns.map((column) => (
          <div key={column.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-slate-700">{column.label}</h2>
              <span className="rounded-lg bg-slate-200 px-2 py-0.5 text-sm text-slate-600">
                {grouped[column.id].length}
              </span>
            </div>
            <div className="space-y-3">
              {grouped[column.id].map((item) => (
                <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-700">{item.title}</p>
                    {isOverdueActionItem(item) ? (
                      <span className="rounded-md bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                        overdue
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Due: {formatDateOnly(item.dueDate)}</p>
                  <div className="mt-2">
                    {item.status === 'todo' ? (
                      <button
                        type="button"
                        onClick={() => onMoveActionItem(item.id, 'in_progress')}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
                      >
                        Move to In Progress
                      </button>
                    ) : null}
                    {item.status === 'in_progress' ? (
                      <button
                        type="button"
                        onClick={() => onMoveActionItem(item.id, 'completed')}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
                      >
                        Move to Done
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
              {grouped[column.id].length === 0 ? (
                <p className="text-sm text-slate-500">No items</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

const NotificationsView = ({ notifications }) => {
  const meetingCreated = notifications.filter((item) => item.type === 'meeting_created')
  const taskAssigned = notifications.filter((item) => item.type === 'task_assigned')

  const renderItems = (items) =>
    items.length === 0 ? (
      <p className="text-sm text-slate-500">No new notifications.</p>
    ) : (
      items.map((notification) => (
        <article
          key={`${notification.type}-${notification.meetingId}-${notification.actionItemId || ''}`}
          className="rounded-xl border border-slate-200 p-4"
        >
          <p className="mt-1 text-base font-semibold text-slate-700">{notification.title}</p>
          <p className="mt-1 text-sm text-slate-500">{notification.detail}</p>
          <p className="mt-2 text-xs text-slate-500">{formatDateTime(notification.eventAt)}</p>
        </article>
      ))
    )

  return (
    <section>
      <h1 className="text-5xl font-semibold text-slate-800">Notifications</h1>
      <p className="mt-2 text-lg text-slate-500">Stay updated with your meetings and action items</p>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-700">Meeting Created</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {meetingCreated.length}
            </span>
          </div>
          <div className="space-y-3">{renderItems(meetingCreated)}</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-700">Task Assigned</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {taskAssigned.length}
            </span>
          </div>
          <div className="space-y-3">{renderItems(taskAssigned)}</div>
        </div>
      </div>
    </section>
  )
}

const CreateMeetingModal = ({ isOpen, onClose, onCreated, token, users, tags, currentUserId }) => {
  const [form, setForm] = useState({
    title: '',
    location: '',
    date: '',
    time: '',
    agenda: '',
    department: '',
    tag: '',
    attendeeUserIds: [],
    selectedAttendeeUserId: '',
    files: [],
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [tagMode, setTagMode] = useState('existing')
  const [isDragOver, setIsDragOver] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  if (!isOpen) {
    return null
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!form.title.trim() || !form.date || !form.time) {
      setErrorMessage('Meeting title, date, and time are required')
      return
    }

    try {
      setIsSubmitting(true)
      setErrorMessage('')

      const startsAt = new Date(`${form.date}T${form.time}:00`)
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000)

      const client = getApiClient(token)
      const createResponse = await client.post('/api/meetings', {
        title: form.title.trim(),
        location: form.location || null,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        timezoneName: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        description: form.agenda || null,
        department: form.department || null,
        tag: form.tag || null,
      })
      const meetingId = createResponse.data?.meeting?.id

      if (meetingId && form.attendeeUserIds.length > 0) {
        await client.post(`/api/meetings/${meetingId}/participants`, {
          userIds: form.attendeeUserIds,
          role: 'attendee',
        })
      }

      if (meetingId && form.files.length > 0) {
        for (const file of form.files) {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('description', 'Uploaded during meeting creation')
          await client.post(`/api/meetings/${meetingId}/files`, formData)
        }
      }

      setForm({
        title: '',
        location: '',
        date: '',
        time: '',
        agenda: '',
        department: '',
        tag: '',
        attendeeUserIds: [],
        selectedAttendeeUserId: '',
        files: [],
      })
      onCreated()
      onClose()
    } catch (error) {
      setErrorMessage(
        error.response?.data?.error || error.response?.data?.message || 'Unable to create meeting'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddNewTag = async () => {
    const tagName = form.tag.trim()
    if (!tagName) {
      setErrorMessage('Please enter a tag name first')
      return
    }

    try {
      setIsAddingTag(true)
      setErrorMessage('')
      const client = getApiClient(token)
      await client.post('/api/tags', { name: tagName })
      await onCreated()
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to add new tag')
    } finally {
      setIsAddingTag(false)
    }
  }

  const addFiles = (incomingFiles) => {
    const nextFiles = Array.from(incomingFiles || [])
    if (nextFiles.length === 0) {
      return
    }

    setForm((prev) => ({
      ...prev,
      files: [...prev.files, ...nextFiles],
    }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-3xl font-semibold text-slate-800">Create New Meeting</h3>
          <button type="button" onClick={onClose} className="text-2xl text-slate-500">
            ×
          </button>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Meeting Title</span>
            <input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>

          <label>
            <span className="text-sm font-semibold text-slate-700">Location / Online Meeting</span>
            <input
              value={form.location}
              onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>

          <label>
            <span className="text-sm font-semibold text-slate-700">Date</span>
            <input
              type="date"
              value={form.date}
              onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>

          <label>
            <span className="text-sm font-semibold text-slate-700">Time</span>
            <input
              type="time"
              value={form.time}
              onChange={(event) => setForm((prev) => ({ ...prev, time: event.target.value }))}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>

          <label>
            <span className="text-sm font-semibold text-slate-700">Select your tag</span>

            {tagMode === 'existing' ? (
              <select
                value={form.tag}
                onChange={(event) => setForm((prev) => ({ ...prev, tag: event.target.value }))}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3"
              >
                <option value="">Select your tag</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.name}>
                    {tag.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="mt-2 flex gap-2">
                <input
                  value={form.tag}
                  onChange={(event) => setForm((prev) => ({ ...prev, tag: event.target.value }))}
                  placeholder="Enter new tag"
                  className="h-11 w-full rounded-xl border border-slate-200 px-3"
                />
                <button
                  type="button"
                  onClick={handleAddNewTag}
                  disabled={isAddingTag}
                  className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-700"
                >
                  {isAddingTag ? 'Adding...' : 'Add'}
                </button>
              </div>
            )}

            <div className="mt-3 flex items-center gap-4 text-xs text-slate-600">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="tag-mode"
                  checked={tagMode === 'existing'}
                  onChange={() => {
                    setTagMode('existing')
                    setForm((prev) => ({ ...prev, tag: '' }))
                  }}
                />
                Use existing tag
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="tag-mode"
                  checked={tagMode === 'new'}
                  onChange={() => {
                    setTagMode('new')
                    setForm((prev) => ({ ...prev, tag: '' }))
                  }}
                />
                Create new tag
              </label>
            </div>
          </label>

          <label className="sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Agenda & Notes</span>
            <textarea
              rows={4}
              value={form.agenda}
              onChange={(event) => setForm((prev) => ({ ...prev, agenda: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </label>

          <div className="rounded-xl border border-slate-200 p-4 sm:col-span-1">
            <span className="text-sm font-semibold text-slate-700">Attendees</span>
            <div className="mt-2 flex gap-2">
              <select
                value={form.selectedAttendeeUserId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, selectedAttendeeUserId: event.target.value }))
                }
                className="h-11 flex-1 rounded-xl border border-slate-200 px-3"
              >
                <option value="">Select user</option>
                {users
                  .filter((user) => user.id !== currentUserId)
                  .map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  if (!form.selectedAttendeeUserId) return
                  setForm((prev) => ({
                    ...prev,
                    attendeeUserIds: prev.attendeeUserIds.includes(prev.selectedAttendeeUserId)
                      ? prev.attendeeUserIds
                      : [...prev.attendeeUserIds, prev.selectedAttendeeUserId],
                    selectedAttendeeUserId: '',
                  }))
                }}
                className="rounded-xl border border-slate-200 px-3"
              >
                Add
              </button>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {form.attendeeUserIds.map((userId) => {
                const user = users.find((item) => item.id === userId)
                if (!user) return null

                return (
                  <li key={userId} className="flex items-center justify-between">
                    <span>{user.name}</span>
                    <button
                      type="button"
                      className="text-xs text-rose-600"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          attendeeUserIds: prev.attendeeUserIds.filter((id) => id !== userId),
                        }))
                      }
                    >
                      remove
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          <div
            className={`rounded-xl border-2 border-dashed p-5 text-center text-sm sm:col-span-1 ${
              isDragOver ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'
            }`}
            onDragOver={(event) => {
              event.preventDefault()
              setIsDragOver(true)
            }}
            onDragLeave={(event) => {
              event.preventDefault()
              setIsDragOver(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setIsDragOver(false)
              addFiles(event.dataTransfer?.files)
            }}
          >
            <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-300">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 16V4" />
                <path d="m7 9 5-5 5 5" />
                <path d="M20 16.5v2A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-2" />
              </svg>
            </div>
            Drag & drop files here or click to browse
            <input
              type="file"
              multiple
              className="mt-3 w-full text-sm"
              onChange={(event) => addFiles(event.target.files)}
            />
            <ul className="mt-3 space-y-1 text-left text-xs text-slate-600">
              {form.files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center justify-between">
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    className="ml-2 text-rose-600"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        files: prev.files.filter((_, fileIndex) => fileIndex !== index),
                      }))
                    }
                  >
                    remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {errorMessage ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2">
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
          >
            {isSubmitting ? 'Creating...' : 'Create Meeting'}
          </button>
        </div>
      </form>
    </div>
  )
}

const AppShell = ({ token, user, onLogout }) => {
  const [activePage, setActivePage] = useState('dashboard')
  const [dashboardData, setDashboardData] = useState(null)
  const [meetings, setMeetings] = useState([])
  const [actionItems, setActionItems] = useState([])
  const [notifications, setNotifications] = useState([])
  const [users, setUsers] = useState([])
  const [tags, setTags] = useState([])
  const [filesByMeeting, setFilesByMeeting] = useState({})
  const [fileRepoSearch, setFileRepoSearch] = useState('')
  const [fileRepoMeetingIds, setFileRepoMeetingIds] = useState([])
  const [activeProjectMeetingId, setActiveProjectMeetingId] = useState('')
  const [repositorySearch, setRepositorySearch] = useState('')
  const [meetingParticipantsByMeeting, setMeetingParticipantsByMeeting] = useState({})
  const [pendingMeetingMaterialFiles, setPendingMeetingMaterialFiles] = useState([])
  const [pendingMeetingAudioFiles, setPendingMeetingAudioFiles] = useState([])
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedMeetingDetail, setSelectedMeetingDetail] = useState(null)
  const [successModalMessage, setSuccessModalMessage] = useState('')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const newNotificationCount = notifications.filter(
    (item) => item.type === 'meeting_created' || item.type === 'task_assigned'
  ).length

  const loadParticipantsForMeetings = useCallback(
    async (meetingList) => {
      if (!meetingList?.length) {
        setMeetingParticipantsByMeeting({})
        return
      }

      const client = getApiClient(token)
      const results = await Promise.all(
        meetingList.map(async (meeting) => {
          try {
            const response = await client.get(`/api/meetings/${meeting.id}/participants`)
            const names = (response.data?.participants || []).map((participant) => participant.name).filter(Boolean)
            return [meeting.id, names]
          } catch {
            return [meeting.id, []]
          }
        })
      )

      setMeetingParticipantsByMeeting(Object.fromEntries(results))
    },
    [token]
  )

  const reloadData = useCallback(async () => {
    try {
      const client = getApiClient(token)

      const [dashboardRes, meetingsRes, actionItemsRes, notificationsRes, usersRes, tagsRes] = await Promise.all([
        client.get('/api/dashboard'),
        client.get('/api/meetings', { params: { limit: 100 } }),
        client.get('/api/action-items'),
        client.get('/api/notifications'),
        client.get('/api/users'),
        client.get('/api/tags'),
      ])

      setDashboardData(dashboardRes.data)
      const loadedMeetings = meetingsRes.data?.meetings || []
      setMeetings(loadedMeetings)
      await loadParticipantsForMeetings(loadedMeetings)
      setActionItems(actionItemsRes.data?.actionItems || [])
      setNotifications(notificationsRes.data?.notifications || [])
      const loadedUsers = usersRes.data?.users || []
      setUsers(loadedUsers)
      setTags(tagsRes.data?.tags || [])

      const currentUserExists = loadedUsers.some((item) => item.id === user.id)
      if (!currentUserExists) {
        onLogout()
        return
      }
    } catch (error) {
      if (error.response?.status === 401) {
        onLogout()
        return
      }
      setErrorMessage(error.response?.data?.error || 'Unable to load dashboard data')
    }
  }, [token, user.id, onLogout, loadParticipantsForMeetings])

  useEffect(() => {
    let isCancelled = false

    const loadInitialData = async () => {
      try {
        const client = getApiClient(token)

        const [dashboardRes, meetingsRes, actionItemsRes, notificationsRes, usersRes, tagsRes] = await Promise.all([
          client.get('/api/dashboard'),
          client.get('/api/meetings', { params: { limit: 100 } }),
          client.get('/api/action-items'),
          client.get('/api/notifications'),
          client.get('/api/users'),
          client.get('/api/tags'),
        ])

        if (isCancelled) {
          return
        }

        setDashboardData(dashboardRes.data)
        const loadedMeetings = meetingsRes.data?.meetings || []
        setMeetings(loadedMeetings)
        await loadParticipantsForMeetings(loadedMeetings)
        setActionItems(actionItemsRes.data?.actionItems || [])
        setNotifications(notificationsRes.data?.notifications || [])
        const loadedUsers = usersRes.data?.users || []
        setUsers(loadedUsers)
        setTags(tagsRes.data?.tags || [])

        const currentUserExists = loadedUsers.some((item) => item.id === user.id)
        if (!currentUserExists) {
          onLogout()
          return
        }
      } catch (error) {
        if (isCancelled) {
          return
        }

        if (error.response?.status === 401) {
          onLogout()
          return
        }
        setErrorMessage(error.response?.data?.error || 'Unable to load dashboard data')
      }
    }

    loadInitialData()

    return () => {
      isCancelled = true
    }
  }, [token, user.id, onLogout, loadParticipantsForMeetings])

  const openMeetingDetail = async (meetingId) => {
    try {
      const client = getApiClient(token)
      const [meetingRes, participantsRes, actionItemsRes, filesRes] = await Promise.all([
        client.get(`/api/meetings/${meetingId}`),
        client.get(`/api/meetings/${meetingId}/participants`),
        client.get(`/api/meetings/${meetingId}/action-items`),
        client.get(`/api/meetings/${meetingId}/files`),
      ])

      setSelectedMeetingDetail({
        meeting: meetingRes.data.meeting,
        participants: participantsRes.data.participants || [],
        actionItems: actionItemsRes.data.actionItems || [],
        files: filesRes.data.files || [],
      })
      setPendingMeetingMaterialFiles([])
      setPendingMeetingAudioFiles([])
      setActivePage('repository-detail')
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to open meeting details')
    }
  }

  const updateMeetingDetailField = (field, value) => {
    setSelectedMeetingDetail((prev) => {
      if (!prev) {
        return prev
      }

      if (field === 'date' || field === 'time') {
        const start = new Date(prev.meeting.startsAt)
        if (field === 'date') {
          const [year, month, day] = value.split('-').map(Number)
          start.setFullYear(year, month - 1, day)
        } else {
          const [hour, minute] = value.split(':').map(Number)
          start.setHours(hour, minute, 0, 0)
        }

        return {
          ...prev,
          meeting: {
            ...prev.meeting,
            startsAt: start.toISOString(),
            endsAt: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
          },
        }
      }

      return { ...prev, meeting: { ...prev.meeting, [field]: value } }
    })
  }

  const saveMeetingDetail = async () => {
    if (!selectedMeetingDetail) {
      return
    }

    try {
      const client = getApiClient(token)
      const payload = {
        title: selectedMeetingDetail.meeting.title,
        description: selectedMeetingDetail.meeting.description,
        startsAt: selectedMeetingDetail.meeting.startsAt,
        endsAt: selectedMeetingDetail.meeting.endsAt,
        timezoneName: selectedMeetingDetail.meeting.timezoneName || 'UTC',
        location: selectedMeetingDetail.meeting.location,
        department: selectedMeetingDetail.meeting.department,
        facilitator: selectedMeetingDetail.meeting.facilitator,
        recorder: selectedMeetingDetail.meeting.recorder,
        keyDiscussions: selectedMeetingDetail.meeting.keyDiscussions,
        meetingMinutes: selectedMeetingDetail.meeting.meetingMinutes,
        decisions: selectedMeetingDetail.meeting.decisions,
        tag: selectedMeetingDetail.meeting.tag,
      }

      await client.put(`/api/meetings/${selectedMeetingDetail.meeting.id}`, payload)
      await Promise.all(
        selectedMeetingDetail.actionItems.map((item) => {
          const updatePayload = {
            title: item.title?.trim() || 'Untitled action item',
            assigneeId: item.assigneeId || null,
            dueDate: item.dueDate || null,
          }

          if (item.assigneeId && !['completed', 'cancelled'].includes(item.status)) {
            updatePayload.status = 'todo'
          }

          return client.put(`/api/action-items/${item.id}`, updatePayload)
        })
      )
      if (pendingMeetingMaterialFiles.length > 0) {
        for (const file of pendingMeetingMaterialFiles) {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('description', 'Meeting material upload from detail view')
          await client.post(`/api/meetings/${selectedMeetingDetail.meeting.id}/files`, formData)
        }
      }

      if (pendingMeetingAudioFiles.length > 0) {
        for (const file of pendingMeetingAudioFiles) {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('description', 'Meeting audio upload from detail view')
          await client.post(`/api/meetings/${selectedMeetingDetail.meeting.id}/files`, formData)
        }
      }
      await reloadData()
      setPendingMeetingMaterialFiles([])
      setPendingMeetingAudioFiles([])
      setActivePage('dashboard')
      setSuccessModalMessage('Saved and finalized successfully')
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to save meeting details')
    }
  }

  const addActionItemInDetail = async () => {
    if (!selectedMeetingDetail) {
      return
    }

    try {
      const client = getApiClient(token)
      const res = await client.post(
        `/api/meetings/${selectedMeetingDetail.meeting.id}/action-items`,
        { title: 'New action item' }
      )
      setSelectedMeetingDetail((prev) =>
        prev
          ? {
              ...prev,
              actionItems: [res.data.actionItem, ...prev.actionItems],
            }
          : prev
      )
      await reloadData()
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to add action item')
    }
  }

  const editActionItemTitle = (actionItemId, title) => {
    setSelectedMeetingDetail((prev) =>
      prev
        ? {
            ...prev,
            actionItems: prev.actionItems.map((item) =>
              item.id === actionItemId ? { ...item, title } : item
            ),
          }
        : prev
    )
  }

  const editActionItemAssignee = (actionItemId, assigneeId) => {
    setSelectedMeetingDetail((prev) =>
      prev
        ? {
            ...prev,
            actionItems: prev.actionItems.map((item) =>
              item.id === actionItemId ? { ...item, assigneeId } : item
            ),
          }
        : prev
    )
  }

  const editActionItemDueDate = (actionItemId, dueDateValue) => {
    setSelectedMeetingDetail((prev) =>
      prev
        ? {
            ...prev,
            actionItems: prev.actionItems.map((item) =>
              item.id === actionItemId
                ? { ...item, dueDate: dueDateValue ? new Date(`${dueDateValue}T00:00:00Z`).toISOString() : null }
                : item
            ),
          }
        : prev
    )
  }

  const saveActionItemTitle = async (actionItemId) => {
    if (!selectedMeetingDetail) {
      return
    }

    const target = selectedMeetingDetail.actionItems.find((item) => item.id === actionItemId)
    if (!target || !target.title.trim()) {
      return
    }

    try {
      const client = getApiClient(token)
      await client.put(`/api/action-items/${actionItemId}`, {
        title: target.title.trim(),
        assigneeId: target.assigneeId || null,
        dueDate: target.dueDate || null,
      })
      await reloadData()
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to save action item')
    }
  }

  const removeActionItem = async (actionItemId) => {
    try {
      const client = getApiClient(token)
      await client.delete(`/api/action-items/${actionItemId}`)
      setSelectedMeetingDetail((prev) =>
        prev
          ? {
              ...prev,
              actionItems: prev.actionItems.filter((item) => item.id !== actionItemId),
            }
          : prev
      )
      await reloadData()
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to remove action item')
    }
  }

  const loadFilesForMeeting = useCallback(async (meetingId) => {
    try {
      const client = getApiClient(token)
      const response = await client.get(`/api/meetings/${meetingId}/files`)
      setFilesByMeeting((prev) => ({ ...prev, [meetingId]: response.data?.files || [] }))
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to load files')
    }
  }, [token])

  const loadAllFilesForMeetings = useCallback(async () => {
    const ids = meetings.map((meeting) => meeting.id)
    await Promise.all(ids.map((meetingId) => loadFilesForMeeting(meetingId)))
  }, [meetings, loadFilesForMeeting])

  const openUploadedFile = async (fileId) => {
    try {
      const client = getApiClient(token)
      const response = await client.get(`/api/files/${fileId}/content`, {
        responseType: 'blob',
      })

      const blobUrl = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `meeting-file-${fileId}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(blobUrl)
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to download file')
    }
  }

  const uploadFromRepository = async (file) => {
    const files = Array.from(file || [])
    if (fileRepoMeetingIds.length === 0 || files.length === 0) {
      setErrorMessage('Select at least one meeting and file before uploading')
      return
    }

    try {
      const client = getApiClient(token)
      for (const meetingId of fileRepoMeetingIds) {
        for (const nextFile of files) {
          const formData = new FormData()
          formData.append('file', nextFile)
          formData.append('description', 'Uploaded from file repository')
          await client.post(`/api/meetings/${meetingId}/files`, formData)
        }
        await loadFilesForMeeting(meetingId)
      }
      await reloadData()
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to upload file')
    }
  }

  const toggleFileRepoMeetingSelection = (meetingId) => {
    setFileRepoMeetingIds((prev) =>
      prev.includes(meetingId) ? prev.filter((id) => id !== meetingId) : [...prev, meetingId]
    )
  }

  const openProjectFilesPage = (meetingId) => {
    setActiveProjectMeetingId(meetingId)
    setActivePage('project-files')
  }

  useEffect(() => {
    if (activePage === 'file-repository' && meetings.length > 0) {
      loadAllFilesForMeetings()
    }
  }, [activePage, meetings.length, loadAllFilesForMeetings])

  const addPendingMeetingMaterialFiles = (incomingFiles) => {
    const nextFiles = Array.from(incomingFiles || [])
    if (nextFiles.length === 0) {
      return
    }

    setPendingMeetingMaterialFiles((prev) => [...prev, ...nextFiles])
  }

  const removePendingMeetingMaterialFile = (indexToRemove) => {
    setPendingMeetingMaterialFiles((prev) => prev.filter((_, index) => index !== indexToRemove))
  }

  const addPendingMeetingAudioFiles = (incomingFiles) => {
    const nextFiles = Array.from(incomingFiles || [])
    if (nextFiles.length === 0) {
      return
    }

    setPendingMeetingAudioFiles((prev) => [...prev, ...nextFiles])
  }

  const removePendingMeetingAudioFile = (indexToRemove) => {
    setPendingMeetingAudioFiles((prev) => prev.filter((_, index) => index !== indexToRemove))
  }

  const moveActionItemStatus = async (actionItemId, nextStatus) => {
    try {
      const client = getApiClient(token)
      await client.put(`/api/action-items/${actionItemId}`, { status: nextStatus })
      await reloadData()
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to update action item status')
    }
  }

  const exportMeetingPreviewPdf = () => {
    if (!selectedMeetingDetail) {
      return
    }

    const meeting = selectedMeetingDetail.meeting
    const participants = selectedMeetingDetail.participants || []
    const actionItems = selectedMeetingDetail.actionItems || []
    const participantNameById = Object.fromEntries(participants.map((p) => [p.userId, p.name]))
    const logoUrl = `${window.location.origin}/logo.png`

    const actionItemsRows =
      actionItems.length === 0
        ? '<tr><td colspan="3" style="padding:12px;border:1px solid #E2E8F0;color:#64748B">No action items</td></tr>'
        : actionItems
            .map(
              (item) => `
                <tr>
                  <td style="padding:10px;border:1px solid #E2E8F0;vertical-align:top;">${escapeHtml(item.title || '-')}</td>
                  <td style="padding:10px;border:1px solid #E2E8F0;vertical-align:top;">${escapeHtml(participantNameById[item.assigneeId] || 'Unassigned')}</td>
                  <td style="padding:10px;border:1px solid #E2E8F0;vertical-align:top;">${escapeHtml(
                    item.dueDate ? formatDateOnly(item.dueDate) : 'No due date'
                  )}</td>
                </tr>
              `
            )
            .join('')

    const participantsHtml =
      participants.length === 0
        ? '<p style="margin:8px 0 0;color:#64748B;">No attendees</p>'
        : `<ul style="margin:8px 0 0 18px;padding:0;">${participants
            .map((p) => `<li style="margin:0 0 6px;">${escapeHtml(p.name)}</li>`)
            .join('')}</ul>`

    const printWindow = window.open('', '_blank', 'width=1100,height=900')
    if (!printWindow) {
      setErrorMessage('Unable to open print window. Please allow pop-ups and try again.')
      return
    }

    printWindow.document.open()
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(meeting.title)} - Meeting Report</title>
          <style>
            @page { size: A4; margin: 20mm; }
            body { font-family: Arial, sans-serif; color: #0F172A; }
            .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #E2E8F0; padding-bottom: 12px; margin-bottom: 20px; }
            .logo { height: 52px; width: auto; }
            .title { font-size: 26px; font-weight: 700; margin: 0; }
            .subtitle { margin-top: 4px; color: #475569; font-size: 13px; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px; }
            .meta-card { border: 1px solid #E2E8F0; border-radius: 10px; padding: 10px 12px; }
            .meta-label { font-size: 11px; color: #64748B; text-transform: uppercase; letter-spacing: 0.04em; }
            .meta-value { font-size: 13px; margin-top: 4px; }
            .section { margin-top: 18px; }
            .section h2 { margin: 0; font-size: 17px; }
            .section p { margin-top: 8px; font-size: 13px; line-height: 1.55; color: #1E293B; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
            th { text-align: left; padding: 10px; border: 1px solid #E2E8F0; background: #F8FAFC; }
            .footer { margin-top: 26px; font-size: 11px; color: #64748B; border-top: 1px solid #E2E8F0; padding-top: 10px; }
          </style>
        </head>
        <body>
          <header class="header">
            <div>
              <h1 class="title">${escapeHtml(meeting.title)}</h1>
              <div class="subtitle">Meeting Report</div>
            </div>
            <img class="logo" src="${logoUrl}" alt="Logo" />
          </header>

          <section class="meta">
            <div class="meta-card"><div class="meta-label">Date & Time</div><div class="meta-value">${escapeHtml(
              formatDateTime(meeting.startsAt)
            )}</div></div>
            <div class="meta-card"><div class="meta-label">Location</div><div class="meta-value">${escapeHtml(
              meeting.location || '-'
            )}</div></div>
            <div class="meta-card"><div class="meta-label">Facilitator</div><div class="meta-value">${escapeHtml(
              meeting.facilitator || '-'
            )}</div></div>
            <div class="meta-card"><div class="meta-label">Recorder</div><div class="meta-value">${escapeHtml(
              meeting.recorder || '-'
            )}</div></div>
          </section>

          <section class="section">
            <h2>Agenda</h2>
            <p>${formatMultilineHtml(meeting.description)}</p>
          </section>
          <section class="section">
            <h2>Key Discussions</h2>
            <p>${formatMultilineHtml(meeting.keyDiscussions)}</p>
          </section>
          <section class="section">
            <h2>Meeting Minutes</h2>
            <p>${formatMultilineHtml(meeting.meetingMinutes)}</p>
          </section>
          <section class="section">
            <h2>Attendees</h2>
            ${participantsHtml}
          </section>
          <section class="section">
            <h2>Action Items</h2>
            <table>
              <thead>
                <tr><th>Task</th><th>Assigned To</th><th>Due Date</th></tr>
              </thead>
              <tbody>${actionItemsRows}</tbody>
            </table>
          </section>
          <footer class="footer">Generated from Meeting Manager on ${escapeHtml(formatDateTime(new Date().toISOString()))}</footer>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  return (
    <main className="min-h-screen bg-slate-100 lg:flex">
      <Sidebar
        activePage={activePage}
        onSelect={setActivePage}
        onLogout={onLogout}
        currentUser={user}
        notificationCount={newNotificationCount}
      />

      <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
        {errorMessage ? (
          <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errorMessage}
          </p>
        ) : null}

        {activePage === 'dashboard' ? (
          <DashboardView
            data={dashboardData}
            onOpenCreateModal={() => setIsCreateModalOpen(true)}
            onOpenMeeting={openMeetingDetail}
          />
        ) : null}
        {activePage === 'repository' ? (
          <RepositoryView
            meetings={meetings}
            meetingParticipantsByMeeting={meetingParticipantsByMeeting}
            search={repositorySearch}
            onSearch={setRepositorySearch}
            onOpenMeeting={openMeetingDetail}
          />
        ) : null}
        {activePage === 'file-repository' ? (
          <FileRepositoryView
            meetings={meetings}
            filesByMeeting={filesByMeeting}
            currentUserId={user.id}
            meetingParticipantsByMeeting={meetingParticipantsByMeeting}
            search={fileRepoSearch}
            onSearch={setFileRepoSearch}
            selectedMeetingIds={fileRepoMeetingIds}
            onToggleMeetingSelection={toggleFileRepoMeetingSelection}
            onUploadFile={uploadFromRepository}
            onDownloadFile={openUploadedFile}
            onOpenProjectFilesPage={openProjectFilesPage}
          />
        ) : null}
        {activePage === 'project-files' ? (
          <ProjectFilesView
            meeting={meetings.find((meeting) => meeting.id === activeProjectMeetingId) || null}
            files={filesByMeeting[activeProjectMeetingId] || []}
            onBack={() => setActivePage('file-repository')}
            onDownloadFile={openUploadedFile}
          />
        ) : null}
        {activePage === 'repository-detail' ? (
          <MeetingDetailView
            detail={selectedMeetingDetail}
            onBack={() => setActivePage('repository')}
            onChange={updateMeetingDetailField}
            onSave={saveMeetingDetail}
            onAddActionItem={addActionItemInDetail}
            onActionItemChange={editActionItemTitle}
            onActionItemSave={saveActionItemTitle}
            onActionItemAssigneeChange={editActionItemAssignee}
            onActionItemDueDateChange={editActionItemDueDate}
            onActionItemRemove={removeActionItem}
            pendingMaterialFiles={pendingMeetingMaterialFiles}
            pendingAudioFiles={pendingMeetingAudioFiles}
            onAddPendingMaterialFiles={addPendingMeetingMaterialFiles}
            onRemovePendingMaterialFile={removePendingMeetingMaterialFile}
            onAddPendingAudioFiles={addPendingMeetingAudioFiles}
            onRemovePendingAudioFile={removePendingMeetingAudioFile}
            onDownloadMeetingFile={openUploadedFile}
            onPreview={() => setIsPreviewOpen(true)}
          />
        ) : null}
        {activePage === 'action-items' ? (
          <ActionItemsView actionItems={actionItems} onMoveActionItem={moveActionItemStatus} />
        ) : null}
        {activePage === 'notifications' ? (
          <NotificationsView notifications={notifications} />
        ) : null}
      </div>

      <CreateMeetingModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={reloadData}
        token={token}
        users={users}
        tags={tags}
        currentUserId={user.id}
      />

      {successModalMessage ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-2xl font-semibold text-slate-800">Done</h3>
            <p className="mt-2 text-sm text-slate-600">{successModalMessage}</p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSuccessModalMessage('')}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isPreviewOpen && selectedMeetingDetail ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">Meeting Preview (PDF Style)</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={exportMeetingPreviewPdf}
                  className="rounded-lg bg-blue-600 px-3 py-1 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Export PDF
                </button>
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  className="rounded-lg border border-slate-200 px-3 py-1 text-sm"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="max-h-[75vh] overflow-auto rounded-xl bg-slate-100 p-5">
              <article className="mx-auto w-full max-w-[794px] rounded bg-white p-8 shadow">
                <h1 className="text-3xl font-semibold text-slate-900">{selectedMeetingDetail.meeting.title}</h1>
                <p className="mt-2 text-sm text-slate-600">{formatDateTime(selectedMeetingDetail.meeting.startsAt)}</p>
                <h2 className="mt-6 text-lg font-semibold">Agenda</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{selectedMeetingDetail.meeting.description || '-'}</p>
                <h2 className="mt-6 text-lg font-semibold">Key Discussions</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{selectedMeetingDetail.meeting.keyDiscussions || '-'}</p>
                <h2 className="mt-6 text-lg font-semibold">Meeting Minutes</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{selectedMeetingDetail.meeting.meetingMinutes || '-'}</p>
                <h2 className="mt-6 text-lg font-semibold">Action Items</h2>
                <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                  {selectedMeetingDetail.actionItems.map((item) => (
                    <li key={item.id}>
                      {item.title}
                      {' - '}
                      {selectedMeetingDetail.participants.find((participant) => participant.userId === item.assigneeId)
                        ?.name || 'Unassigned'}
                      {' - '}
                      {item.dueDate ? formatDateOnly(item.dueDate) : 'No due date'}
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

function App() {
  const [authState, setAuthState] = useState(() => {
    const token = localStorage.getItem('authToken')
    const userRaw = localStorage.getItem('authUser')

    if (!token || !userRaw) {
      return null
    }

    try {
      return { token, user: JSON.parse(userRaw) }
    } catch {
      return null
    }
  })

  const handleLogin = ({ token, user }) => {
    localStorage.setItem('authToken', token)
    localStorage.setItem('authUser', JSON.stringify(user))
    setAuthState({ token, user })
  }

  const handleLogout = () => {
    localStorage.removeItem('authToken')
    localStorage.removeItem('authUser')
    setAuthState(null)
  }

  if (!authState) {
    return <LoginView onLogin={handleLogin} />
  }

  return <AppShell token={authState.token} user={authState.user} onLogout={handleLogout} />
}

export default App
