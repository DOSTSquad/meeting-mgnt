import { useCallback, useEffect, useState } from 'react'

import { getApiClient } from '../../lib/apiClient.js'
import { needsExtraction } from '../../lib/recordingFile.js'
import { subscribeToWorkflowEvents } from '../../lib/workflowEventStream.js'
import {
  createMeetingActionItem,
  deleteActionItem,
  updateActionItem,
} from '../../services/actionItemService.js'
import { downloadFileContent, uploadMeetingFile } from '../../services/fileService.js'
import { getMeetingDetail, updateMeeting } from '../../services/meetingService.js'
import {
  submitMeetingChangeRequest,
  getMeetingChangeRequests,
  markMeetingChangeRequestRead,
} from '../../services/meetingChangeRequestService.js'
import { applyGeneratedMinutes, updateMeetingMinutes } from '../../services/minuteService.js'
import {
  acceptAnalysisSuggestion,
  editAnalysisSuggestion,
  getMeetingAnalysis,
  getMeetingRecording,
  generateMeetingRecording,
  rejectAnalysisSuggestion,
  removeMeetingRecording,
  uploadMeetingRecording,
} from '../../services/recordingService.js'

export const useMeetingDetailController = ({ token, activeMeetingId, currentUserId, onError }) => {
  const [loadedChangeRequests, setLoadedChangeRequests] = useState(null)
  const [inboxRevision, setInboxRevision] = useState(0)
  const [selectedMeetingDetail, setSelectedMeetingDetail] = useState(null)
  const [pendingMeetingMaterialFiles, setPendingMeetingMaterialFiles] = useState([])
  const [pendingMeetingRecordingFile, setPendingMeetingRecordingFile] = useState(null)
  const [recordingExtractProgress, setRecordingExtractProgress] = useState(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  // Stored with the meeting it belongs to, so switching meetings derives an
  // empty preview instead of needing an effect to clear it.
  const [loadedAnalysisReview, setLoadedAnalysisReview] = useState(null)
  const [applyMinutesState, setApplyMinutesState] = useState({ status: 'idle' })
  const selectedMeetingId = selectedMeetingDetail?.meeting?.id

  const requestMeetingChange = useCallback(
    (message) => submitMeetingChangeRequest(getApiClient(token), selectedMeetingId, message),
    [token, selectedMeetingId]
  )
  const loadMeetingChangeRequests = useCallback(
    () => getMeetingChangeRequests(getApiClient(token), selectedMeetingId),
    [token, selectedMeetingId]
  )
  const markChangeRequestRead = async (requestId) => {
    const updated = await markMeetingChangeRequestRead(
      getApiClient(token),
      selectedMeetingId,
      requestId
    )
    setLoadedChangeRequests((previous) =>
      previous?.meetingId === selectedMeetingId
        ? {
            ...previous,
            items: previous.items.map((item) =>
              item.id === requestId ? { ...item, readAt: updated.readAt } : item
            ),
          }
        : previous
    )
    setInboxRevision((revision) => revision + 1)
    window.dispatchEvent(new Event('meeting-change-request-read'))
  }
  const isMeetingOwner = selectedMeetingDetail?.meeting?.ownerId === currentUserId
  useEffect(() => {
    if (!selectedMeetingId || !isMeetingOwner) return
    let cancelled = false
    loadMeetingChangeRequests()
      .then((items) => {
        if (!cancelled)
          setLoadedChangeRequests({
            meetingId: selectedMeetingId,
            items,
            status: 'ready',
            error: '',
          })
      })
      .catch((error) => {
        if (!cancelled)
          setLoadedChangeRequests({
            meetingId: selectedMeetingId,
            items: [],
            status: 'error',
            error: error.response?.data?.error || 'Unable to load change requests.',
          })
      })
    return () => {
      cancelled = true
    }
  }, [selectedMeetingId, isMeetingOwner, loadMeetingChangeRequests, inboxRevision])

  const refreshChangeRequests = () => {
    setLoadedChangeRequests((previous) =>
      previous ? { ...previous, status: 'loading', error: '' } : null
    )
    setInboxRevision((revision) => revision + 1)
  }
  const changeRequestInbox =
    isMeetingOwner && loadedChangeRequests?.meetingId === selectedMeetingId
      ? loadedChangeRequests
      : { items: [], status: 'loading', error: '' }

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
        setRecordingExtractProgress(null)
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
        let recordingFile = file

        if (needsExtraction(file)) {
          const { extractAudioInWorker } = await import('../../lib/extractAudioInWorker.js')
          setRecordingExtractProgress(0)
          recordingFile = await extractAudioInWorker(file, {
            onProgress: setRecordingExtractProgress,
          })
          setRecordingExtractProgress(null)
        }

        const result = await uploadMeetingRecording(client, selectedMeetingId, recordingFile, {
          replace,
        })
        setSelectedMeetingDetail((prev) =>
          prev
            ? {
                ...prev,
                recording: result.recording,
                transcript: result.transcript,
                analysisRun: result.analysisRun,
              }
            : prev
        )
      } catch (error) {
        onError(
          error.response?.data?.error ||
            (error.name === 'AudioExtractionError'
              ? error.message
              : 'Unable to upload meeting recording')
        )
      } finally {
        setPendingMeetingRecordingFile(null)
        setRecordingExtractProgress(null)
      }
    },
    [onError, selectedMeetingId, token]
  )

  const generateMinutesFromRecording = useCallback(async () => {
    if (!selectedMeetingId) return

    try {
      const result = await generateMeetingRecording(getApiClient(token), selectedMeetingId)
      setSelectedMeetingDetail((prev) =>
        prev
          ? {
              ...prev,
              recording: result.recording,
              transcript: result.transcript,
              analysisRun: result.analysisRun,
            }
          : prev
      )
    } catch (error) {
      onError(error.response?.data?.error || 'Unable to generate meeting text')
    }
  }, [onError, selectedMeetingId, token])

  const transcriptStatus = selectedMeetingDetail?.transcript?.status
  const analysisStatus = selectedMeetingDetail?.analysisRun?.status
  // One string so the effect re-subscribes on any phase change without depending
  // on the whole detail object.
  const workflowPhase = `${transcriptStatus ?? ''}:${analysisStatus ?? ''}`
  // The workflow now runs past a completed transcript into analysis, so the
  // stream stays open until the analysis run reaches a terminal status too.
  const isWorkflowInFlight =
    transcriptStatus === 'processing' || ['queued', 'processing'].includes(analysisStatus)

  // Load the review once the stream reports it is ready. The stream carries
  // status metadata only, never generated content.
  useEffect(() => {
    if (!token || !selectedMeetingId || analysisStatus !== 'ready_for_review') {
      return
    }

    let cancelled = false

    getMeetingAnalysis(getApiClient(token), selectedMeetingId)
      .then((review) => {
        if (!cancelled) {
          setLoadedAnalysisReview({ meetingId: selectedMeetingId, review })
        }
      })
      .catch(() => {
        // The status is already visible. A failed fetch only costs the preview,
        // which the next page load recovers.
      })

    return () => {
      cancelled = true
    }
  }, [analysisStatus, selectedMeetingId, token])

  // The same applies to the transcript. Upload creates an empty row, so the
  // client has no body to merge the stream's status onto: without this the
  // panel stays hidden until a reload, and the analysis preview appears first
  // even though transcription finished before it.
  useEffect(() => {
    if (!token || !selectedMeetingId || transcriptStatus !== 'completed') {
      return
    }

    let cancelled = false

    getMeetingRecording(getApiClient(token), selectedMeetingId)
      .then((result) => {
        if (cancelled || !result?.transcript) {
          return
        }

        setSelectedMeetingDetail((prev) =>
          prev && prev.meeting?.id === selectedMeetingId
            ? { ...prev, transcript: { ...prev.transcript, ...result.transcript } }
            : prev
        )
      })
      .catch(() => {
        // The status is already visible; a failed fetch only costs the body,
        // which the next page load recovers.
      })

    return () => {
      cancelled = true
    }
  }, [selectedMeetingId, token, transcriptStatus])

  useEffect(() => {
    if (!token || !selectedMeetingId || !isWorkflowInFlight) {
      return undefined
    }

    const applySnapshot = (snapshot) => {
      setSelectedMeetingDetail((prev) => {
        if (!prev || prev.meeting?.id !== selectedMeetingId) {
          return prev
        }

        // The snapshot carries status metadata only, so merge it over what is
        // already held rather than replacing: the file name, object key, and
        // transcript body must survive.
        return {
          ...prev,
          recording: snapshot.recording
            ? { ...prev.recording, ...snapshot.recording }
            : prev.recording,
          transcript: snapshot.transcript
            ? { ...prev.transcript, ...snapshot.transcript }
            : prev.transcript,
          analysisRun: snapshot.analysisRun
            ? { ...prev.analysisRun, ...snapshot.analysisRun }
            : prev.analysisRun,
        }
      })
    }

    const stop = subscribeToWorkflowEvents({
      meetingId: selectedMeetingId,
      token,
      onSnapshot: applySnapshot,
      // No refetch on settle. The stream deliberately omits transcript text, but
      // nothing here renders it: this view shows statuses and error messages
      // only, and the final `status` frame already carried both. A view that
      // starts displaying the transcript body should fetch it itself rather than
      // making every viewer pay for it here.
      // Losing the stream degrades to the status shown at page load. Surfacing a
      // banner for a background channel would be noise.
      onError: () => {},
    })

    return stop
  }, [isWorkflowInFlight, selectedMeetingId, token, workflowPhase])

  /**
   * Applies the reviewed analysis to the draft minutes.
   *
   * The version the client currently holds is sent as the precondition. A 409
   * means someone edited the minutes since it was loaded; the server reports the
   * current version rather than overwriting, and the user decides what to do, so
   * this never retries on its own.
   */
  const applyGeneratedMinutesToDraft = useCallback(async () => {
    const analysisRunId = loadedAnalysisReview?.review?.analysisRun?.id
    const expectedVersion = selectedMeetingDetail?.minutes?.version

    if (!selectedMeetingId || !analysisRunId || !expectedVersion) {
      return
    }

    setApplyMinutesState({ status: 'applying' })

    try {
      const result = await applyGeneratedMinutes(getApiClient(token), selectedMeetingId, {
        analysisRunId,
        expectedVersion,
      })

      setSelectedMeetingDetail((prev) =>
        prev && prev.meeting?.id === selectedMeetingId ? { ...prev, minutes: result.minutes } : prev
      )
      setApplyMinutesState({ status: 'applied' })
    } catch (error) {
      if (error.response?.status === 409) {
        const { currentVersion, minutes } = error.response.data ?? {}

        // Refresh to what is actually stored, so the user sees the edit that
        // caused the conflict and a retry carries the version they have now seen.
        if (minutes) {
          setSelectedMeetingDetail((prev) =>
            prev && prev.meeting?.id === selectedMeetingId ? { ...prev, minutes } : prev
          )
        }

        setApplyMinutesState({ status: 'conflict', currentVersion })
        return
      }

      setApplyMinutesState({ status: 'idle' })
      onError(error.response?.data?.error || 'Unable to apply generated minutes')
    }
  }, [
    loadedAnalysisReview,
    onError,
    selectedMeetingDetail?.minutes?.version,
    selectedMeetingId,
    token,
  ])

  /**
   * Replaces one suggestion in the loaded review after it has been reviewed.
   *
   * Reviewed suggestions stay in the list rather than disappearing: the record of
   * what was offered and turned down is as much a part of the review as what was
   * taken.
   */
  const replaceSuggestion = useCallback((suggestion) => {
    setLoadedAnalysisReview((prev) => {
      if (!prev?.review?.suggestions) {
        return prev
      }

      return {
        ...prev,
        review: {
          ...prev.review,
          suggestions: prev.review.suggestions.map((item) =>
            item.id === suggestion.id ? { ...item, ...suggestion } : item
          ),
        },
      }
    })
  }, [])

  const reviewSuggestion = useCallback(
    async (suggestionId, action) => {
      if (!selectedMeetingId) {
        return
      }

      const client = getApiClient(token)

      try {
        const result =
          action === 'accept'
            ? await acceptAnalysisSuggestion(client, selectedMeetingId, suggestionId)
            : await rejectAnalysisSuggestion(client, selectedMeetingId, suggestionId)

        replaceSuggestion(result.suggestion)

        // An accepted suggestion becomes a real action item, so the list beside
        // it has to show it without a reload.
        if (result.actionItem) {
          setSelectedMeetingDetail((prev) =>
            prev && prev.meeting?.id === selectedMeetingId
              ? { ...prev, actionItems: [result.actionItem, ...prev.actionItems] }
              : prev
          )
        }
      } catch (error) {
        onError(error.response?.data?.error || 'Unable to review the suggestion')
      }
    },
    [onError, replaceSuggestion, selectedMeetingId, token]
  )

  const acceptSuggestion = useCallback(
    (suggestionId) => reviewSuggestion(suggestionId, 'accept'),
    [reviewSuggestion]
  )

  const rejectSuggestion = useCallback(
    (suggestionId) => reviewSuggestion(suggestionId, 'reject'),
    [reviewSuggestion]
  )

  const editSuggestion = useCallback(
    async (suggestionId, updates) => {
      if (!selectedMeetingId) {
        return
      }

      try {
        const result = await editAnalysisSuggestion(
          getApiClient(token),
          selectedMeetingId,
          suggestionId,
          updates
        )
        replaceSuggestion(result.suggestion)
      } catch (error) {
        onError(error.response?.data?.error || 'Unable to edit the suggestion')
      }
    },
    [onError, replaceSuggestion, selectedMeetingId, token]
  )

  const dismissApplyMinutesState = useCallback(() => {
    setApplyMinutesState({ status: 'idle' })
  }, [])

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
              analysisRun: null,
            }
          : prev
      )
    } catch (error) {
      onError(error.response?.data?.error || 'Unable to remove meeting recording')
    }
  }, [onError, selectedMeetingId, token])

  // The null check has to come first. Optional chaining guards the read but not
  // the comparison: before any meeting is opened both sides are undefined, the
  // equality holds, and the true branch dereferences null.
  const analysisReview =
    loadedAnalysisReview && loadedAnalysisReview.meetingId === selectedMeetingId
      ? loadedAnalysisReview.review
      : null

  return {
    requestMeetingChange,
    changeRequestInbox,
    refreshChangeRequests,
    markChangeRequestRead,
    selectedMeetingDetail,
    analysisReview,
    applyMinutesState,
    applyGeneratedMinutesToDraft,
    dismissApplyMinutesState,
    acceptSuggestion,
    rejectSuggestion,
    editSuggestion,
    pendingMeetingMaterialFiles,
    pendingMeetingRecordingFile,
    recordingExtractProgress,
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
    generateMinutesFromRecording,
    removeRecording,
  }
}
