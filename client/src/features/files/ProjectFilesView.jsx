import { formatDateOnly } from '../../utils/date.js'

export const ProjectFilesView = ({ meeting, files, onBack, onDownloadFile }) => (
  <section>
    <div className="mb-4 flex items-center justify-between">
      <button
        type="button"
        onClick={onBack}
        className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
      >
        Back
      </button>
    </div>
    <h1 className="text-4xl font-semibold text-slate-800">{meeting?.title || 'Project Files'}</h1>
    <p className="mt-2 text-lg text-slate-500">Files in this meeting</p>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {files.map((file) => (
        <article
          key={file.id}
          className="group flex h-48 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="mb-2 flex h-16 items-center justify-center rounded-xl bg-slate-100 text-2xl">📄</div>
          <p className="truncate text-left text-sm font-semibold text-slate-800" title={file.fileName}>
            {file.fileName}
          </p>
          <p className="mt-1 truncate text-xs text-slate-500">{formatDateOnly(file.createdAt)}</p>
          <p className="mt-1 truncate text-xs text-blue-500">{meeting?.tag || '-'}</p>
          <button
            type="button"
            onClick={() => onDownloadFile(file.id)}
            className="mt-auto rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
          >
            Download
          </button>
        </article>
      ))}
      {files.length === 0 ? <p className="text-sm text-slate-500">No files uploaded yet</p> : null}
    </div>
  </section>
)
