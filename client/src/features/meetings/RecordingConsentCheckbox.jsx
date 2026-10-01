export const RecordingConsentCheckbox = ({ checked, onChange }) => (
  <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
    />
    <span>
      <span className="font-semibold text-slate-900">
        I confirm every participant has been told about, and agreed to, this recording.
      </span>
      <span className="mt-0.5 block text-xs text-slate-500">
        Required before you can upload a recording. Your confirmation is stored with the recording.
      </span>
    </span>
  </label>
)
