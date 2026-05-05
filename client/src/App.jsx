import { useCallback, useEffect, useState } from 'react'

import { SuccessModal } from './components/feedback/SuccessModal.jsx'
import { Sidebar } from './components/layout/Sidebar.jsx'
import { getApiClient } from './lib/apiClient.js'
import { ActionItemsView } from './features/action-items/ActionItemsView.jsx'
import { LoginView } from './features/auth/LoginView.jsx'
import { DashboardView } from './features/dashboard/DashboardView.jsx'
import { FileRepositoryView } from './features/files/FileRepositoryView.jsx'
import { ProjectFilesView } from './features/files/ProjectFilesView.jsx'
import { CreateMeetingModal } from './features/meetings/CreateMeetingModal.jsx'
import { MeetingDetailView } from './features/meetings/MeetingDetailView.jsx'
import { MeetingPreviewModal } from './features/meetings/MeetingPreviewModal.jsx'
import { RepositoryView } from './features/meetings/RepositoryView.jsx'
import { NotificationsView } from './features/notifications/NotificationsView.jsx'

const AppShell = ({ token, user, onLogout }) => {
  const [activePage, setActivePage] = useState('dashboard')
  const [dashboardData, setDashboardData] = useState(null)
  const [meetings, setMeetings] = useState([])
  const [actionItems, setActionItems] = useState([])
  const [notifications, setNotifications] = useState([])
  const [users, setUsers] = useState([])
  const [tags, setTags] = useState([])
  const [filesByMeeting, setFilesByMeeting] = useState({})
  const [fileRepoSearch, setFileRepoSearch] = useState('')
  const [fileRepoMeetingIds, setFileRepoMeetingIds] = useState([])
  const [activeProjectMeetingId, setActiveProjectMeetingId] = useState('')
  const [repositorySearch, setRepositorySearch] = useState('')
  const [meetingParticipantsByMeeting, setMeetingParticipantsByMeeting] = useState({})
  const [pendingMeetingMaterialFiles, setPendingMeetingMaterialFiles] = useState([])
  const [pendingMeetingAudioFiles, setPendingMeetingAudioFiles] = useState([])
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedMeetingDetail, setSelectedMeetingDetail] = useState(null)
  const [successModalMessage, setSuccessModalMessage] = useState('')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const newNotificationCount = notifications.filter(
    (item) => item.type === 'meeting_created' || item.type === 'task_assigned'
  ).length

  const loadParticipantsForMeetings = useCallback(
    async (meetingList) => {
      if (!meetingList?.length) {
        setMeetingParticipantsByMeeting({})
        return
      }

      const client = getApiClient(token)
      const results = await Promise.all(
        meetingList.map(async (meeting) => {
          try {
            const response = await client.get(`/api/meetings/${meeting.id}/participants`)
            const names = (response.data?.participants || []).map((participant) => participant.name).filter(Boolean)
            return [meeting.id, names]
          } catch {
            return [meeting.id, []]
          }
        })
      )

      setMeetingParticipantsByMeeting(Object.fromEntries(results))
    },
    [token]
  )

  const reloadData = useCallback(async () => {
    try {
      const client = getApiClient(token)

      const [dashboardRes, meetingsRes, actionItemsRes, notificationsRes, usersRes, tagsRes] = await Promise.all([
        client.get('/api/dashboard'),
        client.get('/api/meetings', { params: { limit: 100 } }),
        client.get('/api/action-items'),
        client.get('/api/notifications'),
        client.get('/api/users'),
        client.get('/api/tags'),
      ])

      setDashboardData(dashboardRes.data)
      const loadedMeetings = meetingsRes.data?.meetings || []
      setMeetings(loadedMeetings)
      await loadParticipantsForMeetings(loadedMeetings)
      setActionItems(actionItemsRes.data?.actionItems || [])
      setNotifications(notificationsRes.data?.notifications || [])
      const loadedUsers = usersRes.data?.users || []
      setUsers(loadedUsers)
      setTags(tagsRes.data?.tags || [])

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
  }, [token, user.id, onLogout, loadParticipantsForMeetings])

  useEffect(() => {
    let isCancelled = false

    const loadInitialData = async () => {
      try {
        const client = getApiClient(token)

        const [dashboardRes, meetingsRes, actionItemsRes, notificationsRes, usersRes, tagsRes] = await Promise.all([
          client.get('/api/dashboard'),
          client.get('/api/meetings', { params: { limit: 100 } }),
          client.get('/api/action-items'),
          client.get('/api/notifications'),
          client.get('/api/users'),
          client.get('/api/tags'),
        ])

        if (isCancelled) {
          return
        }

        setDashboardData(dashboardRes.data)
        const loadedMeetings = meetingsRes.data?.meetings || []
        setMeetings(loadedMeetings)
        await loadParticipantsForMeetings(loadedMeetings)
        setActionItems(actionItemsRes.data?.actionItems || [])
        setNotifications(notificationsRes.data?.notifications || [])
        const loadedUsers = usersRes.data?.users || []
        setUsers(loadedUsers)
        setTags(tagsRes.data?.tags || [])

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
  }, [token, user.id, onLogout, loadParticipantsForMeetings])

  const openMeetingDetail = async (meetingId) => {
    try {
      const client = getApiClient(token)
      const [meetingRes, participantsRes, actionItemsRes, filesRes] = await Promise.all([
        client.get(`/api/meetings/${meetingId}`),
        client.get(`/api/meetings/${meetingId}/participants`),
        client.get(`/api/meetings/${meetingId}/action-items`),
        client.get(`/api/meetings/${meetingId}/files`),
      ])

      setSelectedMeetingDetail({
        meeting: meetingRes.data.meeting,
        participants: participantsRes.data.participants || [],
        actionItems: actionItemsRes.data.actionItems || [],
        files: filesRes.data.files || [],
      })
      setPendingMeetingMaterialFiles([])
      setPendingMeetingAudioFiles([])
      setActivePage('repository-detail')
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to open meeting details')
    }
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

      await client.put(`/api/meetings/${selectedMeetingDetail.meeting.id}`, payload)
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

          return client.put(`/api/action-items/${item.id}`, updatePayload)
        })
      )
      if (pendingMeetingMaterialFiles.length > 0) {
        for (const file of pendingMeetingMaterialFiles) {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('description', 'Meeting material upload from detail view')
          await client.post(`/api/meetings/${selectedMeetingDetail.meeting.id}/files`, formData)
        }
      }

      if (pendingMeetingAudioFiles.length > 0) {
        for (const file of pendingMeetingAudioFiles) {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('description', 'Meeting audio upload from detail view')
          await client.post(`/api/meetings/${selectedMeetingDetail.meeting.id}/files`, formData)
        }
      }
      await reloadData()
      setPendingMeetingMaterialFiles([])
      setPendingMeetingAudioFiles([])
      setActivePage('dashboard')
      setSuccessModalMessage('Saved and finalized successfully')
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to save meeting details')
    }
  }

  const addActionItemInDetail = async () => {
    if (!selectedMeetingDetail) {
      return
    }

    try {
      const client = getApiClient(token)
      const res = await client.post(
        `/api/meetings/${selectedMeetingDetail.meeting.id}/action-items`,
        { title: 'New action item' }
      )
      setSelectedMeetingDetail((prev) =>
        prev
          ? {
              ...prev,
              actionItems: [res.data.actionItem, ...prev.actionItems],
            }
          : prev
      )
      await reloadData()
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to add action item')
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
                ? { ...item, dueDate: dueDateValue ? new Date(`${dueDateValue}T00:00:00Z`).toISOString() : null }
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
      await client.put(`/api/action-items/${actionItemId}`, {
        title: target.title.trim(),
        assigneeId: target.assigneeId || null,
        dueDate: target.dueDate || null,
      })
      await reloadData()
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to save action item')
    }
  }

  const removeActionItem = async (actionItemId) => {
    try {
      const client = getApiClient(token)
      await client.delete(`/api/action-items/${actionItemId}`)
      setSelectedMeetingDetail((prev) =>
        prev
          ? {
              ...prev,
              actionItems: prev.actionItems.filter((item) => item.id !== actionItemId),
            }
          : prev
      )
      await reloadData()
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to remove action item')
    }
  }

  const loadFilesForMeeting = useCallback(async (meetingId) => {
    try {
      const client = getApiClient(token)
      const response = await client.get(`/api/meetings/${meetingId}/files`)
      setFilesByMeeting((prev) => ({ ...prev, [meetingId]: response.data?.files || [] }))
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to load files')
    }
  }, [token])

  const loadAllFilesForMeetings = useCallback(async () => {
    const ids = meetings.map((meeting) => meeting.id)
    await Promise.all(ids.map((meetingId) => loadFilesForMeeting(meetingId)))
  }, [meetings, loadFilesForMeeting])

  const openUploadedFile = async (fileId) => {
    try {
      const client = getApiClient(token)
      const response = await client.get(`/api/files/${fileId}/content`, {
        responseType: 'blob',
      })

      const blobUrl = URL.createObjectURL(response.data)
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

  const uploadFromRepository = async (file) => {
    const files = Array.from(file || [])
    if (fileRepoMeetingIds.length === 0 || files.length === 0) {
      setErrorMessage('Select at least one meeting and file before uploading')
      return
    }

    try {
      const client = getApiClient(token)
      for (const meetingId of fileRepoMeetingIds) {
        for (const nextFile of files) {
          const formData = new FormData()
          formData.append('file', nextFile)
          formData.append('description', 'Uploaded from file repository')
          await client.post(`/api/meetings/${meetingId}/files`, formData)
        }
        await loadFilesForMeeting(meetingId)
      }
      await reloadData()
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to upload file')
    }
  }

  const toggleFileRepoMeetingSelection = (meetingId) => {
    setFileRepoMeetingIds((prev) =>
      prev.includes(meetingId) ? prev.filter((id) => id !== meetingId) : [...prev, meetingId]
    )
  }

  const openProjectFilesPage = (meetingId) => {
    setActiveProjectMeetingId(meetingId)
    setActivePage('project-files')
  }

  useEffect(() => {
    if (activePage === 'file-repository' && meetings.length > 0) {
      loadAllFilesForMeetings()
    }
  }, [activePage, meetings.length, loadAllFilesForMeetings])

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
      await client.put(`/api/action-items/${actionItemId}`, { status: nextStatus })
      await reloadData()
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to update action item status')
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 lg:flex">
      <Sidebar
        activePage={activePage}
        onSelect={setActivePage}
        onLogout={onLogout}
        currentUser={user}
        notificationCount={newNotificationCount}
      />

      <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
        {errorMessage ? (
          <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errorMessage}
          </p>
        ) : null}

        {activePage === 'dashboard' ? (
          <DashboardView
            data={dashboardData}
            onOpenCreateModal={() => setIsCreateModalOpen(true)}
            onOpenMeeting={openMeetingDetail}
          />
        ) : null}
        {activePage === 'repository' ? (
          <RepositoryView
            meetings={meetings}
            meetingParticipantsByMeeting={meetingParticipantsByMeeting}
            search={repositorySearch}
            onSearch={setRepositorySearch}
            onOpenMeeting={openMeetingDetail}
          />
        ) : null}
        {activePage === 'file-repository' ? (
          <FileRepositoryView
            meetings={meetings}
            filesByMeeting={filesByMeeting}
            currentUserId={user.id}
            meetingParticipantsByMeeting={meetingParticipantsByMeeting}
            search={fileRepoSearch}
            onSearch={setFileRepoSearch}
            selectedMeetingIds={fileRepoMeetingIds}
            onToggleMeetingSelection={toggleFileRepoMeetingSelection}
            onUploadFile={uploadFromRepository}
            onDownloadFile={openUploadedFile}
            onOpenProjectFilesPage={openProjectFilesPage}
          />
        ) : null}
        {activePage === 'project-files' ? (
          <ProjectFilesView
            meeting={meetings.find((meeting) => meeting.id === activeProjectMeetingId) || null}
            files={filesByMeeting[activeProjectMeetingId] || []}
            onBack={() => setActivePage('file-repository')}
            onDownloadFile={openUploadedFile}
          />
        ) : null}
        {activePage === 'repository-detail' ? (
          <MeetingDetailView
            detail={selectedMeetingDetail}
            onBack={() => setActivePage('repository')}
            onChange={updateMeetingDetailField}
            onSave={saveMeetingDetail}
            onAddActionItem={addActionItemInDetail}
            onActionItemChange={editActionItemTitle}
            onActionItemSave={saveActionItemTitle}
            onActionItemAssigneeChange={editActionItemAssignee}
            onActionItemDueDateChange={editActionItemDueDate}
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
        ) : null}
        {activePage === 'action-items' ? (
          <ActionItemsView actionItems={actionItems} onMoveActionItem={moveActionItemStatus} />
        ) : null}
        {activePage === 'notifications' ? (
          <NotificationsView notifications={notifications} />
        ) : null}
      </div>

      <CreateMeetingModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={reloadData}
        token={token}
        users={users}
        tags={tags}
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
