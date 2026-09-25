import { useEffect, useRef, useState } from 'react'
import { Inbox, RefreshCw, X } from 'lucide-react'
import { formatDateTime } from '../../utils/date.js'

export const MeetingChangeRequestInbox = ({
  items,
  status,
  error,
  onRefresh,
  onMarkRead,
  openOnArrival = false,
  onClose,
}) => {
  const dialogRef = useRef(null)
  useEffect(() => {
    if (openOnArrival && !dialogRef.current.open) dialogRef.current.showModal()
  }, [openOnArrival])
  const [readingId, setReadingId] = useState(null)
  const [readError, setReadError] = useState('')
  const unreadCount = items.filter((item) => !item.readAt).length
  const sortedItems = [...items].sort(
    (left, right) =>
      new Date(right.createdAt) - new Date(left.createdAt) || right.id.localeCompare(left.id)
  )
  const markRead = async (requestId) => {
    setReadingId(requestId)
    setReadError('')
    try {
      await onMarkRead(requestId)
    } catch (failure) {
      setReadError(
        failure.response?.data?.error || 'Unable to mark message as read. Please try again.'
      )
    } finally {
      setReadingId(null)
    }
  }
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`Change requests, ${unreadCount} unread messages${status === 'loading' ? ', loading' : status === 'error' ? ', unable to refresh' : ''}`}
        onClick={() => {
          dialogRef.current.showModal()
          if (status !== 'loading') onRefresh?.()
        }}
        className="relative inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3.5 py-2 text-xs font-extrabold text-blue-700 shadow-sm transition hover:bg-blue-50"
      >
        Change requests
        {unreadCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-extrabold text-white ring-2 ring-white motion-safe:animate-pulse"
          >
            {unreadCount}
          </span>
        ) : null}
      </button>
      <dialog
        ref={dialogRef}
        onClose={onClose}
        aria-labelledby="change-inbox-title"
        className="m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-blue-100 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-blue-100 bg-blue-50/60 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="hidden shrink-0 rounded-xl bg-blue-100 p-2.5 text-blue-700 sm:block">
              <Inbox className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="change-inbox-title" className="text-sm font-extrabold text-slate-900">
                Change request inbox
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Attendee messages · Only visible to you as meeting owner
              </p>
              {status === 'ready' ? (
                <span className="mt-2 inline-block rounded-full bg-blue-100 px-2.5 py-1 text-xs font-extrabold text-blue-700">
                  {unreadCount} unread · {items.length} total
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2 self-start">
            <button
              type="button"
              onClick={onRefresh}
              disabled={status === 'loading'}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh
            </button>
            <button
              type="button"
              onClick={() => dialogRef.current.close()}
              aria-label="Close change request inbox"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="max-h-96 space-y-3 overflow-y-auto p-5" aria-live="polite">
          {status === 'loading' ? (
            <p className="text-sm text-slate-500">Loading messages...</p>
          ) : null}
          {status === 'error' ? (
            <p role="alert" className="text-sm text-rose-700">
              {error} Use Refresh to try again.
            </p>
          ) : null}
          {status === 'ready' && items.length === 0 ? (
            <p className="py-5 text-center text-sm text-slate-500">
              No change requests yet. Messages from attendees will appear here.
            </p>
          ) : null}
          {readError ? (
            <p role="alert" className="text-sm text-rose-700">
              {readError}
            </p>
          ) : null}
          {sortedItems.map((request) => (
            <article
              key={request.id}
              className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="break-words text-sm font-extrabold text-slate-800">
                  {request.senderName}
                </p>
                <time dateTime={request.createdAt} className="text-xs text-slate-500">
                  {formatDateTime(request.createdAt)}
                </time>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                {request.message}
              </p>
              <div className="mt-3 flex justify-end">
                {request.readAt ? (
                  <span className="text-xs font-semibold text-slate-500">Read</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => markRead(request.id)}
                    disabled={Boolean(readingId) || status === 'loading'}
                    className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  >
                    {readingId === request.id ? 'Saving...' : 'Mark as read'}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </dialog>
    </>
  )
}
