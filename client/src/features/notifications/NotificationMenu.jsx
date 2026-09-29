import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, ArrowRight, Bell, CalendarDays, CheckSquare, CheckCheck } from 'lucide-react'

import { sortNotificationsUnreadFirst } from '../../services/notificationService.js'

const notificationCopy = {
  meeting_change_requested: {
    title: 'Meeting change requested',
    tone: 'amber',
    actionLabel: 'Read request',
    icon: CalendarDays,
  },
  meeting_created: {
    title: 'Meeting created',
    tone: 'blue',
    actionLabel: 'Open meeting',
    icon: CalendarDays,
  },
  task_assigned: {
    title: 'Action item assigned',
    tone: 'amber',
    actionLabel: 'View task',
    icon: CheckSquare,
  },
  action_due: {
    title: 'Action item is due today',
    tone: 'amber',
    actionLabel: 'View task',
    icon: CheckSquare,
  },
  meeting_request_invited: {
    title: 'Meeting request invite',
    tone: 'blue',
    actionLabel: 'Respond',
    icon: CalendarDays,
  },
  meeting_request_confirmed: {
    title: 'Meeting confirmed',
    tone: 'blue',
    actionLabel: 'Open meeting',
    icon: CalendarDays,
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

const getNotificationKey = (item, index) =>
  item.id ||
  item.key ||
  `${item.type}-${item.entityId || item.meetingId || item.actionItemId || index}`

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

export const NotificationMenu = ({
  notifications,
  notificationCount,
  notificationNextCursor,
  isLoadingMoreNotifications = false,
  triggerClassName = 'relative flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700',
  onLoadMoreNotifications,
  onArchiveReadNotifications,
  onMarkAllNotificationsRead,
  onOpenNotification,
}) => {
  const menuRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const [isOpen, setIsOpen] = useState(false)
  const [locallyReadNotificationKeys, setLocallyReadNotificationKeys] = useState(() => new Set())
  const unreadCount = notificationCount

  const isNotificationRead = (item, index) =>
    item.isRead ||
    Boolean(item.readAt) ||
    locallyReadNotificationKeys.has(getNotificationKey(item, index))
  const sortedNotifications = sortNotificationsUnreadFirst(
    notifications.map((item, index) => ({
      ...item,
      isRead: isNotificationRead(item, index),
    }))
  )
  const hasReadNotifications = sortedNotifications.some((item) => item.isRead || item.readAt)
  const loadMoreIfNearBottom = useCallback(() => {
    const element = scrollContainerRef.current

    if (!element || !notificationNextCursor || isLoadingMoreNotifications) {
      return
    }

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight
    if (distanceFromBottom <= 96) {
      onLoadMoreNotifications?.()
    }
  }, [isLoadingMoreNotifications, notificationNextCursor, onLoadMoreNotifications])

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    loadMoreIfNearBottom()
  }, [isOpen, loadMoreIfNearBottom, sortedNotifications.length])

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className={triggerClassName}
        aria-label="Open notifications"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-white bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="fixed left-4 right-4 top-16 z-50 flex h-[min(34rem,calc(100vh-5rem))] w-auto flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:z-20 sm:mt-3 sm:h-[min(42rem,calc(100vh-5rem))] sm:w-[calc(100vw-2rem)] sm:max-w-[30rem]">
          <div className="flex shrink-0 items-center justify-between gap-2 p-2.5 sm:gap-3 sm:p-4">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="hidden text-lg font-bold text-slate-900 sm:block">Notifications</h2>
              {unreadCount > 0 ? (
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-500 px-2 text-xs font-bold text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {hasReadNotifications ? (
                <button
                  type="button"
                  onClick={onArchiveReadNotifications}
                  className="hidden h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 sm:inline-flex"
                >
                  <Archive className="h-4 w-4" />
                  Archive read
                </button>
              ) : null}
              <button
                type="button"
                onClick={async () => {
                  setLocallyReadNotificationKeys(
                    new Set(notifications.map((item, index) => getNotificationKey(item, index)))
                  )
                  await onMarkAllNotificationsRead?.()
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 sm:h-9 sm:gap-2 sm:px-3"
              >
                <CheckCheck className="h-4 w-4" />
                Mark read
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 border-t border-slate-200 p-2.5 sm:p-4">
            <div
              ref={scrollContainerRef}
              onScroll={loadMoreIfNearBottom}
              className="h-full overflow-y-auto overflow-x-hidden pr-1"
            >
              <div className="space-y-2.5 sm:space-y-3">
                {sortedNotifications.map((item, index) => {
                  const config = notificationCopy[item.type] || {
                    title: 'Notification',
                    tone: 'neutral',
                    actionLabel: 'Open',
                    icon: Bell,
                  }
                  const styles = toneStyles[config.tone] || toneStyles.neutral
                  const isRead = isNotificationRead(item, index)
                  const NotificationIcon = config.icon || Bell

                  return (
                    <button
                      type="button"
                      key={getNotificationKey(item, index)}
                      onClick={async () => {
                        await onOpenNotification?.(item)
                        setIsOpen(false)
                      }}
                      className={`relative min-w-0 overflow-hidden rounded-lg border px-2.5 py-2 pl-5 transition sm:px-3 sm:py-2.5 sm:pl-7 ${
                        isRead ? styles.readCard : styles.unreadCard
                      } w-full cursor-pointer text-left hover:border-blue-200 hover:shadow-sm`}
                    >
                      {!isRead ? (
                        <span
                          className={`absolute left-2 top-3.5 h-2 w-2 rounded-full sm:left-3 sm:top-4 ${styles.dot}`}
                          aria-hidden="true"
                        />
                      ) : null}
                      <p
                        className={`truncate text-xs sm:text-sm ${
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
                      <div className="mt-2 flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <p
                          className={`hidden text-xs font-bold sm:block ${
                            isRead ? 'text-slate-400' : styles.time
                          }`}
                        >
                          {formatRelativeTime(item.eventAt)}
                        </p>
                        <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-blue-100 bg-white px-2 text-xs font-bold text-blue-700 shadow-sm transition">
                          <NotificationIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          {config.actionLabel || 'Open'}
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                      </div>
                    </button>
                  )
                })}
                {isLoadingMoreNotifications ? (
                  <p className="py-2 text-center text-sm font-semibold text-slate-500">
                    Loading more notifications...
                  </p>
                ) : null}
              </div>
              {notifications.length === 0 ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                  No notifications.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
