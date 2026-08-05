import { useEffect, useMemo, useState } from 'react'
import { isBefore, startOfToday } from 'date-fns'
import { ArrowLeft, ArrowRight, Check, CheckCircle, X } from 'lucide-react'

import { getApiClient } from '../../../lib/apiClient.js'
import { createMeetingRequestService } from '../../../services/meetingRequestService.js'
import { AddTimeOptionsStep } from './AddTimeOptionsStep.jsx'
import { ConfirmMeetingStep } from './ConfirmMeetingStep.jsx'
import { CreateRequestStep } from './CreateRequestStep.jsx'
import { InviteParticipantsStep } from './InviteParticipantsStep.jsx'
import { ReviewResponsesStep } from './ReviewResponsesStep.jsx'
import {
  getDateValueInTimeZone,
  MEETING_TIMEZONE_OPTIONS,
  zonedDateTimeToUtcDate,
} from '../../../utils/timezone.js'

const steps = ['Meeting Setup', 'Invite', 'Review', 'Confirm']

const DEFAULT_START_TIME = '09:00'

const getTimeValueAfterDuration = (startTime, durationMinutes) => {
  const [hour, minute] = startTime.split(':').map(Number)
  const totalMinutes = hour * 60 + minute + durationMinutes
  const endHour = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0')
  const endMinute = String(totalMinutes % 60).padStart(2, '0')

  return `${endHour}:${endMinute}`
}

const getDurationMinutes = (startTime, endTime) => {
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return 0
  }

  const [startHour, startMinute] = startTime.split(':').map(Number)
  const [endHour, endMinute] = endTime.split(':').map(Number)

  return endHour * 60 + endMinute - (startHour * 60 + startMinute)
}

const getInitialRequestForm = () => ({
  title: '',
  meetingTag: '',
  description: '',
  durationMinutes: 60,
  startTime: DEFAULT_START_TIME,
  endTime: getTimeValueAfterDuration(DEFAULT_START_TIME, 60),
  timezoneName: MEETING_TIMEZONE_OPTIONS[0].value,
  responseDeadline: '',
})

const getInitialTimeDraft = () => ({ date: '', time: '' })

const toIsoFromWallTime = (value, timeZone) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    return null
  }

  const [date, time] = value.split('T')

  return zonedDateTimeToUtcDate({ date, time, timeZone }).toISOString()
}

const getRequestPayload = (requestForm) => ({
  title: requestForm.title,
  tag: requestForm.meetingTag || null,
  description: requestForm.description || null,
  durationMinutes: requestForm.durationMinutes,
  timezoneName: requestForm.timezoneName,
  responseDeadline: toIsoFromWallTime(requestForm.responseDeadline, requestForm.timezoneName),
})

const updateTimeOptionsForMeetingTime = (options, { startTime, durationMinutes, timezoneName }) =>
  options.map((option) => {
    const date = getDateValueInTimeZone(option.startsAt, timezoneName)
    const startsAt = zonedDateTimeToUtcDate({ date, time: startTime, timeZone: timezoneName })

    return {
      ...option,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + durationMinutes * 60 * 1000).toISOString(),
    }
  })

const getRequestFormFromMeetingRequest = (request) => ({
  title: request.title ?? '',
  meetingTag: request.tag ?? '',
  description: request.description ?? '',
  durationMinutes: request.durationMinutes ?? 60,
  startTime: DEFAULT_START_TIME,
  endTime: getTimeValueAfterDuration(DEFAULT_START_TIME, request.durationMinutes ?? 60),
  timezoneName: request.timezoneName ?? MEETING_TIMEZONE_OPTIONS[0].value,
  responseDeadline: request.responseDeadline ? request.responseDeadline.slice(0, 16) : '',
})

const getResumeStepIndex = ({ meetingRequest, timeOptions, invitees }) => {
  if (!meetingRequest?.title || timeOptions.length === 0) {
    return 0
  }

  if (invitees.length === 0) {
    return 1
  }

  return 2
}

export const CreateMeetingWizard = ({
  isOpen,
  onClose,
  onCreated,
  token,
  users,
  tags,
  meetings = [],
  meetingRequestId = null,
  currentUserId,
}) => {
  const [stepIndex, setStepIndex] = useState(0)
  const [requestForm, setRequestForm] = useState(getInitialRequestForm)
  const [meetingRequest, setMeetingRequest] = useState(null)
  const [timeDraft, setTimeDraft] = useState(getInitialTimeDraft)
  const [timeOptions, setTimeOptions] = useState([])
  const [savedTimeOptions, setSavedTimeOptions] = useState([])
  const [invitees, setInvitees] = useState([])
  const [savedInvitees, setSavedInvitees] = useState([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [selectedTimeOptionId, setSelectedTimeOptionId] = useState('')
  const [confirmForm, setConfirmForm] = useState({ location: '' })
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingRequest, setIsLoadingRequest] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isTerminateConfirmOpen, setIsTerminateConfirmOpen] = useState(false)
  const [isInviteSentOpen, setIsInviteSentOpen] = useState(false)

  const service = useMemo(() => createMeetingRequestService(getApiClient(token)), [token])
  const isResumeMode = Boolean(meetingRequestId)
  const availableUsers = users.filter((user) => user.id !== currentUserId)
  const selectedOption = savedTimeOptions.find((option) => option.id === selectedTimeOptionId)
  const canConfirmMeetingRequest =
    meetingRequest?.canConfirm || meetingRequest?.status === 'ready_to_confirm'
  const isReviewWaiting = stepIndex === 2 && !canConfirmMeetingRequest

  const reset = () => {
    setStepIndex(0)
    setRequestForm(getInitialRequestForm())
    setMeetingRequest(null)
    setTimeDraft(getInitialTimeDraft())
    setTimeOptions([])
    setSavedTimeOptions([])
    setInvitees([])
    setSavedInvitees([])
    setSelectedUserId('')
    setManualEmail('')
    setSelectedTimeOptionId('')
    setConfirmForm({ location: '' })
    setIsLoadingRequest(false)
    setErrorMessage('')
    setSuccessMessage('')
    setIsTerminateConfirmOpen(false)
    setIsInviteSentOpen(false)
  }

  useEffect(() => {
    if (!isOpen || !meetingRequestId) {
      return
    }

    let isCancelled = false

    const loadRequest = async () => {
      setIsLoadingRequest(true)
      setErrorMessage('')

      try {
        const detail = await service.getRequest(meetingRequestId)

        if (isCancelled) {
          return
        }

        const nextSelectedTimeOptionId =
          detail.timeOptions.find((option) => option.isSelected)?.id ||
          detail.timeOptions[0]?.id ||
          ''

        setMeetingRequest(detail.meetingRequest)
        setRequestForm(getRequestFormFromMeetingRequest(detail.meetingRequest))
        setTimeOptions(detail.timeOptions)
        setSavedTimeOptions(detail.timeOptions)
        setInvitees(detail.invitees)
        setSavedInvitees(detail.invitees)
        setSelectedTimeOptionId(nextSelectedTimeOptionId)
        setStepIndex(getResumeStepIndex(detail))
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error.response?.data?.error || 'Unable to load meeting request')
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingRequest(false)
        }
      }
    }

    loadRequest()

    return () => {
      isCancelled = true
    }
  }, [isOpen, meetingRequestId, service])

  if (!isOpen) {
    return null
  }

  const close = () => {
    reset()
    onClose()
  }

  const runStep = async () => {
    setIsSaving(true)
    setErrorMessage('')

    try {
      if (stepIndex === 0) {
        const payload = getRequestPayload(requestForm)
        let savedMeetingRequest

        if (!meetingRequest?.id) {
          savedMeetingRequest = await service.createRequest(payload)
        } else {
          savedMeetingRequest = await service.updateRequest(meetingRequest.id, payload)
        }
        setMeetingRequest(savedMeetingRequest)

        const saved = await service.updateTimeOptions(savedMeetingRequest.id, timeOptions)
        setSavedTimeOptions(saved)
        setSelectedTimeOptionId((prev) => prev || saved[0]?.id || '')
      }

      if (stepIndex === 1) {
        if (!meetingRequest?.id) {
          throw new Error('Create the request before inviting participants')
        }
        await service.updateInvitees(meetingRequest.id, invitees)
        const delivery = await service.sendInvitations(meetingRequest.id)

        if (!isResumeMode) {
          await onCreated()
          setSuccessMessage(`${delivery.sentCount} invitation(s) have been sent`)
          setIsInviteSentOpen(true)
          return
        }

        const detail = await service.getRequest(meetingRequest.id)
        setMeetingRequest(detail.meetingRequest)
        setSavedTimeOptions(detail.timeOptions)
        setSavedInvitees(detail.invitees)
        setSelectedTimeOptionId((prev) => prev || detail.timeOptions[0]?.id || '')
        setStepIndex(2)
        return
      }

      if (stepIndex === 2) {
        const detail = await service.getRequest(meetingRequest.id)
        setMeetingRequest(detail.meetingRequest)
        setSavedTimeOptions(detail.timeOptions)
        setSavedInvitees(detail.invitees)
        setSelectedTimeOptionId((prev) => prev || detail.timeOptions[0]?.id || '')

        if (
          !detail.meetingRequest.canConfirm &&
          detail.meetingRequest.status !== 'ready_to_confirm'
        ) {
          await onCreated()
          reset()
          onClose()
          return
        }

        setStepIndex(3)
        return
      }

      if (stepIndex === 3) {
        if (!selectedTimeOptionId) {
          throw new Error('Select a time option before confirming')
        }

        const result = await service.confirmRequest(meetingRequest.id, {
          timeOptionId: selectedTimeOptionId,
          location: confirmForm.location || null,
          tag: requestForm.meetingTag || null,
        })
        await onCreated(result)
        reset()
        onClose()
        return result
      }

      setStepIndex((prev) => Math.min(prev + 1, steps.length - 1))
    } catch (error) {
      setErrorMessage(error.response?.data?.error || error.message || 'Unable to continue')
    } finally {
      setIsSaving(false)
    }
  }

  const addTimeOption = (candidate = timeDraft) => {
    if (!candidate.date || !candidate.time) {
      setErrorMessage('Choose both date and start time')
      return
    }

    if (isBefore(new Date(`${candidate.date}T00:00:00`), startOfToday())) {
      setErrorMessage('Choose today or a future date')
      return
    }

    const startsAt = zonedDateTimeToUtcDate({
      date: candidate.date,
      time: candidate.time,
      timeZone: requestForm.timezoneName,
    })
    const endsAt = new Date(startsAt.getTime() + requestForm.durationMinutes * 60 * 1000)
    const startsAtIso = startsAt.toISOString()

    if (startsAt < new Date()) {
      setErrorMessage('Choose a future start time')
      return
    }

    if (timeOptions.some((option) => option.startsAt === startsAtIso)) {
      setErrorMessage('This time option is already selected')
      return
    }

    setTimeOptions((prev) => [
      ...prev,
      {
        startsAt: startsAtIso,
        endsAt: endsAt.toISOString(),
        sortOrder: prev.length,
      },
    ])
    setTimeDraft({ date: candidate.date, time: '' })
    setErrorMessage('')
  }

  const addUserInvitee = (userId = selectedUserId) => {
    const user = users.find((item) => item.id === userId)
    if (!user) {
      return
    }

    setInvitees((prev) =>
      prev.some((invitee) => invitee.email === user.email)
        ? prev
        : [...prev, { email: user.email, name: user.name }]
    )
    setSelectedUserId('')
  }

  const addEmailInvitee = () => {
    const email = manualEmail.trim().toLowerCase()
    if (!email) {
      return
    }

    setInvitees((prev) =>
      prev.some((invitee) => invitee.email === email) ? prev : [...prev, { email }]
    )
    setManualEmail('')
  }

  const terminateRequest = async () => {
    if (!meetingRequest?.id) {
      return
    }

    setIsSaving(true)
    setErrorMessage('')

    try {
      await service.terminateRequest(meetingRequest.id)
      await onCreated()
      setSuccessMessage('Meeting request has been terminated')
      reset()
      onClose()
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to terminate meeting request')
    } finally {
      setIsSaving(false)
    }
  }

  const updateRequestForm = (patch) => {
    const nextStartTime = patch.startTime ?? requestForm.startTime
    const nextEndTime = patch.endTime ?? requestForm.endTime
    const nextRequestForm = {
      ...requestForm,
      ...patch,
      durationMinutes: getDurationMinutes(nextStartTime, nextEndTime),
    }
    setRequestForm(nextRequestForm)

    if (patch.startTime !== undefined || patch.endTime !== undefined) {
      setTimeOptions((prev) => updateTimeOptionsForMeetingTime(prev, nextRequestForm))
      setSavedTimeOptions((prev) => updateTimeOptionsForMeetingTime(prev, nextRequestForm))
    }

    if (patch.timezoneName !== undefined && patch.timezoneName !== requestForm.timezoneName) {
      setTimeDraft(getInitialTimeDraft())
      setTimeOptions([])
      setSavedTimeOptions([])
      setSelectedTimeOptionId('')
    }
  }

  const isRequestStepComplete =
    requestForm.title.trim() &&
    requestForm.meetingTag.trim() &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(requestForm.responseDeadline)

  const canContinue =
    (stepIndex === 0 &&
      isRequestStepComplete &&
      requestForm.durationMinutes > 0 &&
      timeOptions.length > 0) ||
    (stepIndex === 1 && invitees.length > 0) ||
    (stepIndex === 2 && savedTimeOptions.length > 0) ||
    (stepIndex === 3 && selectedTimeOptionId)
  const primaryActionLabel = isSaving
    ? 'Saving...'
    : !isResumeMode && stepIndex === 1
      ? 'Send Invitations'
      : stepIndex === 2
        ? canConfirmMeetingRequest
          ? 'Continue'
          : 'Done'
        : stepIndex === 3
          ? 'Confirm Meeting'
          : 'Continue'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <section className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white px-4 py-5 shadow-2xl sm:px-5">
        <div>
          <div className="relative">
            <h3 className="text-center text-lg font-bold text-slate-900">Create Meeting</h3>
            <button
              type="button"
              onClick={close}
              aria-label="Close create meeting modal"
              className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="mx-auto mt-6 grid w-full max-w-2xl grid-cols-4">
            {steps.map((step, index) => (
              <div
                key={step}
                className="relative flex min-w-0 flex-col items-center"
                aria-current={index === stepIndex ? 'step' : undefined}
              >
                {index > 0 ? (
                  <span
                    className={`absolute right-1/2 top-5 h-0.5 w-full ${
                      index <= stepIndex ? 'bg-blue-600' : 'bg-slate-200'
                    }`}
                  />
                ) : null}
                {index < steps.length - 1 ? (
                  <span
                    className={`absolute left-1/2 top-5 h-0.5 w-full ${
                      index < stepIndex ? 'bg-blue-600' : 'bg-slate-200'
                    }`}
                  />
                ) : null}
                <span
                  className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-extrabold ${
                    index === stepIndex
                      ? 'border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-200'
                      : index < stepIndex
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-300 bg-white text-slate-500'
                  }`}
                >
                  {index < stepIndex ? <Check className="h-5 w-5" aria-hidden="true" /> : index + 1}
                </span>
                <span
                  className={`mt-2 truncate px-1 text-center text-xs font-bold ${
                    index <= stepIndex ? 'text-slate-800' : 'text-slate-500'
                  }`}
                >
                  {step}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 pb-24">
          {isLoadingRequest ? (
            <p className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              Loading meeting request...
            </p>
          ) : null}
          {!isLoadingRequest && stepIndex === 0 ? (
            <div className="space-y-6">
              <CreateRequestStep form={requestForm} tags={tags} onChange={updateRequestForm} />
              <AddTimeOptionsStep
                options={timeOptions}
                durationMinutes={requestForm.durationMinutes}
                startTime={requestForm.startTime}
                endTime={requestForm.endTime}
                timezoneName={requestForm.timezoneName}
                blockedMeetings={meetings}
                onMeetingTimeChange={updateRequestForm}
                onAddOption={addTimeOption}
                onRemoveOption={(indexToRemove) =>
                  setTimeOptions((prev) => prev.filter((_, index) => index !== indexToRemove))
                }
              />
            </div>
          ) : null}
          {!isLoadingRequest && stepIndex === 1 ? (
            <InviteParticipantsStep
              users={availableUsers}
              invitees={invitees}
              selectedUserId={selectedUserId}
              manualEmail={manualEmail}
              onSelectedUserChange={setSelectedUserId}
              onManualEmailChange={setManualEmail}
              onAddUser={addUserInvitee}
              onAddEmail={addEmailInvitee}
              onRemoveInvitee={(email) =>
                setInvitees((prev) => prev.filter((invitee) => invitee.email !== email))
              }
            />
          ) : null}
          {!isLoadingRequest && stepIndex === 2 ? (
            <ReviewResponsesStep
              status={meetingRequest?.status}
              canConfirm={canConfirmMeetingRequest}
              responseDeadlinePassed={meetingRequest?.responseDeadlinePassed}
              timeOptions={savedTimeOptions}
              invitees={savedInvitees}
              selectedTimeOptionId={selectedTimeOptionId}
              timezoneName={meetingRequest?.timezoneName ?? requestForm.timezoneName}
              onSelect={setSelectedTimeOptionId}
            />
          ) : null}
          {!isLoadingRequest && stepIndex === 3 ? (
            <ConfirmMeetingStep
              selectedOption={selectedOption}
              location={confirmForm.location}
              timezoneName={meetingRequest?.timezoneName ?? requestForm.timezoneName}
              onChange={(patch) => setConfirmForm((prev) => ({ ...prev, ...patch }))}
            />
          ) : null}
        </div>

        {errorMessage ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errorMessage}
          </p>
        ) : null}
        {successMessage ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            {successMessage}
          </p>
        ) : null}

        <div className="sticky bottom-0 -mx-4 -mb-5 mt-6 border-t border-slate-100 bg-white px-4 py-4 shadow-[0_-10px_24px_rgba(15,23,42,0.08)] sm:-mx-5 sm:px-5">
          <div className="mx-auto flex w-full max-w-xl justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStepIndex((prev) => Math.max(prev - 1, 0))}
                disabled={stepIndex === 0 || isSaving || isResumeMode}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </button>
              {isResumeMode ? (
                <button
                  type="button"
                  onClick={() => setIsTerminateConfirmOpen(true)}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                >
                  Terminate
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={runStep}
              disabled={!canContinue || isSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:bg-slate-300"
            >
              {primaryActionLabel}
              {stepIndex === 3 || isReviewWaiting ? (
                <CheckCircle className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </section>
      {isTerminateConfirmOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h4 className="text-lg font-bold text-slate-900">Terminate Meeting Request</h4>
            <p className="mt-2 text-sm text-slate-600">
              This will cancel the meeting request and any confirmed meeting linked to it.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsTerminateConfirmOpen(false)}
                disabled={isSaving}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Keep Request
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsTerminateConfirmOpen(false)
                  await terminateRequest()
                }}
                disabled={isSaving}
                className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:bg-rose-300"
              >
                Terminate
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isInviteSentOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h4 className="text-lg font-bold text-slate-900">Invitations Sent</h4>
            <p className="mt-2 text-sm text-slate-600">{successMessage}</p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  reset()
                  onClose()
                }}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
