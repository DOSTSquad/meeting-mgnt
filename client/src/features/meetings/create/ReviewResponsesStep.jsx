import { formatDateTimeInTimeZone } from '../../../utils/timezone.js'

const formatOption = (option, timezoneName) =>
  formatDateTimeInTimeZone(option.startsAt, timezoneName, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

export const ReviewResponsesStep = ({
  status,
  canConfirm,
  responseDeadlinePassed,
  timeOptions,
  invitees,
  selectedTimeOptionId,
  timezoneName,
  onSelect,
}) => (
  <div className="space-y-4">
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        canConfirm
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-amber-200 bg-amber-50 text-amber-800'
      }`}
    >
      <p className="font-bold">
        {responseDeadlinePassed
          ? 'Response deadline has passed.'
          : status === 'ready_to_confirm'
            ? 'All availability responses are in.'
            : 'Availability request is collecting responses.'}
      </p>
      <p className="mt-1">
        {canConfirm
          ? 'Choose the final time option, then continue to confirm the meeting.'
          : 'This request will stay on the dashboard until participants submit availability.'}
      </p>
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-bold uppercase text-slate-500">Invitees</p>
        <p className="mt-1 text-2xl font-bold text-slate-800">{invitees.length}</p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-bold uppercase text-slate-500">Submitted</p>
        <p className="mt-1 text-2xl font-bold text-slate-800">
          {invitees.filter((invitee) => invitee.responseStatus === 'submitted').length}
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-bold uppercase text-slate-500">Time options</p>
        <p className="mt-1 text-2xl font-bold text-slate-800">{timeOptions.length}</p>
      </div>
    </div>

    <div className="space-y-2">
      {timeOptions.map((option) => (
        <button
          type="button"
          key={option.id}
          onClick={() => onSelect(option.id)}
          className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left ${
            selectedTimeOptionId === option.id
              ? 'border-blue-300 bg-blue-50'
              : 'border-slate-200 bg-white hover:bg-slate-50'
          }`}
        >
          <div>
            <p className="text-sm font-bold text-slate-800">{formatOption(option, timezoneName)}</p>
            <p className="text-xs text-slate-500">
              {option.availableCount} available · {option.unavailableCount} unavailable ·{' '}
              {option.notRespondedCount} pending
            </p>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
            {option.availableCount} yes
          </span>
        </button>
      ))}
    </div>
  </div>
)
