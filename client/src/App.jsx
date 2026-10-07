import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { AppModals } from './components/layout/AppModals.jsx'
import { AppAlert } from './components/layout/AppAlert.jsx'
import { Sidebar } from './components/layout/Sidebar.jsx'
import { Topbar } from './components/layout/Topbar.jsx'
import { getApiClient } from './lib/apiClient.js'
import { ActionItemsView } from './features/action-items/ActionItemsView.jsx'
import { ChangePasswordDialog } from './features/auth/ChangePasswordDialog.jsx'
import { LoginView } from './features/auth/LoginView.jsx'
import { DashboardView } from './features/dashboard/DashboardView.jsx'
import { MeetingDetailView } from './features/meetings/MeetingDetailView.jsx'
import { InvitationResponseView } from './features/meetings/InvitationResponseView.jsx'
import { RepositoryView } from './features/meetings/RepositoryView.jsx'
import { MyMeetingsView } from './features/meetings/MyMeetingsView.jsx'
import { AI_STATUS_POLL_INTERVAL_MS, shouldPollAiStatus } from './features/meetings/aiStatus.js'
import { AdminView } from './features/admin/AdminView.jsx'
import { useMeetingDetailController } from './features/meetings/useMeetingDetailController.js'
import { useNotificationActions } from './features/notifications/useNotificationActions.js'
import { listActionItems, updateActionItem } from './services/actionItemService.js'
import { changePassword } from './services/authService.js'
import { loadAppData } from './services/appDataService.js'
import { getDashboard } from './services/dashboardService.js'
import { listMeetings } from './services/meetingService.js'

const getActivePage = (pathname) => {
  if (pathname.startsWith('/admin')) {
    return 'admin'
  }
  if (pathname.startsWith('/my-meetings')) {
    return 'my-meetings'
  }

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
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false)
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
  const isAdmin = user.role === 'admin'
  const validActionItems = actionItems.filter(
    (item) => !item.meetingId || meetings.some((meeting) => meeting.id === item.meetingId)
  )
  const validOwnedMeetingActionItems = ownedMeetingActionItems.filter(
    (item) => !item.meetingId || meetings.some((meeting) => meeting.id === item.meetingId)
  )
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
      const params = activePage === 'repository' ? { limit: 100 } : { limit: 100, scope: 'mine' }
      setMeetings(await listMeetings(client, params))
    } catch (error) {
      if (error.response?.status === 401) {
        onLogout()
        return
      }
      setErrorMessage(error.response?.data?.error || 'Unable to load meetings')
    }
  }, [token, onLogout, activePage])

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
    if (
      !['dashboard', 'my-meetings', 'admin'].includes(activePage) ||
      (activePage === 'admin' && !isAdmin)
    ) {
      return
    }

    let isCancelled = false

    const load = async () => {
      try {
        const client = getApiClient(token)
        if (activePage === 'admin') {
          const loadedMeetings = await listMeetings(client, { limit: 100 })
          if (!isCancelled) setMeetings(loadedMeetings)
          return
        }
        const [dashboard, loadedMeetings, loadedActionItems, loadedOwnedActionItems] =
          await Promise.all([
            getDashboard(client),
            listMeetings(client, { limit: 100, scope: 'mine' }),
            listActionItems(client),
            listActionItems(client, 'owned'),
          ])

        if (!isCancelled) {
          setDashboardData(dashboard)
          setMeetings(loadedMeetings)
          setActionItems(loadedActionItems)
          setOwnedMeetingActionItems(loadedOwnedActionItems)
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
  }, [activePage, isAdmin, token, onLogout])

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

  const isAiStatusPolling = shouldPollAiStatus({
    isMeetingListShown: activePage === 'repository' && !activeMeetingId,
    meetings,
  })

  useEffect(() => {
    if (!isAiStatusPolling) {
      return
    }

    let isReloading = false
    const timer = setInterval(async () => {
      if (isReloading) {
        return
      }

      isReloading = true
      try {
        await reloadMeetingsData()
      } finally {
        isReloading = false
      }
    }, AI_STATUS_POLL_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [isAiStatusPolling, reloadMeetingsData])

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
          listMeetings(client, { limit: 100, scope: 'mine' }),
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

  const handleMeetingUpdated = useCallback((updatedMeeting) => {
    setMeetings((currentMeetings) =>
      currentMeetings.map((meeting) =>
        meeting.id === updatedMeeting.id ? { ...meeting, ...updatedMeeting } : meeting
      )
    )

    if (updatedMeeting.tag && updatedMeeting.tagId) {
      setTags((currentTags) =>
        currentTags.some((tag) => tag.id === updatedMeeting.tagId)
          ? currentTags
          : [...currentTags, { id: updatedMeeting.tagId, name: updatedMeeting.tag }].sort(
              (left, right) => left.name.localeCompare(right.name)
            )
      )
    }
  }, [])

  const meetingDetail = useMeetingDetailController({
    currentUserId: user.id,
    token,
    activeMeetingId,
    onError: setErrorMessage,
    onMeetingUpdated: handleMeetingUpdated,
  })
  const {
    selectedMeetingDetail,
    analysisReview,
    applyMinutesState,
    applyGeneratedMinutesToDraft,
    dismissApplyMinutesState,
    acceptSuggestion,
    rejectSuggestion,
    pendingMeetingMaterialFiles,
    pendingMeetingRecordingFile,
    recordingExtractProgress,
    isPreviewOpen,
    setIsPreviewOpen,
    updateMeetingDetailField,
    saveMeetingField,
    saveMeetingTag,
    updateMeetingStatus,
    addParticipant,
    removeParticipant,
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
    generateMinutesFromRecording,
    removeRecording,
  } = meetingDetail
  const canManageSelectedMeeting = Boolean(
    user.role === 'admin' || selectedMeetingDetail?.meeting?.ownerId === user.id
  )
  const canUpdateSelectedMeetingStatus =
    isAdmin || selectedMeetingDetail?.meeting?.ownerId === user.id

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
    <main
      className="min-h-screen w-full overflow-x-hidden"
      style={{
        background:
          'radial-gradient(ellipse 58% 58% at 50% 0%, #9fcaff 0%, #d9ecff 24%, #ffffff 62%), linear-gradient(180deg, #ffffff 0%, #edf7ff 100%)',
      }}
    >
      <div className={`flex min-h-screen w-full min-w-0 ${isPreviewOpen ? 'print:hidden' : ''}`}>
        <Sidebar
          activePage={activePage}
          isCollapsed={isSidebarCollapsed}
          isAdmin={isAdmin}
          onSelect={handleSidebarSelect}
          onToggle={() => setIsSidebarCollapsed((value) => !value)}
          onOpenCreateModal={openNewMeetingModal}
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
            onOpenAdmin={() => navigate('/admin')}
            onOpenChangePassword={() => setIsChangePasswordOpen(true)}
            onLogout={onLogout}
          />
          {isChangePasswordOpen ? (
            <ChangePasswordDialog
              onSubmit={(payload) => changePassword(getApiClient(token), payload)}
              onClose={() => setIsChangePasswordOpen(false)}
            />
          ) : null}

          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/dashboard"
              element={
                <DashboardView
                  data={dashboardData}
                  currentUser={user}
                  meetings={meetings}
                  allActionItems={validActionItems}
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
              path="/admin"
              element={
                isAdmin ? (
                  <AdminView
                    currentUser={user}
                    token={token}
                    users={users}
                    meetings={meetings}
                    actionItems={validActionItems}
                    notifications={notifications}
                    onOpenMeeting={openMeetingDetail}
                  />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
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
              path="/my-meetings"
              element={
                <MyMeetingsView
                  meetings={meetings.filter((meeting) => meeting.ownerId === user.id)}
                  currentUser={user}
                  token={token}
                  actionItems={validOwnedMeetingActionItems}
                  onOpenMeeting={openMeetingDetail}
                />
              }
            />
            <Route
              path="/meetings/:meetingId"
              element={
                selectedMeetingDetail?.meeting?.id === activeMeetingId ? (
                  <MeetingDetailView
                    key={activeMeetingId}
                    detail={selectedMeetingDetail}
                    onRequestMeetingChange={meetingDetail.requestMeetingChange}
                    changeRequestInbox={meetingDetail.changeRequestInbox}
                    openChangeRequestInbox={
                      new URLSearchParams(location.search).get('changeRequests') === '1'
                    }
                    onCloseChangeRequestInbox={() =>
                      navigate(`/meetings/${activeMeetingId}`, { replace: true })
                    }
                    onRefreshChangeRequests={meetingDetail.refreshChangeRequests}
                    onMarkChangeRequestRead={meetingDetail.markChangeRequestRead}
                    analysisReview={analysisReview}
                    applyMinutesState={applyMinutesState}
                    onApplyGeneratedMinutes={applyGeneratedMinutesToDraft}
                    onDismissApplyMinutesState={dismissApplyMinutesState}
                    onAcceptSuggestion={acceptSuggestion}
                    onRejectSuggestion={rejectSuggestion}
                    onBack={() => navigate('/meetings')}
                    onChange={updateMeetingDetailField}
                    onSaveMeetingField={saveMeetingField}
                    onSaveMeetingTag={saveMeetingTag}
                    onUpdateMeetingStatus={updateMeetingStatus}
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
                    recordingExtractProgress={recordingExtractProgress}
                    onAddPendingMaterialFiles={addPendingMeetingMaterialFiles}
                    onUploadRecording={uploadRecording}
                    onGenerateMinutesFromRecording={generateMinutesFromRecording}
                    onRemoveRecording={removeRecording}
                    onDownloadMeetingFile={openUploadedFile}
                    onPreview={() => setIsPreviewOpen(true)}
                    canManageMeeting={canManageSelectedMeeting}
                    canUpdateMeetingStatus={canUpdateSelectedMeetingStatus}
                    canEditMeetingTag={canUpdateSelectedMeetingStatus}
                    currentUserId={user.id}
                    users={users}
                    tags={tags}
                    onAddParticipant={addParticipant}
                    onRemoveParticipant={removeParticipant}
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
                  actionItems={validActionItems}
                  summaryActionItems={validActionItems}
                  meetings={meetings}
                  users={users}
                  currentUserId={user.id}
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
