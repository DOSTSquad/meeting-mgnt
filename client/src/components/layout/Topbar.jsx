import { useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'

const getInitials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'

const notificationCopy = {
  meeting_created: {
    title: 'Meeting created',
    tone: 'blue',
  },
  task_assigned: {
    title: 'Action item assigned',
    tone: 'amber',
  },
  action_due: {
    title: 'Action item is due today',
    tone: 'amber',
  },
}

const toneStyles = {
  blue: {
    card: 'border-blue-200 bg-blue-50',
    time: 'text-blue-600',
  },
  amber: {
    card: 'border-orange-200 bg-orange-50',
    time: 'text-orange-600',
  },
  neutral: {
    card: 'border-slate-200 bg-white',
    time: 'text-slate-500',
  },
}

const formatRelativeTime = (value) => {
  if (!value) {
    return 'Now'
  }

  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) {
    return 'Now'
  }

  const elapsedMs = Date.now() - timestamp
  const elapsedMinutes = Math.max(0, Math.round(elapsedMs / 60000))

  if (elapsedMinutes < 1) {
    return 'Now'
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min ago`
  }

  const elapsedHours = Math.round(elapsedMinutes / 60)
  if (elapsedHours < 24) {
    return `${elapsedHours} hr ago`
  }

  const elapsedDays = Math.round(elapsedHours / 24)
  return `${elapsedDays} day${elapsedDays === 1 ? '' : 's'} ago`
}

export const Topbar = ({ currentUser, notifications, notificationCount, onLogout }) => {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [readNotificationCount, setReadNotificationCount] = useState(0)
  const recentNotifications = notifications.slice(0, 3)
  const unreadCount = Math.max(0, notificationCount - readNotificationCount)

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
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unreadCount > 0 ? (
            <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border border-white bg-rose-500" />
          ) : null}
        </button>

        {isNotificationsOpen ? (
          <div className="absolute right-0 z-20 mt-3 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl sm:w-[30rem]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900">Notifications</h2>
              <button
                type="button"
                onClick={() => setReadNotificationCount(notificationCount)}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
              >
                <CheckCheck className="h-4 w-4" />
                Mark read
              </button>
            </div>

            <div className="mt-7 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-500">
                {unreadCount} unread update{unreadCount === 1 ? '' : 's'}
              </p>
              {unreadCount > 0 ? (
                <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-red-500 px-2 text-sm font-bold text-white">
                  {unreadCount}
                </span>
              ) : null}
            </div>

            <div className="mt-6 border-t border-slate-200 pt-4">
              <div className="space-y-3">
                {recentNotifications.map((item, index) => {
                  const config = notificationCopy[item.type] || {
                    title: 'Notification',
                    tone: 'neutral',
                  }
                  const styles =
                    toneStyles[index === 2 ? 'neutral' : config.tone] || toneStyles.neutral

                  return (
                    <article
                      key={`${item.type}-${item.meetingId || item.actionItemId || index}`}
                      className={`rounded-lg border p-4 ${styles.card}`}
                    >
                      <p className="text-sm font-bold text-slate-900">
                        {item.title || config.title}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">{item.detail || config.title}</p>
                      <p className={`mt-1 text-xs font-bold ${styles.time}`}>
                        {formatRelativeTime(item.eventAt)}
                      </p>
                    </article>
                  )
                })}
              </div>
              {recentNotifications.length === 0 ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                  No notifications.
                </p>
              ) : null}
            </div>

            <button
              type="button"
              className="mt-4 h-11 w-full rounded-lg border border-slate-200 bg-slate-50 text-sm font-bold text-blue-600 transition hover:border-blue-200 hover:bg-blue-50"
            >
              View all notifications
            </button>
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
