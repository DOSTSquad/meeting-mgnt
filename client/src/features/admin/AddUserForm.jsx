import { useState } from 'react'
import { UserPlus } from 'lucide-react'

import { getCreateUserErrorMessage, validateNewUser } from './newUserValidation.js'

const EMPTY_USER = { name: '', email: '', password: '', role: 'staff' }

const inputClass =
  'mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100'

export const AddUserForm = ({ onCreate }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState(EMPTY_USER)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const setField = (field) => (event) => setDraft({ ...draft, [field]: event.target.value })

  const close = () => {
    setIsOpen(false)
    setDraft(EMPTY_USER)
    setErrorMessage('')
  }

  const submit = async (event) => {
    event.preventDefault()
    const validationMessage = validateNewUser(draft)

    if (validationMessage) {
      setErrorMessage(validationMessage)
      return
    }

    try {
      setIsSubmitting(true)
      setErrorMessage('')
      await onCreate({ ...draft, name: draft.name.trim(), email: draft.email.trim() })
      close()
    } catch (error) {
      setErrorMessage(getCreateUserErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-bold text-violet-700 transition hover:bg-violet-50"
      >
        <UserPlus className="h-4 w-4" aria-hidden="true" />
        Add user
      </button>
    )
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-xl border border-violet-100 bg-violet-50/30 p-4"
    >
      <p className="text-sm font-bold text-slate-700">
        Create an account. The person signs in with this email and initial password.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-600">
          Name
          <input value={draft.name} onChange={setField('name')} className={inputClass} />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Email
          <input
            type="email"
            autoComplete="off"
            value={draft.email}
            onChange={setField('email')}
            className={inputClass}
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Initial password
          <input
            type="password"
            autoComplete="new-password"
            value={draft.password}
            onChange={setField('password')}
            className={inputClass}
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Role
          <select value={draft.role} onChange={setField('role')} className={inputClass}>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </label>
      </div>
      {errorMessage ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Creating...' : 'Create account'}
        </button>
        <button
          type="button"
          onClick={close}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
