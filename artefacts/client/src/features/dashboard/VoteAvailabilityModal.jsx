import { ArrowLeft, CalendarDays, Check, CheckCircle2, Clock, Users, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { getApiClient } from '../../lib/apiClient.js'
import { createMeetingRequestService } from '../../services/meetingRequestService.js'
import { formatDateTime } from '../../utils/date.js'
import { formatDateTimeInTimeZone } from '../../utils/timezone.js'

const formatTimeRange = (startsAt, endsAt, timezoneName) => {
  const date = formatDateTimeInTimeZone(startsAt, timezoneName, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const startTime = formatDateTimeInTimeZone(startsAt, timezoneName, {
    hour: 'numeric',
    minute: '2-digit',
  })
  const endTime = formatDateTimeInTimeZone(endsAt, timezoneName, {
    hour: 'numeric',
    minute: '2-digit',
  })

  return { date, time: `${startTime} - ${endTime}` }
}

const StepBadge = ({ value }) => (
  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-sm font-extrabold text-white">
    {value}
  </span>
)

export const VoteAvailabilityModal = ({ request, token, isOpen, onClose, onSubmitted }) => {
  const [step, setStep] = useState(0)
  const [detail, setDetail] = useState(null)
  const [selectedOptionIds, setSelectedOptionIds] = useState(() => new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!isOpen || !request) {
      return
    }

    let isCancelled = false

    const load = async () => {
      try {
        setIsLoading(true)
        setErrorMessage('')
        setStep(0)
        const client = getApiClient(token)
        const service = createMeetingRequestService(client)
        const loadedDetail = await service.getInviteeRequest(request.id, request.inviteeId)

        if (isCancelled) {
          return
        }

        const availableIds = new Set(
          loadedDetail.responses
            .filter((response) => response.isAvailable)
            .map((response) => response.timeOptionId)
        )
        setDetail(loadedDetail)
        setSelectedOptionIds(availableIds)
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error.response?.data?.error || 'Unable to load availability request')
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    load()

    return () => {
      isCancelled = true
    }
  }, [isOpen, request, token])

  const meetingRequest = detail?.meetingRequest ?? request
  const sortedTimeOptions = useMemo(
    () =>
      [...(detail?.timeOptions ?? [])].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)),
    [detail?.timeOptions]
  )
  const selectedCount = selectedOptionIds.size
  const isAvailabilityClosed = Boolean(
    meetingRequest?.availabilityClosed ||
    meetingRequest?.responseDeadlinePassed ||
    (meetingRequest?.responseDeadline && new Date(meetingRequest.responseDeadline) <= new Date())
  )

  if (!isOpen || !request) {
    return null
  }

  const toggleOption = (timeOptionId) => {
    if (isAvailabilityClosed) {
      return
    }

    setSelectedOptionIds((prev) => {
      const next = new Set(prev)
      if (next.has(timeOptionId)) {
        next.delete(timeOptionId)
      } else {
        next.add(timeOptionId)
      }
      return next
    })
  }

  const submitAvailability = async () => {
    if (!detail || sortedTimeOptions.length === 0) {
      return
    }

    try {
      setIsSubmitting(true)
      setErrorMessage('')
      const client = getApiClient(token)
      const service = createMeetingRequestService(client)
      const responses = sortedTimeOptions.map((option) => ({
        timeOptionId: option.id,
        isAvailable: selectedOptionIds.has(option.id),
      }))
      await service.submitAvailability(meetingRequest.id, detail.invitee.id, responses)
      await onSubmitted?.()
      setStep(2)
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to submit availability')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6">
      <div className="max-h-[92vh] w-full max-w-[430px] overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-2xl shadow-violet-950/10">
        <div className="flex items-center justify-between border-b border-violet-100 bg-violet-50/60 px-5 py-4">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-violet-600" />
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-violet-600">
                Participant View
              </p>
              <p className="text-xs text-slate-500">Easy and quick availability selection</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 transition hover:bg-white hover:text-slate-800"
            aria-label="Close availability modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-76px)] overflow-y-auto px-6 py-6">
          {errorMessage ? (
            <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {errorMessage}
            </p>
          ) : null}

          {isLoading ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              Loading availability request...
            </p>
          ) : null}

          {!isLoading && step === 0 ? (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <StepBadge value="1" />
                <p className="text-sm font-extrabold text-violet-600">Invite Summary</p>
              </div>

              <section className="rounded-xl border border-slate-200 bg-white p-5 text-center">
                <p className="text-xl font-extrabold text-slate-900">You&apos;re invited!</p>
                <p className="mt-3 text-sm text-slate-600">
                  {request.creator?.name || request.creator?.email || 'The host'} has invited you to
                </p>
                <p className="mt-1 text-base font-extrabold text-slate-900">
                  {meetingRequest?.title}
                </p>
                <div className="mt-5 space-y-3 text-left text-sm font-semibold text-slate-600">
                  <p className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-slate-500" />
                    {meetingRequest?.durationMinutes} min
                  </p>
                  <p className="flex items-center gap-3">
                    <CalendarDays className="h-4 w-4 text-slate-500" />
                    {meetingRequest?.timezoneName}
                  </p>
                </div>
                {meetingRequest?.responseDeadline ? (
                  <p className="mt-5 text-xs font-bold text-slate-500">
                    Response deadline: {formatDateTime(meetingRequest.responseDeadline)}
                  </p>
                ) : null}
              </section>

              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={isAvailabilityClosed}
                className="w-full rounded-lg bg-violet-600 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isAvailabilityClosed ? 'Response Deadline Passed' : 'Select Availability'}
              </button>
            </div>
          ) : null}

          {!isLoading && step === 1 ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <StepBadge value="2" />
                  <p className="text-sm font-extrabold text-violet-600">Select Availability</p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Summary
                </button>
              </div>

              <div>
                <p className="text-base font-extrabold text-slate-900">{meetingRequest?.title}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {isAvailabilityClosed
                    ? 'The response deadline has passed. Availability can no longer be changed.'
                    : 'Select all the times that work for you.'}
                </p>
              </div>

              <div className="space-y-3">
                {sortedTimeOptions.map((option) => {
                  const isSelected = selectedOptionIds.has(option.id)
                  const range = formatTimeRange(
                    option.startsAt,
                    option.endsAt,
                    meetingRequest.timezoneName
                  )

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleOption(option.id)}
                      disabled={isAvailabilityClosed}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition ${
                        isSelected
                          ? 'border-violet-300 bg-violet-50'
                          : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/40'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-extrabold text-slate-800">
                          {range.date}
                        </span>
                        <span className="mt-1 block text-xs font-semibold text-slate-500">
                          {range.time}
                        </span>
                        <span className="mt-2 block text-xs font-bold text-slate-400">
                          {option.availableCount} available
                        </span>
                      </span>
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                          isSelected
                            ? 'border-violet-600 bg-violet-600 text-white'
                            : 'border-slate-300 bg-white text-transparent'
                        }`}
                      >
                        <Check className="h-4 w-4" />
                      </span>
                    </button>
                  )
                })}
              </div>

              {sortedTimeOptions.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  No candidate times have been added yet.
                </p>
              ) : null}

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedOptionIds(new Set())}
                  className="rounded-lg px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                >
                  Clear all
                </button>
                <button
                  type="button"
                  onClick={submitAvailability}
                  disabled={isSubmitting || isAvailabilityClosed || sortedTimeOptions.length === 0}
                  className="rounded-lg bg-violet-600 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isAvailabilityClosed
                    ? 'Deadline passed'
                    : isSubmitting
                      ? 'Submitting...'
                      : selectedCount > 0
                        ? `Submit ${selectedCount} selected`
                        : 'Submit none available'}
                </button>
              </div>
            </div>
          ) : null}

          {!isLoading && step === 2 ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <StepBadge value="3" />
                <p className="text-sm font-extrabold text-violet-600">Confirmation</p>
              </div>

              <section className="rounded-xl border border-violet-100 bg-violet-50/60 px-5 py-8 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-400 text-white">
                  <CheckCircle2 className="h-7 w-7" />
                </span>
                <p className="mt-5 text-lg font-extrabold text-slate-900">
                  Thanks, you&apos;re all set!
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  Your response has been submitted. You can update it before the deadline.
                </p>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="mt-5 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                >
                  Update My Response
                </button>
              </section>

              <section className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-4">
                <p className="text-sm font-extrabold text-slate-900">What&apos;s next?</p>
                <p className="mt-1 text-sm text-slate-600">
                  {request.creator?.name || 'The host'} will review responses and confirm the final
                  meeting time.
                </p>
              </section>

              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-lg bg-violet-600 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-violet-700"
              >
                Return to Dashboard
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
