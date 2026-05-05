import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { SuccessModal } from './components/feedback/SuccessModal.jsx'
import { Sidebar } from './components/layout/Sidebar.jsx'
import { Topbar } from './components/layout/Topbar.jsx'
import { getApiClient } from './lib/apiClient.js'
import { ActionItemsView } from './features/action-items/ActionItemsView.jsx'
import { LoginView } from './features/auth/LoginView.jsx'
import { DashboardView } from './features/dashboard/DashboardView.jsx'
import { CreateMeetingModal } from './features/meetings/CreateMeetingModal.jsx'
import { MeetingDetailView } from './features/meetings/MeetingDetailView.jsx'
import { MeetingPreviewModal } from './features/meetings/MeetingPreviewModal.jsx'
import { RepositoryView } from './features/meetings/RepositoryView.jsx'
import {
  createMeetingActionItem,
  deleteActionItem,
  updateActionItem,
} from './services/actionItemService.js'
import { loadAppData } from './services/appDataService.js'
import { downloadFileContent, uploadMeetingFile } from './services/fileService.js'
import { getMeetingDetail, updateMeeting } from './services/meetingService.js'

const getActivePage = (pathname) => {
  if (pathname.startsWith('/meetings')) {
    return 'repository'
  }

  if (pathname.startsWith('/action-items')) {
    return 'action-items'
  }

  return 'dashboard'
}

const AppShell = ({ token, user, onLogout }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const [dashboardData, setDashboardData] = useState(null)
  const [meetings, setMeetings] = useState([])
  const [actionItems, setActionItems] = useState([])
  const [notifications, setNotifications] = useState([])
  const [users, setUsers] = useState([])
  const [tags, setTags] = useState([])
  const [repositorySearch, setRepositorySearch] = useState('')
  const [pendingMeetingMaterialFiles, setPendingMeetingMaterialFiles] = useState([])
  const [pendingMeetingAudioFiles, setPendingMeetingAudioFiles] = useState([])
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [activeMeetingRequestId, setActiveMeetingRequestId] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedMeetingDetail, setSelectedMeetingDetail] = useState(null)
  const [successModalMessage, setSuccessModalMessage] = useState('')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const newNotificationCount = notifications.filter(
    (item) => item.type === 'meeting_created' || item.type === 'task_assigned'
  ).length
  const activePage = getActivePage(location.pathname)
  const activeMeetingId = location.pathname.match(/^\/meetings\/([^/]+)$/)?.[1] ?? null

  const reloadData = useCallback(async () => {
    try {
      const client = getApiClient(token)
      const appData = await loadAppData(client)
      const loadedMeetings = appData.meetings
      const loadedUsers = appData.users

      setDashboardData(appData.dashboard)
      setMeetings(loadedMeetings)
      setActionItems(appData.actionItems)
      setNotifications(appData.notifications)
      setUsers(loadedUsers)
      setTags(appData.tags)

      const currentUserExists = loadedUsers.some((item) => item.id === user.id)
      if (!currentUserExists) {
        onLogout()
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
        const appData = await loadAppData(client)

        if (isCancelled) {
          return
        }

        const loadedMeetings = appData.meetings
        const loadedUsers = appData.users

        setDashboardData(appData.dashboard)
        setMeetings(loadedMeetings)
        setActionItems(appData.actionItems)
        setNotifications(appData.notifications)
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
        setErrorMessage(error.response?.data?.error || 'Unable to load dashboard data')
      }
    }

    loadInitialData()

    return () => {
      isCancelled = true
    }
  }, [token, user.id, onLogout])

  const fetchMeetingDetail = useCallback(
    async (meetingId) => {
      const client = getApiClient(token)
      return getMeetingDetail(client, meetingId)
    },
    [token]
  )

  useEffect(() => {
    if (!activeMeetingId) {
      return
    }

    let isCancelled = false

    const load = async () => {
      try {
        const detail = await fetchMeetingDetail(activeMeetingId)
        if (isCancelled) {
          return
        }

        setSelectedMeetingDetail(detail)
        setPendingMeetingMaterialFiles([])
        setPendingMeetingAudioFiles([])
      } catch (error) {
        if (isCancelled) {
          return
        }

        setErrorMessage(error.response?.data?.error || 'Unable to open meeting details')
      }
    }

    load()

    return () => {
      isCancelled = true
    }
  }, [activeMeetingId, fetchMeetingDetail])

  const openMeetingDetail = (meetingId) => {
    navigate(`/meetings/${meetingId}`)
  }

  const openNewMeetingModal = () => {
    setActiveMeetingRequestId(null)
    setIsCreateModalOpen(true)
  }

  const openMeetingRequestModal = (meetingRequestId) => {
    setActiveMeetingRequestId(meetingRequestId)
    setIsCreateModalOpen(true)
  }

  const reloadSelectedMeetingDetail = async () => {
    if (!selectedMeetingDetail?.meeting?.id) {
      return
    }

    const detail = await fetchMeetingDetail(selectedMeetingDetail.meeting.id)
    setSelectedMeetingDetail(detail)
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
        tag: selectedMeetingDetail.meeting.tag,
      }

      await updateMeeting(client, selectedMeetingDetail.meeting.id, payload)
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

          return updateActionItem(client, item.id, updatePayload)
        })
      )
      if (pendingMeetingMaterialFiles.length > 0) {
        for (const file of pendingMeetingMaterialFiles) {
          await uploadMeetingFile(
            client,
            selectedMeetingDetail.meeting.id,
            file,
            'Meeting material upload from detail view'
          )
        }
      }

      if (pendingMeetingAudioFiles.length > 0) {
        for (const file of pendingMeetingAudioFiles) {
          await uploadMeetingFile(
            client,
            selectedMeetingDetail.meeting.id,
            file,
            'Meeting audio upload from detail view'
          )
        }
      }
      await reloadData()
      setPendingMeetingMaterialFiles([])
      setPendingMeetingAudioFiles([])
      navigate('/dashboard')
      setSuccessModalMessage('Saved and finalized successfully')
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to save meeting details')
    }
  }

  const addActionItemInDetail = async (input = {}) => {
    if (!selectedMeetingDetail) {
      return
    }

    try {
      const client = getApiClient(token)
      const actionItem = await createMeetingActionItem(client, selectedMeetingDetail.meeting.id, {
        title: input.title?.trim() || 'New action item',
        assigneeId: input.assigneeId || undefined,
        dueDate: input.dueDate || undefined,
        priority: input.priority || undefined,
      })
      setSelectedMeetingDetail((prev) =>
        prev
          ? {
              ...prev,
              actionItems: [actionItem, ...prev.actionItems],
            }
          : prev
      )
      await reloadData()
      await reloadSelectedMeetingDetail()
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to add action item')
    }
  }

  const updateActionItemStatusInDetail = async (actionItemId, nextStatus) => {
    try {
      const client = getApiClient(token)
      await updateActionItem(client, actionItemId, { status: nextStatus })
      setSelectedMeetingDetail((prev) =>
        prev
          ? {
              ...prev,
              actionItems: prev.actionItems.map((item) =>
                item.id === actionItemId ? { ...item, status: nextStatus } : item
              ),
            }
          : prev
      )
      await reloadData()
      await reloadSelectedMeetingDetail()
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to update action item status')
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
                ? {
                    ...item,
                    dueDate: dueDateValue
                      ? new Date(`${dueDateValue}T00:00:00Z`).toISOString()
                      : null,
                  }
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
      await updateActionItem(client, actionItemId, {
        title: target.title.trim(),
        assigneeId: target.assigneeId || null,
        dueDate: target.dueDate || null,
      })
      await reloadData()
      await reloadSelectedMeetingDetail()
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to save action item')
    }
  }

  const removeActionItem = async (actionItemId) => {
    try {
      const client = getApiClient(token)
      await deleteActionItem(client, actionItemId)
      setSelectedMeetingDetail((prev) =>
        prev
          ? {
              ...prev,
              actionItems: prev.actionItems.filter((item) => item.id !== actionItemId),
            }
          : prev
      )
      await reloadData()
      await reloadSelectedMeetingDetail()
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to remove action item')
    }
  }

  const openUploadedFile = async (fileId) => {
    try {
      const client = getApiClient(token)
      const blob = await downloadFileContent(client, fileId)

      const blobUrl = URL.createObjectURL(blob)
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

  const addPendingMeetingMaterialFiles = (incomingFiles) => {
    const nextFiles = Array.from(incomingFiles || [])
    if (nextFiles.length === 0) {
      return
    }

    setPendingMeetingMaterialFiles((prev) => [...prev, ...nextFiles])
  }

  const removePendingMeetingMaterialFile = (indexToRemove) => {
    setPendingMeetingMaterialFiles((prev) => prev.filter((_, index) => index !== indexToRemove))
  }

  const addPendingMeetingAudioFiles = (incomingFiles) => {
    const nextFiles = Array.from(incomingFiles || [])
    if (nextFiles.length === 0) {
      return
    }

    setPendingMeetingAudioFiles((prev) => [...prev, ...nextFiles])
  }

  const removePendingMeetingAudioFile = (indexToRemove) => {
    setPendingMeetingAudioFiles((prev) => prev.filter((_, index) => index !== indexToRemove))
  }

  const moveActionItemStatus = async (actionItemId, nextStatus) => {
    try {
      const client = getApiClient(token)
      await updateActionItem(client, actionItemId, { status: nextStatus })
      await reloadData()
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to update action item status')
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 lg:flex">
      <Sidebar activePage={activePage} onSelect={(item) => navigate(item.path)} />

      <div className="flex-1 px-4 py-4 sm:px-6 lg:px-8">
        <Topbar
          currentUser={user}
          notifications={notifications}
          notificationCount={newNotificationCount}
          onLogout={onLogout}
        />

        {errorMessage ? (
          <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errorMessage}
          </p>
        ) : null}

        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <DashboardView
                data={dashboardData}
                onOpenCreateModal={openNewMeetingModal}
                onOpenMeeting={openMeetingDetail}
                onOpenMeetingRequest={openMeetingRequestModal}
              />
            }
          />
          <Route
            path="/meetings"
            element={
              <RepositoryView
                meetings={meetings}
                meetingParticipantsByMeeting={{}}
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
                  onSave={saveMeetingDetail}
                  onAddActionItem={addActionItemInDetail}
                  onActionItemChange={editActionItemTitle}
                  onActionItemSave={saveActionItemTitle}
                  onActionItemAssigneeChange={editActionItemAssignee}
                  onActionItemDueDateChange={editActionItemDueDate}
                  onActionItemStatusChange={updateActionItemStatusInDetail}
                  onActionItemRemove={removeActionItem}
                  pendingMaterialFiles={pendingMeetingMaterialFiles}
                  pendingAudioFiles={pendingMeetingAudioFiles}
                  onAddPendingMaterialFiles={addPendingMeetingMaterialFiles}
                  onRemovePendingMaterialFile={removePendingMeetingMaterialFile}
                  onAddPendingAudioFiles={addPendingMeetingAudioFiles}
                  onRemovePendingAudioFile={removePendingMeetingAudioFile}
                  onDownloadMeetingFile={openUploadedFile}
                  onPreview={() => setIsPreviewOpen(true)}
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
                meetings={meetings}
                users={users}
                onMoveActionItem={moveActionItemStatus}
              />
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>

      <CreateMeetingModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false)
          setActiveMeetingRequestId(null)
        }}
        onCreated={async () => {
          await reloadData()
          setActiveMeetingRequestId(null)
        }}
        token={token}
        users={users}
        tags={tags}
        meetings={meetings}
        meetingRequestId={activeMeetingRequestId}
        currentUserId={user.id}
      />

      <SuccessModal message={successModalMessage} onClose={() => setSuccessModalMessage('')} />
      <MeetingPreviewModal
        detail={selectedMeetingDetail}
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
      />
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
