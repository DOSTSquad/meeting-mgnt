import { getApiClient } from '../../lib/apiClient.js'
import {
  archiveReadNotifications,
  getNotificationSummary,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  sortNotificationsUnreadFirst,
} from '../../services/notificationService.js'

export const useNotificationActions = ({
  token,
  navigate,
  notificationNextCursor,
  isLoadingMoreNotifications,
  setNotifications,
  setNotificationCount,
  setNotificationNextCursor,
  setIsLoadingMoreNotifications,
  setErrorMessage,
  setActiveMeetingRequestId,
  setIsCreateModalOpen,
}) => {
  const loadMoreNotifications = async () => {
    if (!notificationNextCursor || isLoadingMoreNotifications) {
      return
    }

    setIsLoadingMoreNotifications(true)

    try {
      const client = getApiClient(token)
      const page = await listNotifications(client, {
        cursor: notificationNextCursor,
        limit: 10,
      })

      setNotifications((prev) => sortNotificationsUnreadFirst([...prev, ...page.notifications]))
      setNotificationNextCursor(page.nextCursor)
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to load more notifications')
    } finally {
      setIsLoadingMoreNotifications(false)
    }
  }

  const markAllNotificationsReadInMenu = async () => {
    try {
      const client = getApiClient(token)
      await markAllNotificationsRead(client)
      const summary = await getNotificationSummary(client)

      setNotifications(summary.notifications)
      setNotificationCount(summary.unreadCount)
      setNotificationNextCursor(summary.nextCursor)
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to mark notifications read')
    }
  }

  const archiveReadNotificationsInMenu = async () => {
    try {
      const client = getApiClient(token)
      await archiveReadNotifications(client)
      const summary = await getNotificationSummary(client)

      setNotifications(summary.notifications)
      setNotificationCount(summary.unreadCount)
      setNotificationNextCursor(summary.nextCursor)
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to archive read notifications')
    }
  }

  const markNotificationReadInMenu = async (notification, { suppressError = false } = {}) => {
    if (!notification?.id || notification.isRead || notification.readAt) {
      return
    }

    const readAt = new Date().toISOString()
    setNotifications((prev) =>
      sortNotificationsUnreadFirst(
        prev.map((item) =>
          item.id === notification.id
            ? {
                ...item,
                readAt,
                isRead: true,
              }
            : item
        )
      )
    )
    setNotificationCount((prev) => Math.max(0, prev - 1))

    try {
      const client = getApiClient(token)
      const updatedNotification = await markNotificationRead(client, notification.id)
      if (updatedNotification) {
        setNotifications((prev) =>
          sortNotificationsUnreadFirst(
            prev.map((item) => (item.id === notification.id ? updatedNotification : item))
          )
        )
      }
    } catch (error) {
      setNotifications((prev) =>
        sortNotificationsUnreadFirst(
          prev.map((item) =>
            item.id === notification.id
              ? {
                  ...item,
                  readAt: notification.readAt ?? null,
                  isRead: Boolean(notification.isRead),
                }
              : item
          )
        )
      )
      setNotificationCount((prev) => prev + 1)
      if (!suppressError) {
        setErrorMessage(error.response?.data?.error || 'Unable to mark notification read')
      }
    }
  }

  const openNotificationTarget = async (notification) => {
    await markNotificationReadInMenu(notification, { suppressError: true })

    if (!notification?.entityType || !notification.entityId) {
      return
    }

    if (notification.entityType === 'meeting') {
      navigate(`/meetings/${notification.entityId}`)
      return
    }

    if (notification.entityType === 'action_item') {
      navigate(`/action-items?item=${notification.entityId}`)
      return
    }

    if (notification.entityType === 'meeting_request') {
      if (notification.type === 'meeting_request_invited') {
        navigate('/dashboard')
        return
      }

      setActiveMeetingRequestId(notification.entityId)
      setIsCreateModalOpen(true)
    }
  }

  return {
    archiveReadNotificationsInMenu,
    loadMoreNotifications,
    markAllNotificationsReadInMenu,
    openNotificationTarget,
  }
}
