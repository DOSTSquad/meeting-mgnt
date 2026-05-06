import { useEffect, useRef, useState } from 'react'
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
    unreadCard: 'border-blue-200 bg-blue-50',
    readCard: 'border-slate-200 bg-white',
    dot: 'bg-blue-500',
    time: 'text-blue-600',
  },
  amber: {
    unreadCard: 'border-orange-200 bg-orange-50',
    readCard: 'border-slate-200 bg-white',
    dot: 'bg-orange-500',
    time: 'text-orange-600',
  },
  neutral: {
    unreadCard: 'border-slate-200 bg-slate-50',
    readCard: 'border-slate-200 bg-white',
    dot: 'bg-slate-400',
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

export const Topbar = ({
  currentUser,
  notifications,
  notificationCount,
  notificationNextCursor,
  isLoadingMoreNotifications = false,
  onLoadMoreNotifications,
  onLogout,
}) => {
  const topbarRef = useRef(null)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [hasMarkedReadLocally, setHasMarkedReadLocally] = useState(false)
  const [locallyReadNotificationKeys, setLocallyReadNotificationKeys] = useState(() => new Set())
  const getNotificationKey = (item, index) =>
    item.key || `${item.type}-${item.meetingId || item.actionItemId || index}`
  const isNotificationRead = (item, index) =>
    hasMarkedReadLocally ||
    item.isRead ||
    locallyReadNotificationKeys.has(getNotificationKey(item, index))
  const unreadCount = hasMarkedReadLocally ? 0 : notificationCount

  useEffect(() => {
    if (!isNotificationsOpen && !isProfileOpen) {
      return undefined
    }

    const closeMenus = () => {
      setIsNotificationsOpen(false)
      setIsProfileOpen(false)
    }

    const handlePointerDown = (event) => {
      if (!topbarRef.current?.contains(event.target)) {
        closeMenus()
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeMenus()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isNotificationsOpen, isProfileOpen])

  return (
    <header ref={topbarRef} className="flex min-h-14 items-center justify-end gap-2">
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
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-white bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </button>

        {isNotificationsOpen ? (
          <div className="absolute right-0 z-20 mt-3 flex max-h-[calc(100vh-5rem)] w-[calc(100vw-2rem)] max-w-[30rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">Notifications</h2>
                {unreadCount > 0 ? (
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-500 px-2 text-xs font-bold text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  setHasMarkedReadLocally(true)
                  setLocallyReadNotificationKeys(
                    new Set(notifications.map((item, index) => getNotificationKey(item, index)))
                  )
                }}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
              >
                <CheckCheck className="h-4 w-4" />
                Mark read
              </button>
            </div>

            <div className="mt-4 border-t border-slate-200 pt-4">
              <div className="max-h-[22rem] overflow-y-auto overflow-x-hidden pb-3 pr-1">
                <div className="space-y-3">
                  {notifications.map((item, index) => {
                    const config = notificationCopy[item.type] || {
                      title: 'Notification',
                      tone: 'neutral',
                    }
                    const styles = toneStyles[config.tone] || toneStyles.neutral
                    const isRead = isNotificationRead(item, index)

                    return (
                      <article
                        key={`${item.type}-${item.meetingId || item.actionItemId || index}`}
                        className={`relative min-w-0 overflow-hidden rounded-lg border px-3 py-2.5 pl-7 transition ${
                          isRead ? styles.readCard : styles.unreadCard
                        }`}
                      >
                        {!isRead ? (
                          <span
                            className={`absolute left-3 top-4 h-2 w-2 rounded-full ${styles.dot}`}
                            aria-hidden="true"
                          />
                        ) : null}
                        <p
                          className={`truncate text-sm ${
                            isRead ? 'font-semibold text-slate-800' : 'font-bold text-slate-900'
                          }`}
                        >
                          {item.title || config.title}
                        </p>
                        <p
                          className={`mt-1 truncate text-xs ${
                            isRead ? 'font-medium text-slate-500' : 'font-semibold text-slate-600'
                          }`}
                        >
                          {item.detail || config.title}
                        </p>
                        <p
                          className={`mt-1 text-xs font-bold ${
                            isRead ? 'text-slate-400' : styles.time
                          }`}
                        >
                          {formatRelativeTime(item.eventAt)}
                        </p>
                      </article>
                    )
                  })}
                </div>
                {notifications.length === 0 ? (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                    No notifications.
                  </p>
                ) : null}
              </div>
            </div>

            {notificationNextCursor ? (
              <button
                type="button"
                onClick={onLoadMoreNotifications}
                disabled={isLoadingMoreNotifications}
                className="mt-3 flex h-9 w-full items-center justify-center text-sm font-bold text-slate-500 transition hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoadingMoreNotifications ? 'Loading...' : 'Show more'}
              </button>
            ) : null}
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
