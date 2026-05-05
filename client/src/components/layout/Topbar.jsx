import { useState } from 'react'

const getInitials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'

const notificationCopy = {
  meeting_created: 'New meeting created',
  task_assigned: 'Task assigned',
  rsvp_pending: 'RSVP pending',
  action_due: 'Action item due',
}

export const Topbar = ({ currentUser, notifications, notificationCount, onLogout }) => {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const recentNotifications = notifications.slice(0, 3)

  return (
    <header className="flex min-h-14 items-center justify-end gap-2">
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setIsNotificationsOpen((value) => !value)
            setIsProfileOpen(false)
          }}
          className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
          aria-label="Open notifications"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          {notificationCount > 0 ? (
            <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border border-white bg-rose-500" />
          ) : null}
        </button>

        {isNotificationsOpen ? (
          <div className="absolute right-0 z-20 mt-3 w-80 rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-900">Notifications</h2>
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-500">
                {notificationCount} unread
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {recentNotifications.map((item, index) => (
                <article
                  key={`${item.type}-${item.meetingId || item.actionItemId || index}`}
                  className={`rounded-lg border p-3 ${
                    index === 0
                      ? 'border-blue-200 bg-blue-50'
                      : index === 1
                        ? 'border-orange-200 bg-orange-50'
                        : 'border-slate-200 bg-white'
                  }`}
                >
                  <p className="text-sm font-bold text-slate-900">
                    {item.title || notificationCopy[item.type] || 'Notification'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.detail || notificationCopy[item.type]}
                  </p>
                </article>
              ))}
              {recentNotifications.length === 0 ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                  No notifications.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setIsProfileOpen((value) => !value)
            setIsNotificationsOpen(false)
          }}
          className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 text-left shadow-sm transition hover:border-blue-200"
          aria-label="Open profile menu"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
            {getInitials(currentUser?.name)}
          </span>
          <span className="hidden min-w-12 sm:block">
            <span className="block max-w-24 truncate text-xs font-bold text-slate-900">
              {currentUser?.name}
            </span>
            <span className="block text-[10px] text-slate-500">{currentUser?.role || 'User'}</span>
          </span>
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 text-slate-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {isProfileOpen ? (
          <div className="absolute right-0 z-20 mt-3 w-48 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
            <p className="px-2 py-2 text-xs text-slate-500">Signed in as</p>
            <p className="truncate px-2 text-sm font-semibold text-slate-900">
              {currentUser?.email}
            </p>
            <button
              type="button"
              onClick={onLogout}
              className="mt-3 w-full rounded-md px-2 py-2 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
            >
              Log out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
