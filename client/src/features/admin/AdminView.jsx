import { useEffect, useState } from 'react'
import { CalendarDays, History, Search, ShieldCheck, Users } from 'lucide-react'

import { PageHeader } from '../../components/layout/PageHeader.jsx'
import { getApiClient } from '../../lib/apiClient.js'
import { createUser, deleteUser, updateUser } from '../../services/userService.js'
import { AddUserForm } from './AddUserForm.jsx'
import {
  addMeetingParticipants,
  getMeetingDetail,
  listMeetings,
  removeMeetingParticipant,
  updateMeeting,
} from '../../services/meetingService.js'

export const AdminView = ({
  currentUser,
  token,
  users = [],
  meetings = [],
  notifications = [],
}) => {
  const [selectedArea, setSelectedArea] = useState('users')
  const [managedUsers, setManagedUsers] = useState(null)
  const [managedMeetings, setManagedMeetings] = useState(meetings)
  const [userSearch, setUserSearch] = useState('')
  const [meetingSearch, setMeetingSearch] = useState('')
  const [userPage, setUserPage] = useState(1)
  const [meetingPage, setMeetingPage] = useState(1)
  const [expandedMeeting, setExpandedMeeting] = useState(null)
  const [meetingDetails, setMeetingDetails] = useState({})
  const [meetingDraft, setMeetingDraft] = useState(null)
  const [addUserMeeting, setAddUserMeeting] = useState(null)
  const [pendingParticipant, setPendingParticipant] = useState('')
  const [saveNotice, setSaveNotice] = useState('')
  const [adminActivities, setAdminActivities] = useState([])
  const [expandedUser, setExpandedUser] = useState(null)
  const [draft, setDraft] = useState(null)
  const displayUsers = managedUsers ?? users

  useEffect(() => {
    let active = true
    listMeetings(getApiClient(token), { limit: 100 })
      .then((loaded) => {
        if (active) setManagedMeetings(loaded)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [token])
  const filteredUsers = displayUsers.filter((item) => {
    const q = userSearch.trim().toLowerCase()
    return !q || item.name.toLowerCase().includes(q) || item.email.toLowerCase().includes(q)
  })
  const pagedUsers = filteredUsers.slice((userPage - 1) * 5, userPage * 5)
  const userPageCount = Math.max(1, Math.ceil(filteredUsers.length / 5))
  const filteredMeetings = managedMeetings.filter((meeting) => {
    const q = meetingSearch.trim().toLowerCase()
    return (
      !q ||
      [meeting.title, meeting.ownerName, meeting.status].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(q)
      )
    )
  })
  const pagedMeetings = filteredMeetings.slice((meetingPage - 1) * 5, meetingPage * 5)
  const meetingPageCount = Math.max(1, Math.ceil(filteredMeetings.length / 5))
  const formatMeetingDate = (value) =>
    value
      ? new Date(value).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : 'Date not set'
  const addAdminActivity = (title, detail) => {
    setAdminActivities((previous) => [
      {
        id: `${Date.now()}-${title}`,
        title,
        detail,
        eventAt: new Date().toISOString(),
      },
      ...previous,
    ])
  }
  const saveUser = async (event) => {
    event.preventDefault()
    if (!draft || draft.id === currentUser.id) return
    const previousUser = displayUsers.find((item) => item.id === draft.id)
    const updated = await updateUser(getApiClient(token), draft.id, draft)
    setManagedUsers((previous) =>
      (previous ?? users).map((item) => (item.id === updated.id ? updated : item))
    )
    const changedFields = [
      previousUser?.name !== updated.name ? 'name' : null,
      previousUser?.email !== updated.email ? 'email' : null,
      previousUser?.role !== updated.role ? 'role' : null,
      previousUser?.department !== updated.department ? 'department' : null,
      draft.password ? 'password' : null,
    ].filter(Boolean)
    addAdminActivity(
      `Updated user: ${updated.name}`,
      `${currentUser.name} updated ${changedFields.join(', ') || 'the account'} for ${previousUser?.name || updated.name}.`
    )
    setExpandedUser(null)
    setDraft(null)
  }
  const addUser = async (payload) => {
    const created = await createUser(getApiClient(token), payload)
    setManagedUsers((previous) =>
      [...(previous ?? users), created].sort((left, right) => left.name.localeCompare(right.name))
    )
    addAdminActivity(
      `Created user: ${created.name}`,
      `${currentUser.name} created a ${created.role} account for ${created.email}.`
    )
    setSaveNotice(`Account created for ${created.email}`)
    window.setTimeout(() => setSaveNotice(''), 3000)
  }
  const removeUser = async (id) => {
    if (!window.confirm('Delete this user?')) return
    const removedUser = displayUsers.find((item) => item.id === id)
    await deleteUser(getApiClient(token), id)
    setManagedUsers((previous) => (previous ?? users).filter((item) => item.id !== id))
    addAdminActivity(
      `Deleted user: ${removedUser?.name || 'Unknown user'}`,
      `${currentUser.name} deleted ${removedUser?.email || 'a user account'}.`
    )
    setExpandedUser(null)
  }
  const openMeeting = async (meeting) => {
    if (expandedMeeting === meeting.id) {
      setExpandedMeeting(null)
      setMeetingDraft(null)
      setAddUserMeeting(null)
      setPendingParticipant('')
      return
    }
    setExpandedMeeting(meeting.id)
    setMeetingDraft({
      title: meeting.title,
      location: meeting.location || '',
      description: meeting.description || '',
    })
    if (!meetingDetails[meeting.id]) {
      try {
        const detail = await getMeetingDetail(getApiClient(token), meeting.id)
        setMeetingDetails((prev) => ({ ...prev, [meeting.id]: detail }))
      } catch (error) {
        window.alert(error.response?.data?.error || 'Unable to load meeting details')
      }
    }
  }
  const saveMeeting = async (event, meetingId) => {
    event.preventDefault()
    try {
      const previousMeeting = managedMeetings.find((item) => item.id === meetingId)
      const meeting = await updateMeeting(getApiClient(token), meetingId, meetingDraft)
      setManagedMeetings((prev) =>
        prev.map((item) => (item.id === meetingId ? { ...item, ...meeting } : item))
      )
      setMeetingDetails((prev) => ({ ...prev, [meetingId]: { ...prev[meetingId], meeting } }))
      const changedFields = [
        previousMeeting?.title !== meeting.title ? 'title' : null,
        (previousMeeting?.location || '') !== (meeting.location || '') ? 'location' : null,
        (previousMeeting?.description || '') !== (meeting.description || '') ? 'description' : null,
      ].filter(Boolean)
      setSaveNotice('The meeting is saved.')
      addAdminActivity(
        `Updated meeting: ${meeting.title}`,
        `${currentUser.name} updated ${changedFields.join(', ') || 'meeting details'}.`
      )
      window.setTimeout(() => setSaveNotice(''), 3000)
      setExpandedMeeting(null)
      setMeetingDraft(null)
    } catch (error) {
      setSaveNotice(error.response?.data?.error || 'Unable to save meeting.')
    }
  }
  const addMeetingUser = async (meetingId, userId) => {
    const added = await addMeetingParticipants(getApiClient(token), meetingId, {
      userIds: [userId],
    })
    setMeetingDetails((prev) => {
      const current = prev[meetingId]?.participants || []
      const merged = [
        ...current,
        ...added.filter((item) => !current.some((existing) => existing.userId === item.userId)),
      ]
      return { ...prev, [meetingId]: { ...prev[meetingId], participants: merged } }
    })
    const meeting = managedMeetings.find((item) => item.id === meetingId)
    const addedUser = displayUsers.find((item) => item.id === userId)
    addAdminActivity(
      `Added participant: ${addedUser?.name || 'Unknown user'}`,
      `${currentUser.name} added this user to ${meeting?.title || 'a meeting'}.`
    )
  }
  const removeMeetingUser = async (meetingId, userId) => {
    if (!window.confirm('Remove this person from the meeting?')) return
    const meeting = managedMeetings.find((item) => item.id === meetingId)
    const removedParticipant = meetingDetails[meetingId]?.participants?.find(
      (item) => item.userId === userId
    )
    await removeMeetingParticipant(getApiClient(token), meetingId, userId)
    setMeetingDetails((prev) => ({
      ...prev,
      [meetingId]: {
        ...prev[meetingId],
        participants: prev[meetingId].participants.filter((item) => item.userId !== userId),
      },
    }))
    addAdminActivity(
      `Removed participant: ${removedParticipant?.name || 'Unknown user'}`,
      `${currentUser.name} removed this user from ${meeting?.title || 'a meeting'}.`
    )
  }
  const areas = [
    ['users', 'Manage Users', 'Manage accounts and access roles', Users],
    ['meetings', 'Manage Meetings', 'Review meetings across the workspace', CalendarDays],
    ['activities', 'Admin Activities Log', 'Review administrative changes', History],
  ]

  return (
    <section className="min-w-0 space-y-6">
      <PageHeader
        eyebrow="System administration"
        title="Admin"
        description={`Manage the Meeting Management System, ${currentUser?.name || 'Admin'}.`}
        icon={ShieldCheck}
        accent="violet"
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {areas.map(([key, title, description, icon]) => {
          const AreaIcon = icon
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedArea(key)}
              className={`rounded-2xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${selectedArea === key ? 'border-violet-300 bg-violet-50/40 ring-2 ring-violet-100' : 'border-slate-200 bg-white'}`}
            >
              <AreaIcon className="h-6 w-6 text-violet-600" />
              <h2 className="mt-4 text-base font-extrabold text-slate-800">{title}</h2>
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            </button>
          )
        })}
      </div>
      <article className="rounded-2xl border border-violet-100 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-extrabold text-slate-800">
          {selectedArea === 'users'
            ? 'Manage Users'
            : selectedArea === 'meetings'
              ? 'Manage Meetings'
              : 'Admin Activities Log'}
        </h2>
        {saveNotice ? (
          <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
            ✓ {saveNotice}
          </p>
        ) : null}
        {selectedArea === 'users' ? (
          <div className="mt-4 space-y-3">
            <AddUserForm onCreate={addUser} />
            <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value)
                  setUserPage(1)
                  setExpandedUser(null)
                }}
                placeholder="Search users by name or email..."
                className="min-w-0 flex-1 text-sm outline-none"
              />
            </label>
            {pagedUsers.map((item) => {
              const isAdmin = item.role === 'admin'
              const isOpen = expandedUser === item.id
              return (
                <div
                  key={item.id}
                  className={`rounded-xl border transition ${isOpen ? 'border-violet-200 bg-violet-50/20' : 'border-slate-100 bg-slate-50'}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedUser(isOpen ? null : item.id)
                      setDraft(isOpen ? null : { ...item, password: '' })
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-700">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.email}</p>
                    </div>
                    <span className="flex items-center gap-2">
                      <span className="rounded-full bg-slate-200 px-2 py-1 text-[11px] font-bold capitalize">
                        {item.role}
                      </span>
                      <span className="text-slate-400">{isOpen ? '⌃' : '⌄'}</span>
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="border-t border-violet-100 px-3 py-3">
                      {isAdmin ? (
                        <p className="text-xs font-semibold text-violet-700">
                          Admin account — editing and deleting this account is disabled.
                        </p>
                      ) : (
                        <form onSubmit={saveUser} className="grid gap-2 sm:grid-cols-2">
                          <input
                            required
                            value={draft.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                          />
                          <input
                            required
                            type="email"
                            value={draft.email}
                            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                          />
                          <select
                            value={draft.role}
                            onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                          >
                            <option value="staff">Staff</option>
                            <option value="admin">Admin</option>
                          </select>
                          <input
                            minLength={8}
                            type="password"
                            placeholder="New password (optional)"
                            value={draft.password}
                            onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                          />
                          <div className="flex gap-2 sm:col-span-2">
                            <button className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">
                              Save changes
                            </button>
                            <button
                              type="button"
                              onClick={() => removeUser(item.id)}
                              className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-rose-600"
                            >
                              Delete user
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-400">
                Showing {filteredUsers.length} users · 5 per page
              </p>
              <div className="flex gap-1">
                {Array.from({ length: userPageCount }, (_, index) => index + 1).map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => {
                      setUserPage(page)
                      setExpandedUser(null)
                    }}
                    className={`h-7 min-w-7 rounded-md px-2 text-xs font-bold ${page === userPage ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {page}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        {selectedArea === 'meetings' ? (
          <div className="mt-4 space-y-3">
            <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={meetingSearch}
                onChange={(e) => {
                  setMeetingSearch(e.target.value)
                  setMeetingPage(1)
                }}
                placeholder="Search meetings..."
                className="min-w-0 flex-1 text-sm outline-none"
              />
            </label>
            <div className="space-y-2">
              {pagedMeetings.map((meeting) => {
                const isOpen = expandedMeeting === meeting.id
                const detail = meetingDetails[meeting.id]
                return (
                  <div key={meeting.id} className="rounded-xl border border-slate-100 bg-slate-50">
                    <button
                      type="button"
                      onClick={() => openMeeting(meeting)}
                      className="flex w-full items-center justify-between px-3 py-3 text-left"
                    >
                      <div>
                        <p className="text-sm font-bold text-slate-800">{meeting.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatMeetingDate(meeting.startsAt)} ·{' '}
                          {meeting.ownerName || 'Owner not set'}
                        </p>
                      </div>
                      <span>{isOpen ? '⌃' : '⌄'}</span>
                    </button>
                    {isOpen ? (
                      <div className="border-t border-violet-100 p-3">
                        {detail ? (
                          <>
                            <form
                              onSubmit={(event) => saveMeeting(event, meeting.id)}
                              className="flex w-full flex-col gap-2"
                            >
                              <label className="block text-xs font-bold text-slate-600">
                                Meeting title
                                <input
                                  required
                                  value={meetingDraft?.title || ''}
                                  onChange={(event) =>
                                    setMeetingDraft({ ...meetingDraft, title: event.target.value })
                                  }
                                  className="h-9 w-full rounded-lg border bg-white px-2 text-sm"
                                  placeholder="Meeting title"
                                />
                              </label>
                              <label className="block text-xs font-bold text-slate-600">
                                Location / meeting link
                                <input
                                  value={meetingDraft?.location || ''}
                                  onChange={(event) =>
                                    setMeetingDraft({
                                      ...meetingDraft,
                                      location: event.target.value,
                                    })
                                  }
                                  className="h-9 w-full rounded-lg border bg-white px-2 text-sm"
                                  placeholder="Location"
                                />
                              </label>
                              <label className="block text-xs font-bold text-slate-600 sm:col-span-2">
                                Meeting summary
                                <textarea
                                  value={meetingDraft?.description || ''}
                                  onChange={(event) =>
                                    setMeetingDraft({
                                      ...meetingDraft,
                                      description: event.target.value,
                                    })
                                  }
                                  className="min-h-16 w-full rounded-lg border bg-white px-2 py-1 text-sm"
                                  placeholder="Description"
                                />
                              </label>
                              <button
                                type="submit"
                                className="ml-auto w-fit self-end rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
                              >
                                Save meeting
                              </button>
                            </form>
                            <div className="mt-3 space-y-3">
                              <div className="rounded-xl border border-slate-200 bg-white p-3">
                                <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                                  Existing users
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {detail.participants.map((participant) => (
                                    <button
                                      key={participant.userId}
                                      type="button"
                                      onClick={() =>
                                        removeMeetingUser(meeting.id, participant.userId)
                                      }
                                      className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
                                    >
                                      {participant.name} ×
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border-2 border-blue-200 bg-blue-50 p-3">
                                <p className="mr-auto text-xs font-extrabold uppercase tracking-wide text-blue-800">
                                  Add users to this meeting
                                </p>
                                <div className="flex flex-wrap items-center gap-2">
                                  {addUserMeeting === meeting.id ? (
                                    <>
                                      <select
                                        value={pendingParticipant}
                                        onChange={(event) =>
                                          setPendingParticipant(event.target.value)
                                        }
                                        className="h-9 min-w-48 rounded-lg border border-blue-200 bg-white px-2 text-xs"
                                      >
                                        <option value="">Select person...</option>
                                        {users
                                          .filter(
                                            (user) =>
                                              !detail.participants.some(
                                                (participant) => participant.userId === user.id
                                              )
                                          )
                                          .map((user) => (
                                            <option key={user.id} value={user.id}>
                                              {user.name}
                                            </option>
                                          ))}
                                      </select>
                                      <button
                                        type="button"
                                        disabled={!pendingParticipant}
                                        onClick={async () => {
                                          await addMeetingUser(meeting.id, pendingParticipant)
                                          setPendingParticipant('')
                                          setAddUserMeeting(null)
                                        }}
                                        className="h-9 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white disabled:bg-slate-300"
                                      >
                                        Add
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setAddUserMeeting(meeting.id)}
                                      className="h-9 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700"
                                    >
                                      Add user
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-slate-500">Loading meeting details…</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
            {filteredMeetings.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">
                No meetings found.
              </p>
            ) : (
              <div className="flex gap-1">
                {Array.from({ length: meetingPageCount }, (_, index) => index + 1).map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setMeetingPage(page)}
                    className={`h-7 min-w-7 rounded-md px-2 text-xs font-bold ${page === meetingPage ? 'bg-violet-600 text-white' : 'bg-slate-100'}`}
                  >
                    {page}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
        {selectedArea === 'activities' ? (
          <div className="mt-4 space-y-2">
            {[...adminActivities, ...notifications].length ? (
              [...adminActivities, ...notifications].slice(0, 12).map((item) => (
                <div key={item.id} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-sm font-bold text-slate-800">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
                  {item.eventAt || item.createdAt ? (
                    <p className="mt-2 text-[11px] font-semibold text-slate-400">
                      {new Date(item.eventAt || item.createdAt).toLocaleString()}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">
                No admin activity has been logged yet.
              </p>
            )}
          </div>
        ) : null}
      </article>
    </section>
  )
}
