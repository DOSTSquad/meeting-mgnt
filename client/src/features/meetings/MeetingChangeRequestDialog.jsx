import { useEffect, useRef, useState } from 'react'

export const MeetingChangeRequestDialog = ({ onSubmit, onClose }) => {
  const dialogRef = useRef(null)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    dialogRef.current.showModal()
  }, [])

  const submit = async (event) => {
    event.preventDefault()
    if (!message.trim() || status === 'sending') return
    setStatus('sending')
    setError('')
    try {
      await onSubmit(message.trim())
      setStatus('sent')
    } catch (failure) {
      setError(failure.response?.data?.error || 'Unable to send your request. Please try again.')
      setStatus('error')
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      aria-labelledby="change-request-title"
      className="m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-900/40"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 id="change-request-title" className="text-lg font-extrabold">
          Request to change
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close change requests"
          className="rounded px-2 text-xl text-slate-500 hover:bg-slate-100"
        >
          ×
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {status === 'sent' ? (
        <p
          role="status"
          className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700"
        >
          Your change request has been sent to the meeting owner.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-4">
          <p className="text-sm text-slate-500">
            Tell the meeting owner what you would like changed. Only the owner can read your
            request.
          </p>
          <div>
            <label htmlFor="change-request-message" className="text-sm font-bold">
              Requested change
            </label>
            <textarea
              id="change-request-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              required
              maxLength={2000}
              rows={5}
              disabled={status === 'sending'}
              className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <p className="mt-1 text-right text-xs text-slate-500">{message.length}/2000</p>
          </div>
          <button
            type="submit"
            disabled={!message.trim() || status === 'sending'}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'sending' ? 'Sending...' : 'Send request'}
          </button>
        </form>
      )}
    </dialog>
  )
}
