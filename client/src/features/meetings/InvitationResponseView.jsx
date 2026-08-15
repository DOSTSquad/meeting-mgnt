import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

import {
  getPublicInvitation,
  submitPublicAvailability,
} from '../../services/meetingRequestService.js'
import { formatDateTimeInTimeZone } from '../../utils/timezone.js'

export const InvitationResponseView = ({ token }) => {
  const [invitation, setInvitation] = useState(null)
  const [responses, setResponses] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let isCancelled = false

    const loadInvitation = async () => {
      if (!token) {
        setErrorMessage('Invitation link is invalid')
        setIsLoading(false)
        return
      }

      try {
        const detail = await getPublicInvitation(token)
        if (isCancelled) {
          return
        }

        setInvitation(detail)
        setResponses(
          Object.fromEntries(
            detail.responses.map((response) => [response.timeOptionId, response.isAvailable])
          )
        )
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error.message)
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    loadInvitation()

    return () => {
      isCancelled = true
    }
  }, [token])

  const submit = async (event) => {
    event.preventDefault()
    const timeOptions = invitation.timeOptions
    if (timeOptions.some((option) => typeof responses[option.id] !== 'boolean')) {
      setErrorMessage('Please answer every time option')
      return
    }

    try {
      setIsSubmitting(true)
      setErrorMessage('')
      await submitPublicAvailability(
        token,
        timeOptions.map((option) => ({
          timeOptionId: option.id,
          isAvailable: responses[option.id],
        }))
      )
      setIsSubmitted(true)
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4 text-slate-600">
        Loading invitation...
      </main>
    )
  }

  if (!invitation) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <section className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-xl">
          <h1 className="text-xl font-bold text-slate-900">Invitation unavailable</h1>
          <p className="mt-2 text-sm text-rose-700">{errorMessage}</p>
        </section>
      </main>
    )
  }

  const { meetingRequest, invitee, timeOptions } = invitation

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6">
      <section className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-300/40">
        <header className="bg-slate-900 px-6 py-7 text-white sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-300">
            Meeting invitation
          </p>
          <h1 className="mt-3 text-2xl font-bold sm:text-3xl">{meetingRequest.title}</h1>
          <p className="mt-2 text-sm text-slate-300">For {invitee.name || invitee.email}</p>
        </header>

        <form className="space-y-6 p-6 sm:p-8" onSubmit={submit}>
          {meetingRequest.description ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              {meetingRequest.description}
            </div>
          ) : null}

          {isSubmitted ? (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-bold">Availability submitted</p>
                <p className="mt-1 text-sm">You may close this page.</p>
              </div>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-lg font-bold text-slate-900">When are you available?</h2>
                <p className="mt-1 text-sm text-slate-500">Select one answer for every option.</p>
              </div>

              <div className="space-y-3">
                {timeOptions.map((option) => (
                  <fieldset key={option.id} className="rounded-xl border border-slate-200 p-4">
                    <legend className="px-1 text-sm font-bold text-slate-800">
                      {formatDateTimeInTimeZone(option.startsAt, meetingRequest.timezoneName, {
                        dateStyle: 'full',
                        timeStyle: 'short',
                      })}
                    </legend>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      {[true, false].map((isAvailable) => (
                        <label
                          key={String(isAvailable)}
                          className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-bold ${
                            responses[option.id] === isAvailable
                              ? isAvailable
                                ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                                : 'border-rose-400 bg-rose-50 text-rose-800'
                              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            className="sr-only"
                            type="radio"
                            name={option.id}
                            checked={responses[option.id] === isAvailable}
                            onChange={() =>
                              setResponses((current) => ({
                                ...current,
                                [option.id]: isAvailable,
                              }))
                            }
                          />
                          {isAvailable ? 'Available' : 'Unavailable'}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>

              {errorMessage ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {errorMessage}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="h-11 w-full rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 disabled:bg-slate-300"
              >
                {isSubmitting ? 'Submitting...' : 'Submit availability'}
              </button>
            </>
          )}
        </form>
      </section>
    </main>
  )
}
