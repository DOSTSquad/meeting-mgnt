import { useState } from 'react'

import { getApiClient } from '../../lib/apiClient.js'

export const CreateMeetingModal = ({ isOpen, onClose, onCreated, token, users, tags, currentUserId }) => {
  const [form, setForm] = useState({
    title: '',
    location: '',
    date: '',
    time: '',
    agenda: '',
    tag: '',
    attendeeUserIds: [],
    selectedAttendeeUserId: '',
    files: [],
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [tagMode, setTagMode] = useState('existing')
  const [isDragOver, setIsDragOver] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  if (!isOpen) {
    return null
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!form.title.trim() || !form.date || !form.time) {
      setErrorMessage('Meeting title, date, and time are required')
      return
    }

    try {
      setIsSubmitting(true)
      setErrorMessage('')

      const startsAt = new Date(`${form.date}T${form.time}:00`)
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000)

      const client = getApiClient(token)
      const createResponse = await client.post('/api/meetings', {
        title: form.title.trim(),
        location: form.location || null,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        timezoneName: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        description: form.agenda || null,
        tag: form.tag || null,
      })
      const meetingId = createResponse.data?.meeting?.id

      if (meetingId && form.attendeeUserIds.length > 0) {
        await client.post(`/api/meetings/${meetingId}/participants`, {
          userIds: form.attendeeUserIds,
          role: 'attendee',
        })
      }

      if (meetingId && form.files.length > 0) {
        for (const file of form.files) {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('description', 'Uploaded during meeting creation')
          await client.post(`/api/meetings/${meetingId}/files`, formData)
        }
      }

      setForm({
        title: '',
        location: '',
        date: '',
        time: '',
        agenda: '',
        tag: '',
        attendeeUserIds: [],
        selectedAttendeeUserId: '',
        files: [],
      })
      onCreated()
      onClose()
    } catch (error) {
      setErrorMessage(
        error.response?.data?.error || error.response?.data?.message || 'Unable to create meeting'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddNewTag = async () => {
    const tagName = form.tag.trim()
    if (!tagName) {
      setErrorMessage('Please enter a tag name first')
      return
    }

    try {
      setIsAddingTag(true)
      setErrorMessage('')
      const client = getApiClient(token)
      await client.post('/api/tags', { name: tagName })
      await onCreated()
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to add new tag')
    } finally {
      setIsAddingTag(false)
    }
  }

  const addFiles = (incomingFiles) => {
    const nextFiles = Array.from(incomingFiles || [])
    if (nextFiles.length === 0) {
      return
    }

    setForm((prev) => ({
      ...prev,
      files: [...prev.files, ...nextFiles],
    }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-3xl font-semibold text-slate-800">Create New Meeting</h3>
          <button type="button" onClick={onClose} className="text-2xl text-slate-500">
            ×
          </button>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Meeting Title</span>
            <input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>

          <label>
            <span className="text-sm font-semibold text-slate-700">Location / Online Meeting</span>
            <input
              value={form.location}
              onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>

          <label>
            <span className="text-sm font-semibold text-slate-700">Date</span>
            <input
              type="date"
              value={form.date}
              onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>

          <label>
            <span className="text-sm font-semibold text-slate-700">Time</span>
            <input
              type="time"
              value={form.time}
              onChange={(event) => setForm((prev) => ({ ...prev, time: event.target.value }))}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>

          <label>
            <span className="text-sm font-semibold text-slate-700">Select your tag</span>

            {tagMode === 'existing' ? (
              <select
                value={form.tag}
                onChange={(event) => setForm((prev) => ({ ...prev, tag: event.target.value }))}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3"
              >
                <option value="">Select your tag</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.name}>
                    {tag.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="mt-2 flex gap-2">
                <input
                  value={form.tag}
                  onChange={(event) => setForm((prev) => ({ ...prev, tag: event.target.value }))}
                  placeholder="Enter new tag"
                  className="h-11 w-full rounded-xl border border-slate-200 px-3"
                />
                <button
                  type="button"
                  onClick={handleAddNewTag}
                  disabled={isAddingTag}
                  className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-700"
                >
                  {isAddingTag ? 'Adding...' : 'Add'}
                </button>
              </div>
            )}

            <div className="mt-3 flex items-center gap-4 text-xs text-slate-600">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="tag-mode"
                  checked={tagMode === 'existing'}
                  onChange={() => {
                    setTagMode('existing')
                    setForm((prev) => ({ ...prev, tag: '' }))
                  }}
                />
                Use existing tag
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="tag-mode"
                  checked={tagMode === 'new'}
                  onChange={() => {
                    setTagMode('new')
                    setForm((prev) => ({ ...prev, tag: '' }))
                  }}
                />
                Create new tag
              </label>
            </div>
          </label>

          <label className="sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Agenda & Notes</span>
            <textarea
              rows={4}
              value={form.agenda}
              onChange={(event) => setForm((prev) => ({ ...prev, agenda: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </label>

          <div className="rounded-xl border border-slate-200 p-4 sm:col-span-1">
            <span className="text-sm font-semibold text-slate-700">Attendees</span>
            <div className="mt-2 flex gap-2">
              <select
                value={form.selectedAttendeeUserId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, selectedAttendeeUserId: event.target.value }))
                }
                className="h-11 flex-1 rounded-xl border border-slate-200 px-3"
              >
                <option value="">Select user</option>
                {users
                  .filter((user) => user.id !== currentUserId)
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  if (!form.selectedAttendeeUserId) return
                  setForm((prev) => ({
                    ...prev,
                    attendeeUserIds: prev.attendeeUserIds.includes(prev.selectedAttendeeUserId)
                      ? prev.attendeeUserIds
                      : [...prev.attendeeUserIds, prev.selectedAttendeeUserId],
                    selectedAttendeeUserId: '',
                  }))
                }}
                className="rounded-xl border border-slate-200 px-3"
              >
                Add
              </button>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {form.attendeeUserIds.map((userId) => {
                const user = users.find((item) => item.id === userId)
                if (!user) return null

                return (
                  <li key={userId} className="flex items-center justify-between">
                    <span>{user.name}</span>
                    <button
                      type="button"
                      className="text-xs text-rose-600"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          attendeeUserIds: prev.attendeeUserIds.filter((id) => id !== userId),
                        }))
                      }
                    >
                      remove
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          <div
            className={`rounded-xl border-2 border-dashed p-5 text-center text-sm sm:col-span-1 ${
              isDragOver ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'
            }`}
            onDragOver={(event) => {
              event.preventDefault()
              setIsDragOver(true)
            }}
            onDragLeave={(event) => {
              event.preventDefault()
              setIsDragOver(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setIsDragOver(false)
              addFiles(event.dataTransfer?.files)
            }}
          >
            <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-300">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 16V4" />
                <path d="m7 9 5-5 5 5" />
                <path d="M20 16.5v2A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-2" />
              </svg>
            </div>
            Drag & drop files here or click to browse
            <input
              type="file"
              multiple
              className="mt-3 w-full text-sm"
              onChange={(event) => addFiles(event.target.files)}
            />
            <ul className="mt-3 space-y-1 text-left text-xs text-slate-600">
              {form.files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center justify-between">
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    className="ml-2 text-rose-600"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        files: prev.files.filter((_, fileIndex) => fileIndex !== index),
                      }))
                    }
                  >
                    remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {errorMessage ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2">
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
          >
            {isSubmitting ? 'Creating...' : 'Create Meeting'}
          </button>
        </div>
      </form>
    </div>
  )
}
