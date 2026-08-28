import { useCallback, useEffect, useState } from 'react'

import { getApiClient } from '../../lib/apiClient.js'
import {
  createMeetingActionItem,
  deleteActionItem,
  updateActionItem,
} from '../../services/actionItemService.js'
import { downloadFileContent, uploadMeetingFile } from '../../services/fileService.js'
import { getMeetingDetail, updateMeeting } from '../../services/meetingService.js'
import { updateMeetingMinutes } from '../../services/minuteService.js'
import {
  generateMinutesFromRecording,
  removeMeetingRecording,
  uploadMeetingRecording,
} from '../../services/recordingService.js'

export const useMeetingDetailController = ({ token, activeMeetingId, onError }) => {
  const [selectedMeetingDetail, setSelectedMeetingDetail] = useState(null)
  const [pendingMeetingMaterialFiles, setPendingMeetingMaterialFiles] = useState([])
  const [pendingMeetingRecordingFile, setPendingMeetingRecordingFile] = useState(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const selectedMeetingId = selectedMeetingDetail?.meeting?.id

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
        setPendingMeetingRecordingFile(null)
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

  const patchMeetingFields = useCallback(
    async (updates) => {
      if (!selectedMeetingDetail) {
        return
      }

      try {
        const client = getApiClient(token)
        const meeting = await updateMeeting(client, selectedMeetingDetail.meeting.id, updates)
        setSelectedMeetingDetail((prev) => (prev ? { ...prev, meeting } : prev))
      } catch (error) {
        onError(error.response?.data?.error || 'Unable to save meeting details')
      }
    },
    [onError, selectedMeetingDetail, token]
  )

  const saveMeetingField = useCallback(
    async (field) => {
      if (!selectedMeetingDetail) {
        return
      }

      const value = selectedMeetingDetail.meeting[field]
      const normalizedValue = typeof value === 'string' ? value.trim() : value

      if (field === 'title' && !normalizedValue) {
        onError('Meeting title cannot be empty')
        return
      }

      await patchMeetingFields({ [field]: normalizedValue ?? null })
    },
    [onError, patchMeetingFields, selectedMeetingDetail]
  )

  const updateMeetingMinutesField = useCallback((field, value) => {
    setSelectedMeetingDetail((prev) =>
      prev
        ? {
            ...prev,
            minutes: {
              ...(prev.minutes ?? {}),
              [field]: value,
            },
          }
        : prev
    )
  }, [])

  const saveMeetingMinutesFields = useCallback(
    async (updates) => {
      if (!selectedMeetingDetail) {
        return
      }

      try {
        const client = getApiClient(token)
        const minutes = await updateMeetingMinutes(
          client,
          selectedMeetingDetail.meeting.id,
          updates
        )
        setSelectedMeetingDetail((prev) => (prev ? { ...prev, minutes } : prev))
      } catch (error) {
        onError(error.response?.data?.error || 'Unable to save meeting minutes')
      }
    },
    [onError, selectedMeetingDetail, token]
  )

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
      } catch (error) {
        onError(error.response?.data?.error || 'Unable to add action item')
      }
    },
    [onError, selectedMeetingDetail, token]
  )

  const updateActionItemStatusInDetail = useCallback(
    async (actionItemId, nextStatus) => {
      try {
        const client = getApiClient(token)
        const actionItem = await updateActionItem(client, actionItemId, { status: nextStatus })
        setSelectedMeetingDetail((prev) =>
          prev
            ? {
                ...prev,
                actionItems: prev.actionItems.map((item) =>
                  item.id === actionItemId ? actionItem : item
                ),
              }
            : prev
        )
      } catch (error) {
        onError(error.response?.data?.error || 'Unable to update action item status')
      }
    },
    [onError, token]
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
      let previousActionItems = []
      setSelectedMeetingDetail((prev) =>
        prev
          ? (() => {
              previousActionItems = prev.actionItems
              return {
                ...prev,
                actionItems: prev.actionItems.map((item) =>
                  item.id === actionItemId ? { ...item, ...updates } : item
                ),
              }
            })()
          : prev
      )

      try {
        const client = getApiClient(token)
        const actionItem = await updateActionItem(client, actionItemId, updates)
        setSelectedMeetingDetail((prev) =>
          prev
            ? {
                ...prev,
                actionItems: prev.actionItems.map((item) =>
                  item.id === actionItemId ? actionItem : item
                ),
              }
            : prev
        )
      } catch (error) {
        onError(error.response?.data?.error || 'Unable to save action item')
        setSelectedMeetingDetail((prev) =>
          prev
            ? {
                ...prev,
                actionItems: previousActionItems,
              }
            : prev
        )
      }
    },
    [onError, token]
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
        const actionItem = await updateActionItem(client, actionItemId, {
          title: target.title.trim(),
          assigneeId: target.assigneeId || null,
          dueDate: target.dueDate || null,
          priority: target.priority || 'medium',
        })
        setSelectedMeetingDetail((prev) =>
          prev
            ? {
                ...prev,
                actionItems: prev.actionItems.map((item) =>
                  item.id === actionItemId ? actionItem : item
                ),
              }
            : prev
        )
      } catch (error) {
        onError(error.response?.data?.error || 'Unable to save action item')
      }
    },
    [onError, selectedMeetingDetail, token]
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
      } catch (error) {
        onError(error.response?.data?.error || 'Unable to remove action item')
      }
    },
    [onError, token]
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

  const uploadFilesImmediately = useCallback(
    async ({ incomingFiles, storageKind, description, setUploadingFiles }) => {
      const nextFiles = Array.from(incomingFiles || [])
      if (nextFiles.length === 0 || !selectedMeetingId) {
        return
      }

      setUploadingFiles((prev) => [...prev, ...nextFiles])

      try {
        const client = getApiClient(token)
        for (const file of nextFiles) {
          const uploadedFile = await uploadMeetingFile(
            client,
            selectedMeetingId,
            file,
            description,
            storageKind
          )
          setSelectedMeetingDetail((prev) =>
            prev
              ? {
                  ...prev,
                  files: [uploadedFile, ...prev.files],
                }
              : prev
          )
        }
      } catch (error) {
        onError(error.response?.data?.error || 'Unable to upload file')
      } finally {
        setUploadingFiles((prev) => prev.filter((file) => !nextFiles.includes(file)))
      }
    },
    [onError, selectedMeetingId, token]
  )

  const addPendingMeetingMaterialFiles = useCallback(
    (incomingFiles) =>
      uploadFilesImmediately({
        incomingFiles,
        storageKind: 'file',
        description: 'Meeting material upload from detail view',
        setUploadingFiles: setPendingMeetingMaterialFiles,
      }),
    [uploadFilesImmediately]
  )

  const uploadRecording = useCallback(
    async (incomingFiles, { replace = false } = {}) => {
      const [file] = Array.from(incomingFiles || [])
      if (!file || !selectedMeetingId) {
        return
      }

      setPendingMeetingRecordingFile(file)

      try {
        const client = getApiClient(token)
        const result = await uploadMeetingRecording(client, selectedMeetingId, file, { replace })
        setSelectedMeetingDetail((prev) =>
          prev
            ? {
                ...prev,
                recording: result.recording,
                transcript: result.transcript,
              }
            : prev
        )
      } catch (error) {
        onError(error.response?.data?.error || 'Unable to upload meeting recording')
      } finally {
        setPendingMeetingRecordingFile(null)
      }
    },
    [onError, selectedMeetingId, token]
  )

  const removeRecording = useCallback(async () => {
    if (!selectedMeetingId) {
      return
    }

    try {
      const client = getApiClient(token)
      await removeMeetingRecording(client, selectedMeetingId)
      setSelectedMeetingDetail((prev) =>
        prev
          ? {
              ...prev,
              recording: null,
              transcript: null,
            }
          : prev
      )
    } catch (error) {
      onError(error.response?.data?.error || 'Unable to remove meeting recording')
    }
  }, [onError, selectedMeetingId, token])

  const generateMinutesFromActiveRecording = useCallback(async () => {
    if (!selectedMeetingId) {
      return
    }

    try {
      const client = getApiClient(token)
      const result = await generateMinutesFromRecording(client, selectedMeetingId)
      setSelectedMeetingDetail((prev) =>
        prev
          ? {
              ...prev,
              recording: result.recording,
              transcript: result.transcript,
            }
          : prev
      )
      if (result.generationStatus === 'not_configured') {
        onError('Speech-to-text provider is not configured yet')
      }
    } catch (error) {
      onError(error.response?.data?.error || 'Unable to generate minutes')
    }
  }, [onError, selectedMeetingId, token])

  return {
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
  }
}
