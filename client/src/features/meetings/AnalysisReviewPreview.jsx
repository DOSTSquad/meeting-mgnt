const STATUS_CLASS = {
  proposed: 'bg-slate-100 text-slate-500',
  accepted: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-slate-100 text-slate-400',
  // Accepted, then the action item it created was deleted. Terminal, so it reads
  // like rejected rather than like a proposal still awaiting a decision.
  withdrawn: 'bg-slate-100 text-slate-400',
}

const PRIORITY_CLASS = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-rose-50 text-rose-700',
}

const formatTimestamp = (seconds) => {
  if (typeof seconds !== 'number') {
    return null
  }

  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)

  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

const Evidence = ({ evidence }) => {
  if (!evidence?.length) {
    return null
  }

  return (
    <ul className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3">
      {evidence.map((item) => (
        <li key={item.segmentIndex} className="text-xs text-slate-500">
          {formatTimestamp(item.startSeconds) ? (
            <span className="mr-2 font-mono text-slate-400">
              {formatTimestamp(item.startSeconds)}
            </span>
          ) : null}
          {item.speaker ? <span className="mr-1 font-semibold">{item.speaker}:</span> : null}
          <span className="italic">{item.text}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Read-only preview of a generated analysis.
 *
 * Nothing here writes. The result stays separate from official minutes and
 * action items until a reviewer explicitly applies it, so every suggestion is
 * labelled as proposed and no control offers to accept one yet.
 */
export const AnalysisReviewPreview = ({
  review,
  canApply = false,
  applyState = { status: 'idle' },
  onApply,
  onDismissApplyState,
  onAcceptSuggestion,
  onRejectSuggestion,
}) => {
  const run = review?.analysisRun

  if (!run || run.status !== 'ready_for_review') {
    return null
  }

  const suggestions = review.suggestions ?? []

  return (
    <section className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/30 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Generated analysis</h3>
          <p className="text-xs text-slate-500">
            {applyState.status === 'applied'
              ? 'Applied to the draft minutes. Review and edit them before approving.'
              : 'Preview only. Nothing has been added to the minutes or action items yet.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-blue-100 bg-white px-2 py-1 text-[11px] font-semibold text-blue-700">
            {run.provider} · {run.model} · prompt {run.promptVersion}
          </span>
          {canApply ? (
            <button
              type="button"
              onClick={onApply}
              disabled={applyState.status === 'applying'}
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {applyState.status === 'applying'
                ? 'Applying...'
                : applyState.status === 'applied'
                  ? 'Apply again'
                  : 'Apply to minutes'}
            </button>
          ) : null}
        </div>
      </header>

      {applyState.status === 'conflict' ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-bold text-amber-900">
            The minutes changed while you were reviewing
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Someone else saved an edit
            {typeof applyState.currentVersion === 'number'
              ? ` (now version ${applyState.currentVersion})`
              : ''}
            , so nothing was overwritten. The minutes above have been refreshed to what is saved.
            Read them, then apply again if you still want the generated content.
          </p>
          <button
            type="button"
            onClick={onDismissApplyState}
            className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-900"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="mt-3 rounded-xl bg-white p-3">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">Summary</h4>
        <p className="mt-1 text-sm text-slate-800">{run.summary}</p>
      </div>

      {run.keyDiscussions?.length ? (
        <div className="mt-3 rounded-xl bg-white p-3">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Key discussions
          </h4>
          <ul className="mt-2 space-y-3">
            {run.keyDiscussions.map((item, index) => (
              <li key={`${item.topic}-${index}`}>
                <p className="text-sm font-semibold text-slate-800">{item.topic}</p>
                <p className="text-sm text-slate-600">{item.detail}</p>
                <Evidence evidence={item.evidence} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {run.decisions?.length ? (
        <div className="mt-3 rounded-xl bg-white p-3">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">Decisions</h4>
          <ul className="mt-2 space-y-3">
            {run.decisions.map((item, index) => (
              <li key={`${item.decision}-${index}`}>
                <p className="text-sm font-semibold text-slate-800">{item.decision}</p>
                {item.rationale ? <p className="text-sm text-slate-600">{item.rationale}</p> : null}
                <Evidence evidence={item.evidence} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {suggestions.length ? (
        <div className="mt-3 rounded-xl bg-white p-3">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Suggested action items
          </h4>
          <ul className="mt-2 space-y-3">
            {suggestions.map((item) => (
              <li key={item.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={`text-sm font-semibold ${
                      item.status === 'rejected' ? 'text-slate-400 line-through' : 'text-slate-800'
                    }`}
                  >
                    {item.title}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      PRIORITY_CLASS[item.priority] || PRIORITY_CLASS.medium
                    }`}
                  >
                    {item.priority}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      STATUS_CLASS[item.status] || STATUS_CLASS.proposed
                    }`}
                  >
                    {item.status}
                  </span>
                  {canApply && item.status === 'proposed' ? (
                    <span className="ml-auto flex gap-2">
                      <button
                        type="button"
                        onClick={() => onAcceptSuggestion?.(item.id)}
                        className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-emerald-700"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => onRejectSuggestion?.(item.id)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 transition hover:border-rose-200 hover:text-rose-700"
                      >
                        Reject
                      </button>
                    </span>
                  ) : null}
                </div>
                {item.description ? (
                  <p className="text-sm text-slate-600">{item.description}</p>
                ) : null}
                <Evidence evidence={item.evidence} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
