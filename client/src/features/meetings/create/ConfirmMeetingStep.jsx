import { formatDateTimeInTimeZone } from '../../../utils/timezone.js'

export const ConfirmMeetingStep = ({
  selectedOption,
  location,
  tag,
  tags,
  timezoneName,
  onChange,
}) => (
  <div className="grid gap-4 sm:grid-cols-2">
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 sm:col-span-2">
      <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Selected time</p>
      <p className="mt-1 text-lg font-bold text-slate-900">
        {selectedOption
          ? formatDateTimeInTimeZone(selectedOption.startsAt, timezoneName, {
              dateStyle: 'full',
              timeStyle: 'short',
            })
          : 'No option selected'}
      </p>
    </div>

    <label>
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
        Location / Meeting Link
      </span>
      <input
        value={location}
        onChange={(event) => onChange({ location: event.target.value })}
        className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm"
        placeholder="Room 4.1 or https://teams.microsoft.com/..."
      />
    </label>

    <label>
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Tag</span>
      <input
        list="meeting-tags"
        value={tag}
        onChange={(event) => onChange({ tag: event.target.value })}
        className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm"
        placeholder="Operations"
      />
      <datalist id="meeting-tags">
        {tags.map((item) => (
          <option key={item.id} value={item.name} />
        ))}
      </datalist>
    </label>
  </div>
)
