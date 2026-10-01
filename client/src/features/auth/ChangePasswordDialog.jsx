import { useEffect, useRef, useState } from 'react'

import {
  getChangePasswordErrorMessage,
  validatePasswordChange,
} from './passwordChangeValidation.js'

const EMPTY_FORM = { currentPassword: '', newPassword: '', confirmPassword: '' }

const inputClass =
  'mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

export const ChangePasswordDialog = ({ onSubmit, onClose }) => {
  const dialogRef = useRef(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    dialogRef.current.showModal()
  }, [])

  const setField = (field) => (event) => setForm({ ...form, [field]: event.target.value })

  const submit = async (event) => {
    event.preventDefault()
    if (status === 'saving') return

    const validationMessage = validatePasswordChange(form)
    if (validationMessage) {
      setError(validationMessage)
      return
    }

    setStatus('saving')
    setError('')
    try {
      await onSubmit({ currentPassword: form.currentPassword, newPassword: form.newPassword })
      setForm(EMPTY_FORM)
      setStatus('done')
    } catch (failure) {
      setError(getChangePasswordErrorMessage(failure))
      setStatus('idle')
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      aria-labelledby="change-password-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-900/40"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 id="change-password-title" className="text-lg font-extrabold">
          Change password
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close change password"
          className="rounded px-2 text-xl text-slate-500 hover:bg-slate-100"
        >
          ×
        </button>
      </div>
      {status === 'done' ? (
        <div className="mt-4 space-y-4">
          <p
            role="status"
            className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700"
          >
            Your password has been changed. Other devices stay signed in until their session
            expires.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="h-10 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Current password
            <input
              type="password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={setField('currentPassword')}
              className={inputClass}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            New password
            <input
              type="password"
              autoComplete="new-password"
              value={form.newPassword}
              onChange={setField('newPassword')}
              className={inputClass}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={setField('confirmPassword')}
              className={inputClass}
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={status === 'saving'}
            className="h-10 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
          >
            {status === 'saving' ? 'Saving...' : 'Change password'}
          </button>
        </form>
      )}
    </dialog>
  )
}
