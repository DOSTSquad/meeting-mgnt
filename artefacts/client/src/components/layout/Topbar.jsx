import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { NotificationMenu } from '../../features/notifications/NotificationMenu.jsx'

const getInitials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'

export const Topbar = ({
  currentUser,
  notifications,
  notificationCount,
  notificationNextCursor,
  isLoadingMoreNotifications = false,
  onLoadMoreNotifications,
  onArchiveReadNotifications,
  onMarkAllNotificationsRead,
  onOpenNotification,
  onLogout,
}) => {
  const profileRef = useRef(null)
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  useEffect(() => {
    if (!isProfileOpen) {
      return undefined
    }

    const handlePointerDown = (event) => {
      if (!profileRef.current?.contains(event.target)) {
        setIsProfileOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsProfileOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isProfileOpen])

  return (
    <header className="flex min-h-14 items-center justify-end">
      <div className="flex h-11 items-center rounded-xl border border-slate-200/80 bg-white/80 px-2 shadow-sm shadow-slate-200/60 ring-1 ring-white/60">
        <NotificationMenu
          notifications={notifications}
          notificationCount={notificationCount}
          notificationNextCursor={notificationNextCursor}
          isLoadingMoreNotifications={isLoadingMoreNotifications}
          triggerClassName="relative flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-blue-700"
          onLoadMoreNotifications={onLoadMoreNotifications}
          onArchiveReadNotifications={onArchiveReadNotifications}
          onMarkAllNotificationsRead={onMarkAllNotificationsRead}
          onOpenNotification={onOpenNotification}
        />

        <span className="mx-1 h-6 w-px bg-slate-200" aria-hidden="true" />

        <div ref={profileRef} className="relative">
          <button
            type="button"
            onClick={() => setIsProfileOpen((value) => !value)}
            className="flex h-8 items-center gap-2 rounded-lg px-2 pr-2.5 text-left transition hover:bg-slate-100"
            aria-label="Open profile menu"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              {getInitials(currentUser?.name)}
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block max-w-32 truncate text-xs font-bold text-slate-900">
                {currentUser?.name}
              </span>
              <span className="block text-[10px] font-medium text-slate-500">
                {currentUser?.role || 'User'}
              </span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
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
      </div>
    </header>
  )
}
