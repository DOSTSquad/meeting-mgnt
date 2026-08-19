import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { AppModals } from './components/layout/AppModals.jsx'
import { AppAlert } from './components/layout/AppAlert.jsx'
import { Sidebar } from './components/layout/Sidebar.jsx'
import { Topbar } from './components/layout/Topbar.jsx'
import { getApiClient } from './lib/apiClient.js'
import { ActionItemsView } from './features/action-items/ActionItemsView.jsx'
import { LoginView } from './features/auth/LoginView.jsx'
import { DashboardView } from './features/dashboard/DashboardView.jsx'
import { MeetingDetailView } from './features/meetings/MeetingDetailView.jsx'
import { InvitationResponseView } from './features/meetings/InvitationResponseView.jsx'
import { RepositoryView } from './features/meetings/RepositoryView.jsx'
import { useMeetingDetailController } from './features/meetings/useMeetingDetailController.js'
import { useNotificationActions } from './features/notifications/useNotificationActions.js'
import { listActionItems, updateActionItem } from './services/actionItemService.js'
import { loadAppData } from './services/appDataService.js'
import { getDashboard } from './services/dashboardService.js'
import { listMeetings } from './services/meetingService.js'

const getActivePage = (pathname) => {
  if (pathname.startsWith('/meetings')) {
    return 'repository'
  }

  if (pathname.startsWith('/action-items')) {
    return 'action-items'
  }

  return 'dashboard'
}

const PUBLIC_INVITATION_PATH = '/invitations/'

const AppShell = ({ token, user, onLogout }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const [dashboardData, setDashboardData] = useState(null)
  const [meetings, setMeetings] = useState([])
  const [actionItems, setActionItems] = useState([])
  const [ownedMeetingActionItems, setOwnedMeetingActionItems] = useState([])
  const [notifications, setNotifications] = useState([])
  const [notificationCount, setNotificationCount] = useState(0)
  const [notificationNextCursor, setNotificationNextCursor] = useState(null)
  const [isLoadingMoreNotifications, setIsLoadingMoreNotifications] = useState(false)
  const [users, setUsers] = useState([])
  const [tags, setTags] = useState([])
  const [repositorySearch, setRepositorySearch] = useState('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [activeMeetingRequestId, setActiveMeetingRequestId] = useState(null)
  const [activeAvailabilityRequest, setActiveAvailabilityRequest] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia('(max-width: 1023px)').matches
  )
  const activePage = getActivePage(location.pathname)
  const activeMeetingId = location.pathname.match(/^\/meetings\/([^/]+)$/)?.[1] ?? null
  const selectedActionItemIdFromQuery =
    activePage === 'action-items' ? new URLSearchParams(location.search).get('item') : null

  const reloadDashboardData = useCallback(async () => {
    try {
      const client = getApiClient(token)
      setDashboardData(await getDashboard(client))
    } catch (error) {
      if (error.response?.status === 401) {
        onLogout()
        return
      }
      setErrorMessage(error.response?.data?.error || 'Unable to load dashboard data')
    }
  }, [token, onLogout])

  const reloadMeetingsData = useCallback(async () => {
    try {
      const client = getApiClient(token)
      setMeetings(await listMeetings(client, { limit: 100 }))
    } catch (error) {
      if (error.response?.status === 401) {
        onLogout()
        return
      }
      setErrorMessage(error.response?.data?.error || 'Unable to load meetings')
    }
  }, [token, onLogout])

  const reloadActionItemsData = useCallback(async () => {
    try {
      const client = getApiClient(token)
      const [mine, owned] = await Promise.all([
        listActionItems(client),
        listActionItems(client, 'owned'),
      ])
      setActionItems(mine)
      setOwnedMeetingActionItems(owned)
    } catch (error) {
      if (error.response?.status === 401) {
        onLogout()
        return
      }
      setErrorMessage(error.response?.data?.error || 'Unable to load action items')
    }
  }, [token, onLogout])

  useEffect(() => {
    let isCancelled = false

    const load = async () => {
      try {
        const client = getApiClient(token)
        const appData = await loadAppData(client)

        if (isCancelled) {
          return
        }

        const loadedUsers = appData.users

        setNotifications(appData.notifications)
        setNotificationCount(appData.notificationCount)
        setNotificationNextCursor(appData.notificationNextCursor)
        setUsers(loadedUsers)
        setTags(appData.tags)

        const currentUserExists = loadedUsers.some((item) => item.id === user.id)
        if (!currentUserExists) {
          onLogout()
        }
      } catch (error) {
        if (isCancelled) {
          return
        }

        if (error.response?.status === 401) {
          onLogout()
          return
        }
        setErrorMessage(error.response?.data?.error || 'Unable to load app data')
      }
    }

    load()

    return () => {
      isCancelled = true
    }
  }, [token, user.id, onLogout])

  useEffect(() => {
    if (activePage !== 'dashboard') {
      return
    }

    let isCancelled = false

    const load = async () => {
      try {
        const client = getApiClient(token)
        const [dashboard, loadedMeetings, loadedActionItems] = await Promise.all([
          getDashboard(client),
          listMeetings(client, { limit: 100 }),
          listActionItems(client),
        ])

        if (!isCancelled) {
          setDashboardData(dashboard)
          setMeetings(loadedMeetings)
          setActionItems(loadedActionItems)
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

    load()

    return () => {
      isCancelled = true
    }
  }, [activePage, token, onLogout])

  useEffect(() => {
    if (activePage !== 'repository' || activeMeetingId) {
      return
    }

    let isCancelled = false

    const load = async () => {
      try {
        const client = getApiClient(token)
        const loadedMeetings = await listMeetings(client, { limit: 100 })

        if (!isCancelled) {
          setMeetings(loadedMeetings)
        }
      } catch (error) {
        if (isCancelled) {
          return
        }

        if (error.response?.status === 401) {
          onLogout()
          return
        }
        setErrorMessage(error.response?.data?.error || 'Unable to load meetings')
      }
    }

    load()

    return () => {
      isCancelled = true
    }
  }, [activeMeetingId, activePage, token, onLogout])

  useEffect(() => {
    if (activePage !== 'action-items') {
      return
    }

    let isCancelled = false

    const load = async () => {
      try {
        const client = getApiClient(token)
        const [loadedActionItems, loadedOwnedActionItems, loadedMeetings] = await Promise.all([
          listActionItems(client),
          listActionItems(client, 'owned'),
          listMeetings(client, { limit: 100 }),
        ])

        if (isCancelled) {
          return
        }

        setActionItems(loadedActionItems)
        setOwnedMeetingActionItems(loadedOwnedActionItems)
        setMeetings(loadedMeetings)
      } catch (error) {
        if (isCancelled) {
          return
        }

        if (error.response?.status === 401) {
          onLogout()
          return
        }
        setErrorMessage(error.response?.data?.error || 'Unable to load action items')
      }
    }

    load()

    return () => {
      isCancelled = true
    }
  }, [activePage, token, onLogout])

  const {
    archiveReadNotificationsInMenu,
    loadMoreNotifications,
    markAllNotificationsReadInMenu,
    openNotificationTarget,
  } = useNotificationActions({
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
  })

  const openMeetingDetail = (meetingId) => {
    navigate(`/meetings/${meetingId}`)
  }

  const handleSidebarSelect = (item) => {
    navigate(item.path)

    if (window.matchMedia('(max-width: 1023px)').matches) {
      setIsSidebarCollapsed(true)
    }
  }

  const openNewMeetingModal = async () => {
    if (meetings.length === 0) {
      await reloadMeetingsData()
    }

    setActiveMeetingRequestId(null)
    setIsCreateModalOpen(true)
  }

  const openMeetingRequestModal = (meetingRequestId) => {
    setActiveMeetingRequestId(meetingRequestId)
    setIsCreateModalOpen(true)
  }

  const openAvailabilityRequestModal = (request) => {
    setActiveAvailabilityRequest(request)
  }

  const closeCreateMeetingModal = () => {
    setIsCreateModalOpen(false)
    setActiveMeetingRequestId(null)
  }

  const handleCreatedMeeting = async (result) => {
    setActiveMeetingRequestId(null)
    if (result?.meeting?.id) {
      navigate(`/meetings/${result.meeting.id}`)
    } else if (activePage === 'dashboard') {
      await reloadDashboardData()
    }
  }

  const meetingDetail = useMeetingDetailController({
    token,
    activeMeetingId,
    onError: setErrorMessage,
  })
  const {
    selectedMeetingDetail,
    pendingMeetingMaterialFiles,
    pendingMeetingRecordingFile,
    isPreviewOpen,
    setIsPreviewOpen,
    updateMeetingDetailField,
    saveMeetingField,
    updateMeetingMinutesField,
    saveMeetingMinutesFields,
    addActionItemInDetail,
    updateActionItemStatusInDetail,
    editActionItemTitle,
    updateActionItemFieldsInDetail,
    saveActionItemTitle,
    removeActionItem,
    openUploadedFile,
    addPendingMeetingMaterialFiles,
    uploadRecording,
    removeRecording,
    generateMinutesFromActiveRecording,
  } = meetingDetail
  const canManageSelectedMeeting = Boolean(
    selectedMeetingDetail?.meeting?.ownerId === user.id ||
    selectedMeetingDetail?.participants?.some(
      (participant) => participant.userId === user.id && participant.role === 'organizer'
    )
  )

  const moveActionItemStatus = async (actionItemId, nextStatus) => {
    const previousActionItems = actionItems
    setActionItems((prev) =>
      prev.map((item) => (item.id === actionItemId ? { ...item, status: nextStatus } : item))
    )

    try {
      const client = getApiClient(token)
      await updateActionItem(client, actionItemId, { status: nextStatus })
      await reloadActionItemsData()
    } catch (error) {
      setActionItems(previousActionItems)
      setErrorMessage(error.response?.data?.error || 'Unable to update action item status')
    }
  }

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-slate-100">
      <div className={`flex min-h-screen w-full min-w-0 ${isPreviewOpen ? 'print:hidden' : ''}`}>
        <Sidebar
          activePage={activePage}
          isCollapsed={isSidebarCollapsed}
          onSelect={handleSidebarSelect}
          onToggle={() => setIsSidebarCollapsed((value) => !value)}
        />

        <div className="min-h-screen min-w-0 flex-1 px-4 py-4 sm:px-6 lg:px-8">
          <Topbar
            currentUser={user}
            notifications={notifications}
            notificationCount={notificationCount}
            notificationNextCursor={notificationNextCursor}
            isLoadingMoreNotifications={isLoadingMoreNotifications}
            onLoadMoreNotifications={loadMoreNotifications}
            onArchiveReadNotifications={archiveReadNotificationsInMenu}
            onMarkAllNotificationsRead={markAllNotificationsReadInMenu}
            onOpenNotification={openNotificationTarget}
            onLogout={onLogout}
          />

          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/dashboard"
              element={
                <DashboardView
                  data={dashboardData}
                  currentUser={user}
                  meetings={meetings}
                  allActionItems={actionItems}
                  onOpenCreateModal={openNewMeetingModal}
                  onOpenMeeting={openMeetingDetail}
                  onOpenMeetingRequest={openMeetingRequestModal}
                  onOpenAvailabilityRequest={openAvailabilityRequestModal}
                  onViewAllMeetings={() => navigate('/meetings')}
                  onViewAllActionItems={() => navigate('/action-items')}
                />
              }
            />
            <Route
              path="/meetings"
              element={
                <RepositoryView
                  meetings={meetings}
                  search={repositorySearch}
                  onSearch={setRepositorySearch}
                  onOpenMeeting={openMeetingDetail}
                />
              }
            />
            <Route
              path="/meetings/:meetingId"
              element={
                selectedMeetingDetail?.meeting?.id === activeMeetingId ? (
                  <MeetingDetailView
                    detail={selectedMeetingDetail}
                    onBack={() => navigate('/meetings')}
                    onChange={updateMeetingDetailField}
                    onSaveMeetingField={saveMeetingField}
                    onMinutesChange={updateMeetingMinutesField}
                    onSaveMinutes={saveMeetingMinutesFields}
                    onAddActionItem={addActionItemInDetail}
                    onActionItemChange={editActionItemTitle}
                    onActionItemSave={saveActionItemTitle}
                    onActionItemStatusChange={updateActionItemStatusInDetail}
                    onActionItemPatch={updateActionItemFieldsInDetail}
                    onActionItemRemove={removeActionItem}
                    pendingMaterialFiles={pendingMeetingMaterialFiles}
                    pendingRecordingFile={pendingMeetingRecordingFile}
                    onAddPendingMaterialFiles={addPendingMeetingMaterialFiles}
                    onUploadRecording={uploadRecording}
                    onRemoveRecording={removeRecording}
                    onGenerateMinutesFromRecording={generateMinutesFromActiveRecording}
                    onDownloadMeetingFile={openUploadedFile}
                    onPreview={() => setIsPreviewOpen(true)}
                    canManageMeeting={canManageSelectedMeeting}
                  />
                ) : (
                  <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
                    Loading meeting details...
                  </p>
                )
              }
            />
            <Route
              path="/action-items"
              element={
                <ActionItemsView
                  actionItems={actionItems}
                  summaryActionItems={ownedMeetingActionItems}
                  meetings={meetings}
                  users={users}
                  selectedActionItemId={selectedActionItemIdFromQuery}
                  onSelectedActionItemHandled={() => navigate('/action-items', { replace: true })}
                  onMoveActionItem={moveActionItemStatus}
                  onOpenMeeting={openMeetingDetail}
                />
              }
            />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </div>

      <AppModals
        isCreateModalOpen={isCreateModalOpen}
        onCloseCreateModal={closeCreateMeetingModal}
        onCreatedMeeting={handleCreatedMeeting}
        token={token}
        users={users}
        tags={tags}
        meetings={meetings}
        meetingRequestId={activeMeetingRequestId}
        currentUserId={user.id}
        activeAvailabilityRequest={activeAvailabilityRequest}
        onCloseAvailabilityRequest={() => setActiveAvailabilityRequest(null)}
        onSubmittedAvailability={reloadDashboardData}
        selectedMeetingDetail={selectedMeetingDetail}
        isPreviewOpen={isPreviewOpen}
        onClosePreview={() => setIsPreviewOpen(false)}
      />

      <AppAlert message={errorMessage} onDismiss={() => setErrorMessage('')} />
    </main>
  )
}

function App() {
  const location = useLocation()
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

  if (location.pathname.startsWith(PUBLIC_INVITATION_PATH)) {
    const invitationToken = location.pathname.slice(PUBLIC_INVITATION_PATH.length)
    return <InvitationResponseView token={invitationToken} />
  }

  if (!authState) {
    return <LoginView onLogin={handleLogin} />
  }

  return <AppShell token={authState.token} user={authState.user} onLogout={handleLogout} />
}

export default App
