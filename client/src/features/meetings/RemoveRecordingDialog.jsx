import { useEffect, useRef } from 'react'

export const RemoveRecordingDialog = ({ fileName, isRemoving, onConfirm, onClose }) => {
  const dialogRef = useRef(null)
  const cancelButtonRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()
    // showModal() focuses the first control, which is the close button; the safer default is Cancel.
    cancelButtonRef.current.focus()

    return () => dialog.close()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault()
        if (!isRemoving) {
          onClose()
        }
      }}
      aria-labelledby="remove-recording-title"
      aria-describedby="remove-recording-description"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-900/40"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 id="remove-recording-title" className="text-lg font-extrabold">
          Remove recording?
        </h2>
        <button
          type="button"
          onClick={onClose}
          disabled={isRemoving}
          aria-label="Close remove recording"
          className="rounded px-2 text-xl text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ×
        </button>
      </div>
      <p id="remove-recording-description" className="mt-4 text-sm text-slate-600">
        <span className="break-all font-semibold text-slate-900">{fileName}</span> will be removed
        from this meeting, along with its transcript and AI analysis. This cannot be undone.
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <button
          ref={cancelButtonRef}
          type="button"
          onClick={onClose}
          disabled={isRemoving}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isRemoving}
          className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRemoving ? 'Removing...' : 'Remove recording'}
        </button>
      </div>
    </dialog>
  )
}
