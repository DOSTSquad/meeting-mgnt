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

const priorityClassName = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-rose-100 text-rose-700',
}

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
                Demo login: <span className="font-semibold">paveen.anuntakulnatee@seed.local</span> /{' '}
                <span className="font-semibold">Password123!</span>
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

const Sidebar = ({ activePage, onSelect, onLogout, currentUser }) => (
  <aside className="w-full bg-slate-900 text-white lg:w-72">
    <div className="flex h-full flex-col px-5 py-6">
      <div className="mb-8 flex items-center gap-3">
        <img src="/logo.png" alt="Meeting Manager logo" className="h-8 w-auto" />
        <span className="text-2xl font-semibold">Meeting Manager</span>
      </div>
      <nav className="space-y-2">
        {menuItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`block w-full rounded-lg px-3 py-2 text-left text-xl transition ${
              activePage === item.id ? 'bg-slate-800' : 'hover:bg-slate-800/70'
            }`}
          >
            {item.label}
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

const DashboardView = ({ data, onOpenCreateModal, onResetMeetingItems, onOpenMeeting }) => (
  <section className="space-y-6">
    <div>
      <h1 className="text-5xl font-semibold text-slate-800">Dashboard</h1>
      <p className="mt-2 text-lg text-slate-500">Welcome back! Here&apos;s what&apos;s happening today.</p>
    </div>

    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-4xl font-semibold text-slate-700">Quick Start</h2>
          <p className="mt-2 text-lg text-slate-500">Create a new meeting or manage existing ones</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onResetMeetingItems}
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50"
          >
            Reset Meeting Items
          </button>
          <button
            type="button"
            onClick={onOpenCreateModal}
            className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
          >
            + New Meeting
          </button>
        </div>
      </div>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-3xl font-semibold text-slate-700">Recent Meetings</h2>
        <div className="space-y-3">
          {(data?.recentMeetings ?? []).map((meeting) => (
            <article key={meeting.id} className="rounded-xl border border-slate-200 p-4">
              <button
                type="button"
                onClick={() => onOpenMeeting(meeting.id)}
                className="text-left text-2xl font-semibold text-blue-700 hover:underline"
              >
                {meeting.title}
              </button>
              <p className="mt-2 text-slate-500">{formatDateTime(meeting.startsAt)}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-3xl font-semibold text-slate-700">My Action Items</h2>
        <div className="space-y-3">
          {(data?.myActionItems ?? []).map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 p-4">
              <p className="font-semibold text-slate-700">{item.title}</p>
              <p className="mt-1 text-sm text-slate-500">Due: {formatDateOnly(item.dueDate)}</p>
            </article>
          ))}
          {(data?.myActionItems ?? []).length === 0 ? (
            <p className="text-slate-500">No action items assigned.</p>
          ) : null}
        </div>
      </div>
    </div>
  </section>
)

const RepositoryView = ({ meetings, search, onSearch, onOpenMeeting }) => {
  const filteredMeetings = meetings.filter((meeting) =>
    meeting.title.toLowerCase().includes(search.trim().toLowerCase())
  )

  return (
    <section>
      <h1 className="text-5xl font-semibold text-slate-800">Meeting List</h1>
      <p className="mt-2 text-lg text-slate-500">Manage and access all your meeting documents</p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search documents..."
          className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
        />

        <div className="mt-4 overflow-auto">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-100 text-left text-sm text-slate-600">
                <th className="rounded-l-lg px-3 py-2">Meeting Title</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Time</th>
                <th className="rounded-r-lg px-3 py-2">Tag</th>
              </tr>
            </thead>
            <tbody>
              {filteredMeetings.map((meeting) => {
                const date = new Date(meeting.startsAt)
                const time = new Intl.DateTimeFormat(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(date)

                return (
                  <tr key={meeting.id} className="text-sm text-slate-700">
                    <td className="border-b border-slate-100 px-3 py-3">
                      <button
                        type="button"
                        onClick={() => onOpenMeeting(meeting.id)}
                        className="text-left font-medium text-blue-700 hover:underline"
                      >
                        {meeting.title}
                      </button>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">{formatDateOnly(meeting.startsAt)}</td>
                    <td className="border-b border-slate-100 px-3 py-3">{time}</td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-500">
                        {meeting.tag || '-'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

const FileRepositoryView = ({
  meetings,
  filesByMeeting,
  search,
  onSearch,
  selectedMeetingId,
  onSelectMeeting,
  onUploadFile,
  onOpenFile,
  onLoadAllFiles,
}) => {
  const documents = meetings.flatMap((meeting) =>
    (filesByMeeting[meeting.id] || []).map((file) => ({ ...file, meetingTitle: meeting.title, tag: meeting.tag }))
  )

  const filteredDocuments = documents.filter((file) =>
    file.fileName.toLowerCase().includes(search.trim().toLowerCase())
  )

  return (
    <section>
      <h1 className="text-5xl font-semibold text-slate-800">Meeting Repository</h1>
      <p className="mt-2 text-lg text-slate-500">Manage and access all your meeting documents</p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search meeting..."
            className="h-10 min-w-[260px] flex-1 rounded-lg border border-slate-200 px-3 text-sm"
          />
          <button
            type="button"
            onClick={onLoadAllFiles}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            All Meetings
          </button>
          <select
            value={selectedMeetingId}
            onChange={(event) => onSelectMeeting(event.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Select Meeting For Upload</option>
            {meetings.map((meeting) => (
              <option key={meeting.id} value={meeting.id}>
                {meeting.title}
              </option>
            ))}
          </select>
        </div>

        <label className="mt-3 block rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
          <div className="mx-auto mb-1 text-base">⇪</div>
          Drag & drop files here or browse
          <div className="text-xs text-slate-400">Upload meeting documents, agenda, or minutes</div>
          <input type="file" className="mt-2 w-full text-xs" onChange={(e) => onUploadFile(e.target.files?.[0] || null)} />
        </label>
      </div>

      <div className="mt-5">
        <h2 className="mb-3 text-lg font-semibold text-slate-700">Projects</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {meetings.slice(0, 4).map((meeting) => (
            <article key={meeting.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="font-semibold text-slate-700">{meeting.title}</p>
              <p className="mt-2 text-xs text-slate-500">{(filesByMeeting[meeting.id] || []).length} files</p>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <h2 className="mb-3 text-lg font-semibold text-slate-700">All Documents</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredDocuments.map((file) => (
            <article key={file.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <button
                type="button"
                onClick={() => onOpenFile(file.id)}
                className="text-left font-semibold text-blue-700 hover:underline"
              >
                {file.fileName}
              </button>
              <p className="mt-1 text-xs text-slate-500">{formatDateOnly(file.createdAt)}</p>
              <p className="mt-1 text-xs text-slate-400">{file.meetingTitle}</p>
              <p className="mt-1 text-xs text-blue-500">{file.tag || '-'}</p>
            </article>
          ))}
          {filteredDocuments.length === 0 ? <p className="text-sm text-slate-500">No files uploaded yet</p> : null}
        </div>
      </div>
    </section>
  )
}

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
  onUploadMeetingFile,
  onUploadMeetingAudio,
  onPreview,
}) => {
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
            <h2 className="text-2xl font-semibold text-slate-700">Basic Information</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input
                value={detail.meeting.title || ''}
                onChange={(event) => onChange('title', event.target.value)}
                className="h-11 rounded-xl border border-slate-200 px-3"
                placeholder="Meeting title"
              />
              <input
                value={detail.meeting.location || ''}
                onChange={(event) => onChange('location', event.target.value)}
                className="h-11 rounded-xl border border-slate-200 px-3"
                placeholder="Location"
              />
              <input
                type="date"
                value={(detail.meeting.startsAt || '').slice(0, 10)}
                onChange={(event) => onChange('date', event.target.value)}
                className="h-11 rounded-xl border border-slate-200 px-3"
              />
              <input
                type="time"
                value={new Date(detail.meeting.startsAt).toISOString().slice(11, 16)}
                onChange={(event) => onChange('time', event.target.value)}
                className="h-11 rounded-xl border border-slate-200 px-3"
              />
              <input
                value={detail.meeting.facilitator || ''}
                onChange={(event) => onChange('facilitator', event.target.value)}
                className="h-11 rounded-xl border border-slate-200 px-3"
                placeholder="Facilitator"
              />
              <input
                value={detail.meeting.recorder || ''}
                onChange={(event) => onChange('recorder', event.target.value)}
                className="h-11 rounded-xl border border-slate-200 px-3"
                placeholder="Recorder"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-2xl font-semibold text-slate-700">Agenda</h2>
            <textarea
              rows={4}
              value={detail.meeting.description || ''}
              onChange={(event) => onChange('description', event.target.value)}
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-2xl font-semibold text-slate-700">Key Discussions</h2>
            <textarea
              rows={4}
              value={detail.meeting.keyDiscussions || ''}
              onChange={(event) => onChange('keyDiscussions', event.target.value)}
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-2xl font-semibold text-slate-700">Meeting Minutes</h2>
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
                      onBlur={() => onActionItemSave(item.id)}
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
                      onBlur={() => onActionItemSave(item.id)}
                      className="h-9 w-full rounded-md border border-slate-200 px-2 text-xs"
                    />
                  </div>
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
            <div className="mt-3 rounded-xl border-2 border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">
              <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-300">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 16V4" />
                  <path d="m7 9 5-5 5 5" />
                  <path d="M20 16.5v2A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-2" />
                </svg>
              </div>
              Drag & drop files here or click to browse
            </div>
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              {detail.files.map((file) => (
                <li key={file.id}>{file.fileName}</li>
              ))}
              {detail.files.length === 0 ? <li>No files uploaded</li> : null}
            </ul>
            <input
              type="file"
              className="mt-3 w-full text-sm"
              onChange={(event) => onUploadMeetingFile(event.target.files?.[0] || null)}
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-2xl font-semibold text-slate-700">Upload Meeting Audio</h2>
            <div className="mt-3 rounded-xl border-2 border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">
              <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-300">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 16V4" />
                  <path d="m7 9 5-5 5 5" />
                  <path d="M20 16.5v2A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-2" />
                </svg>
              </div>
              Supports MP3, WAV, M4A
            </div>
            <input
              type="file"
              accept=".mp3,.wav,.m4a,audio/*"
              className="mt-3 w-full text-sm"
              onChange={(event) => onUploadMeetingAudio(event.target.files?.[0] || null)}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-2xl font-semibold text-slate-700">Attendees</h2>
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

const ActionItemsView = ({ actionItems }) => {
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
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-semibold ${priorityClassName[item.priority] || 'bg-slate-100 text-slate-700'}`}
                    >
                      {item.priority}
                    </span>
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

const NotificationsView = ({ notifications }) => (
  <section>
    <h1 className="text-5xl font-semibold text-slate-800">Notifications</h1>
    <p className="mt-2 text-lg text-slate-500">Stay updated with your meetings and action items</p>

    <div className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      {notifications.map((notification) => (
        <article key={`${notification.type}-${notification.meetingId}-${notification.actionItemId || ''}`} className="rounded-xl border border-slate-200 p-4">
          <p className="text-sm uppercase tracking-wide text-slate-400">{notification.type}</p>
          <p className="mt-1 text-lg font-semibold text-slate-700">{notification.title}</p>
          <p className="mt-1 text-sm text-slate-500">{notification.detail}</p>
          <p className="mt-2 text-sm text-slate-500">{formatDateTime(notification.eventAt)}</p>
        </article>
      ))}
      {notifications.length === 0 ? <p className="text-slate-500">No notifications.</p> : null}
    </div>
  </section>
)

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
            <div className="mt-2 flex items-center gap-4 text-xs text-slate-600">
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
  const [fileRepoMeetingId, setFileRepoMeetingId] = useState('')
  const [repositorySearch, setRepositorySearch] = useState('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedMeetingDetail, setSelectedMeetingDetail] = useState(null)
  const [successModalMessage, setSuccessModalMessage] = useState('')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

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
      setMeetings(meetingsRes.data?.meetings || [])
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
  }, [token, user.id, onLogout])

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
        setMeetings(meetingsRes.data?.meetings || [])
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
  }, [token, user.id, onLogout])

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
      await reloadData()
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

  const resetMeetingItems = async () => {
    try {
      const client = getApiClient(token)
      await client.post('/api/dev/reset-meeting-items')
      setSelectedMeetingDetail(null)
      setActivePage('dashboard')
      await reloadData()
      setSuccessModalMessage('Meeting items have been reset')
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to reset meeting items')
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
    if (!fileRepoMeetingId || !file) {
      setErrorMessage('Select a meeting first before uploading')
      return
    }

    try {
      const client = getApiClient(token)
      const formData = new FormData()
      formData.append('file', file)
      formData.append('description', 'Uploaded from file repository')
      await client.post(`/api/meetings/${fileRepoMeetingId}/files`, formData)
      await loadFilesForMeeting(fileRepoMeetingId)
      await reloadData()
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to upload file')
    }
  }

  useEffect(() => {
    if (activePage === 'file-repository' && meetings.length > 0) {
      loadAllFilesForMeetings()
    }
  }, [activePage, meetings.length, loadAllFilesForMeetings])

  const uploadFileToMeeting = async (file, type = 'material') => {
    if (!file || !selectedMeetingDetail?.meeting?.id) {
      return
    }

    try {
      const client = getApiClient(token)
      const formData = new FormData()
      formData.append('file', file)
      formData.append(
        'description',
        type === 'audio' ? 'Meeting audio upload from detail view' : 'Meeting material upload'
      )

      const response = await client.post(
        `/api/meetings/${selectedMeetingDetail.meeting.id}/files`,
        formData
      )

      setSelectedMeetingDetail((prev) =>
        prev
          ? {
              ...prev,
              files: [response.data?.file, ...(prev.files || [])].filter(Boolean),
            }
          : prev
      )
      setSuccessModalMessage('File uploaded successfully')
      await loadFilesForMeeting(selectedMeetingDetail.meeting.id)
      await reloadData()
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to upload file')
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 lg:flex">
      <Sidebar
        activePage={activePage}
        onSelect={setActivePage}
        onLogout={onLogout}
        currentUser={user}
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
            onResetMeetingItems={resetMeetingItems}
            onOpenMeeting={openMeetingDetail}
          />
        ) : null}
        {activePage === 'repository' ? (
          <RepositoryView
            meetings={meetings}
            search={repositorySearch}
            onSearch={setRepositorySearch}
            onOpenMeeting={openMeetingDetail}
          />
        ) : null}
        {activePage === 'file-repository' ? (
          <FileRepositoryView
            meetings={meetings}
            filesByMeeting={filesByMeeting}
            search={fileRepoSearch}
            onSearch={setFileRepoSearch}
            selectedMeetingId={fileRepoMeetingId}
            onSelectMeeting={setFileRepoMeetingId}
            onUploadFile={uploadFromRepository}
            onOpenFile={openUploadedFile}
            onLoadAllFiles={loadAllFilesForMeetings}
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
            onUploadMeetingFile={(file) => uploadFileToMeeting(file, 'material')}
            onUploadMeetingAudio={(file) => uploadFileToMeeting(file, 'audio')}
            onPreview={() => setIsPreviewOpen(true)}
          />
        ) : null}
        {activePage === 'action-items' ? <ActionItemsView actionItems={actionItems} /> : null}
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
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-1 text-sm"
              >
                Close
              </button>
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
                      {item.title} - {item.dueDate ? formatDateOnly(item.dueDate) : 'No due date'}
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
