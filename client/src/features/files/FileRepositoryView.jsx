import { formatDateOnly } from '../../utils/date.js'

export const FileRepositoryView = ({
  meetings,
  filesByMeeting,
  currentUserId,
  meetingParticipantsByMeeting,
  search,
  onSearch,
  selectedMeetingIds,
  onToggleMeetingSelection,
  onUploadFile,
  onDownloadFile,
  onOpenProjectFilesPage,
}) => {
  const documents = meetings.flatMap((meeting) =>
    (filesByMeeting[meeting.id] || []).map((file) => ({ ...file, meetingTitle: meeting.title, tag: meeting.tag }))
  )

  const filteredDocuments = documents.filter((file) =>
    file.fileName.toLowerCase().includes(search.trim().toLowerCase())
  )
  const involvedMeetings = meetings.filter((meeting) => {
    if (meeting.createdBy === currentUserId) {
      return true
    }

    const participantNames = meetingParticipantsByMeeting[meeting.id] || []
    return participantNames.length > 0
  })
  return (
    <section>
      <h1 className="text-5xl font-semibold text-slate-800">File Repository</h1>
      <p className="mt-2 text-lg text-slate-500">Manage and access all your meeting documents</p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search meeting..."
            className="h-9 min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 text-sm"
          />
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 p-3">
          <p className="text-sm font-semibold text-slate-700">Upload to meetings (select one or more)</p>
          <div className="mt-2 grid max-h-40 gap-2 overflow-auto md:grid-cols-2">
            {meetings.map((meeting) => (
              <label key={meeting.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={selectedMeetingIds.includes(meeting.id)}
                  onChange={() => onToggleMeetingSelection(meeting.id)}
                />
                <span>{meeting.title}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="mt-3 block rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
          <div className="mx-auto mb-1 text-base">⇪</div>
          Drag & drop files here or browse
          <div className="text-xs text-slate-400">Upload meeting documents, agenda, or minutes</div>
          <input type="file" multiple className="mt-2 w-full text-xs" onChange={(e) => onUploadFile(e.target.files)} />
        </label>
      </div>

      <div className="mt-5">
        <h2 className="mb-3 text-lg font-semibold text-slate-700">Projects</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {involvedMeetings.map((meeting) => (
            <button
              type="button"
              key={meeting.id}
              onClick={() => onOpenProjectFilesPage(meeting.id)}
              className="rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:shadow-sm"
            >
              <div className="mb-2 flex items-center gap-2">
                <img src="/foldericon.png" alt="Folder" className="h-5 w-5 object-contain" />
                <p className="truncate text-sm font-semibold text-slate-700">{meeting.title}</p>
              </div>
              <p className="text-xs text-slate-500">{(filesByMeeting[meeting.id] || []).length} files</p>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-700">All Documents</h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {filteredDocuments.length} files
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          {filteredDocuments.map((file) => (
            <article
              key={file.id}
              className="group flex min-h-[11rem] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="mb-2 flex h-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg">
                📄
              </div>
              <div className="min-w-0 shrink rounded-lg border border-slate-200 bg-white/80 p-2">
                <p className="truncate text-left text-sm font-semibold leading-5 text-slate-800" title={file.fileName}>
                  {file.fileName}
                </p>
                <div className="mt-1.5 space-y-1">
                  <p className="truncate text-[11px] leading-4 text-slate-500">{formatDateOnly(file.createdAt)}</p>
                  <p className="truncate text-[11px] leading-4 text-slate-400" title={file.meetingTitle}>
                    {file.meetingTitle}
                  </p>
                </div>
              </div>
              <div className="mt-2">
                <span className="inline-flex max-w-full truncate rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600 align-middle">
                  {file.tag || '-'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onDownloadFile(file.id)}
                className="mt-auto w-full shrink-0 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Download
              </button>
            </article>
          ))}
          {filteredDocuments.length === 0 ? (
            <p className="text-sm text-slate-500">No files uploaded yet</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
