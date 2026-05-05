import { formatDateOnly, formatDateTime } from '../../utils/date.js'

export const MeetingPreviewModal = ({ detail, isOpen, onClose }) => {
  if (!isOpen || !detail) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4 print:static print:block print:bg-white print:p-0">
      <div className="w-full max-w-4xl rounded-2xl bg-white p-4 shadow-2xl print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <div className="mb-3 flex items-center justify-between print:hidden">
          <h3 className="text-lg font-semibold text-slate-800">Meeting Preview (PDF Style)</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg bg-blue-600 px-3 py-1 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Export PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3 py-1 text-sm"
            >
              Close
            </button>
          </div>
        </div>
        <div className="max-h-[75vh] overflow-auto rounded-xl bg-slate-100 p-5 print:max-h-none print:overflow-visible print:rounded-none print:bg-white print:p-0">
          <article className="mx-auto w-full max-w-[794px] rounded bg-white p-8 shadow print:max-w-none print:rounded-none print:p-0 print:shadow-none">
            <header className="border-b border-slate-200 pb-4">
              <h1 className="text-3xl font-semibold text-slate-900">{detail.meeting.title}</h1>
              <p className="mt-2 text-sm text-slate-600">{formatDateTime(detail.meeting.startsAt)}</p>
            </header>

            <section className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date & Time</p>
                <p className="mt-1 text-sm text-slate-800">{formatDateTime(detail.meeting.startsAt)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location</p>
                <p className="mt-1 text-sm text-slate-800">{detail.meeting.location || '-'}</p>
              </div>
            </section>

            <h2 className="mt-6 text-lg font-semibold">Agenda</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{detail.meeting.description || '-'}</p>

            <h2 className="mt-6 text-lg font-semibold">Attendees</h2>
            <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
              {detail.participants.map((participant) => (
                <li key={participant.userId}>{participant.name}</li>
              ))}
              {detail.participants.length === 0 ? <li>No attendees</li> : null}
            </ul>

            <h2 className="mt-6 text-lg font-semibold">Action Items</h2>
            <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
              {detail.actionItems.map((item) => (
                <li key={item.id}>
                  {item.title}
                  {' - '}
                  {detail.participants.find((participant) => participant.userId === item.assigneeId)?.name ||
                    'Unassigned'}
                  {' - '}
                  {item.dueDate ? formatDateOnly(item.dueDate) : 'No due date'}
                </li>
              ))}
              {detail.actionItems.length === 0 ? <li>No action items</li> : null}
            </ul>
          </article>
        </div>
      </div>
    </div>
  )
}
