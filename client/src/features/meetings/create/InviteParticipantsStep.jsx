import { ChevronDown, Plus, Trash2 } from 'lucide-react'

export const InviteParticipantsStep = ({
  users,
  invitees,
  selectedUserId,
  manualEmail,
  onSelectedUserChange,
  onManualEmailChange,
  onAddUser,
  onAddEmail,
  onRemoveInvitee,
}) => (
  <div className="mx-auto w-full max-w-xl space-y-4">
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h4 className="text-sm font-bold text-slate-800">Add existing user</h4>
      <div className="relative mt-3">
        <select
          value={selectedUserId}
          onChange={(event) => {
            onSelectedUserChange(event.target.value)
            onAddUser(event.target.value)
          }}
          className="h-11 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-11 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        >
          <option value="">Select user to add</option>
          {users
            .filter((user) => !invitees.some((invitee) => invitee.email === user.email))
            .map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} - {user.email}
              </option>
            ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"
          aria-hidden="true"
        />
      </div>

      <h4 className="mt-5 text-sm font-bold text-slate-800">Invite by email</h4>
      <div className="mt-3 flex gap-2">
        <input
          type="email"
          value={manualEmail}
          onChange={(event) => onManualEmailChange(event.target.value)}
          placeholder="person@example.com"
          className="h-11 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm"
        />
        <button
          type="button"
          onClick={onAddEmail}
          className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add
        </button>
      </div>
    </div>

    <div>
      <h4 className="text-sm font-bold text-slate-800">Invite list</h4>
      <div className="mt-3 space-y-2">
        {invitees.map((invitee) => (
          <div
            key={invitee.email}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2"
          >
            <div>
              <p className="text-sm font-bold text-slate-800">{invitee.name || invitee.email}</p>
              <p className="text-xs text-slate-500">{invitee.email}</p>
            </div>
            <button
              type="button"
              onClick={() => onRemoveInvitee(invitee.email)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Remove
            </button>
          </div>
        ))}
        {invitees.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
            No invitees yet.
          </div>
        ) : null}
      </div>
    </div>
  </div>
)
