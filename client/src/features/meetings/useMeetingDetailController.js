import { useCallback, useEffect, useState } from 'react'

import { getApiClient } from '../../lib/apiClient.js'
import {
  createMeetingActionItem,
  deleteActionItem,
  updateActionItem,
} from '../../services/actionItemService.js'
import { downloadFileContent, uploadMeetingFile } from '../../services/fileService.js'
import { getMeetingDetail, updateMeeting } from '../../services/meetingService.js'

export const useMeetingDetailController = ({ token, activeMeetingId, onError, onSaved }) => {
  const [selectedMeetingDetail, setSelectedMeetingDetail] = useState(null)
  const [pendingMeetingMaterialFiles, setPendingMeetingMaterialFiles] = useState([])
  const [pendingMeetingAudioFiles, setPendingMeetingAudioFiles] = useState([])
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  const fetchMeetingDetail = useCallback(
    async (meetingId) => {
      const client = getApiClient(token)
      return getMeetingDetail(client, meetingId)
    },
    [token]
  )

  useEffect(() => {
    if (!activeMeetingId) {
      return undefined
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

        onError(error.response?.data?.error || 'Unable to open meeting details')
      }
    }

    load()

    return () => {
      isCancelled = true
    }
  }, [activeMeetingId, fetchMeetingDetail, onError])

  const reloadSelectedMeetingDetail = useCallback(async () => {
    if (!selectedMeetingDetail?.meeting?.id) {
      return
    }

    const detail = await fetchMeetingDetail(selectedMeetingDetail.meeting.id)
    setSelectedMeetingDetail(detail)
  }, [fetchMeetingDetail, selectedMeetingDetail])

  const updateMeetingDetailField = useCallback((field, value) => {
    setSelectedMeetingDetail((prev) => {
      if (!prev) {
        return prev
      }

      if (field === 'date' || field === 'time') {
        const start = new Date(prev.meeting.startsAt)
        const end = new Date(prev.meeting.endsAt)
        const durationMs =
          !Number.isNaN(end.getTime()) && end > start
            ? end.getTime() - start.getTime()
            : 60 * 60 * 1000

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
            endsAt: new Date(start.getTime() + durationMs).toISOString(),
          },
        }
      }

      return { ...prev, meeting: { ...prev.meeting, [field]: value } }
    })
  }, [])

  const saveMeetingDetail = useCallback(async () => {
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

      for (const file of pendingMeetingMaterialFiles) {
        await uploadMeetingFile(
          client,
          selectedMeetingDetail.meeting.id,
          file,
          'Meeting material upload from detail view'
        )
      }

      for (const file of pendingMeetingAudioFiles) {
        await uploadMeetingFile(
          client,
          selectedMeetingDetail.meeting.id,
          file,
          'Meeting audio upload from detail view'
        )
      }

      setPendingMeetingMaterialFiles([])
      setPendingMeetingAudioFiles([])
      onSaved?.()
    } catch (error) {
      onError(error.response?.data?.error || 'Unable to save meeting details')
    }
  }, [
    onError,
    onSaved,
    pendingMeetingAudioFiles,
    pendingMeetingMaterialFiles,
    selectedMeetingDetail,
    token,
  ])

  const addActionItemInDetail = useCallback(
    async (input = {}) => {
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
        await reloadSelectedMeetingDetail()
      } catch (error) {
        onError(error.response?.data?.error || 'Unable to add action item')
      }
    },
    [onError, reloadSelectedMeetingDetail, selectedMeetingDetail, token]
  )

  const updateActionItemStatusInDetail = useCallback(
    async (actionItemId, nextStatus) => {
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
        await reloadSelectedMeetingDetail()
      } catch (error) {
        onError(error.response?.data?.error || 'Unable to update action item status')
      }
    },
    [onError, reloadSelectedMeetingDetail, token]
  )

  const editActionItemTitle = useCallback((actionItemId, title) => {
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
  }, [])

  const updateActionItemFieldsInDetail = useCallback(
    async (actionItemId, updates) => {
      setSelectedMeetingDetail((prev) =>
        prev
          ? {
              ...prev,
              actionItems: prev.actionItems.map((item) =>
                item.id === actionItemId ? { ...item, ...updates } : item
              ),
            }
          : prev
      )

      try {
        const client = getApiClient(token)
        await updateActionItem(client, actionItemId, updates)
        await reloadSelectedMeetingDetail()
      } catch (error) {
        onError(error.response?.data?.error || 'Unable to save action item')
        await reloadSelectedMeetingDetail()
      }
    },
    [onError, reloadSelectedMeetingDetail, token]
  )

  const saveActionItemTitle = useCallback(
    async (actionItemId) => {
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
          priority: target.priority || 'medium',
        })
        await reloadSelectedMeetingDetail()
      } catch (error) {
        onError(error.response?.data?.error || 'Unable to save action item')
      }
    },
    [onError, reloadSelectedMeetingDetail, selectedMeetingDetail, token]
  )

  const removeActionItem = useCallback(
    async (actionItemId) => {
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
        await reloadSelectedMeetingDetail()
      } catch (error) {
        onError(error.response?.data?.error || 'Unable to remove action item')
      }
    },
    [onError, reloadSelectedMeetingDetail, token]
  )

  const openUploadedFile = useCallback(
    async (fileId) => {
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
        onError(error.response?.data?.error || 'Unable to download file')
      }
    },
    [onError, token]
  )

  const addPendingMeetingMaterialFiles = useCallback((incomingFiles) => {
    const nextFiles = Array.from(incomingFiles || [])
    if (nextFiles.length === 0) {
      return
    }

    setPendingMeetingMaterialFiles((prev) => [...prev, ...nextFiles])
  }, [])

  const removePendingMeetingMaterialFile = useCallback((indexToRemove) => {
    setPendingMeetingMaterialFiles((prev) => prev.filter((_, index) => index !== indexToRemove))
  }, [])

  const addPendingMeetingAudioFiles = useCallback((incomingFiles) => {
    const nextFiles = Array.from(incomingFiles || [])
    if (nextFiles.length === 0) {
      return
    }

    setPendingMeetingAudioFiles((prev) => [...prev, ...nextFiles])
  }, [])

  const removePendingMeetingAudioFile = useCallback((indexToRemove) => {
    setPendingMeetingAudioFiles((prev) => prev.filter((_, index) => index !== indexToRemove))
  }, [])

  return {
    selectedMeetingDetail,
    pendingMeetingMaterialFiles,
    pendingMeetingAudioFiles,
    isPreviewOpen,
    setIsPreviewOpen,
    updateMeetingDetailField,
    saveMeetingDetail,
    addActionItemInDetail,
    updateActionItemStatusInDetail,
    editActionItemTitle,
    updateActionItemFieldsInDetail,
    saveActionItemTitle,
    removeActionItem,
    openUploadedFile,
    addPendingMeetingMaterialFiles,
    removePendingMeetingMaterialFile,
    addPendingMeetingAudioFiles,
    removePendingMeetingAudioFile,
  }
}
