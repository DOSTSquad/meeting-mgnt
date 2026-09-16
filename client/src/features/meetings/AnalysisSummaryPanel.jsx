import { useState } from 'react'

import { CollapsibleSection } from './CollapsibleSection.jsx'

export const AnalysisSummaryPanel = ({
  review,
  canApply = false,
  applyState = { status: 'idle' },
  onApply,
  onDismissApplyState,
}) => {
  const [isOpen, setIsOpen] = useState(true)
  const run = review?.analysisRun

  if (!run || run.status !== 'ready_for_review') {
    return null
  }

  return (
    <CollapsibleSection
      tone="accent"
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
      title="Summary"
      description="AI-generated meeting summary. Review it before applying it to the minutes."
      actions={
        canApply ? (
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
        ) : null
      }
      notice={
        applyState.status === 'conflict' ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-bold text-amber-900">
              The minutes changed while you were reviewing
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Nothing was overwritten. Review the latest minutes and apply again if needed.
            </p>
            <button
              type="button"
              onClick={onDismissApplyState}
              className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-900"
            >
              Dismiss
            </button>
          </div>
        ) : applyState.status === 'applied' ? (
          <p className="mt-3 text-xs font-semibold text-emerald-700">
            Summary applied to the draft minutes.
          </p>
        ) : null
      }
    >
      <div className="mt-3 rounded-xl bg-white p-3">
        <p className="text-sm leading-relaxed text-slate-800">{run.summary}</p>
      </div>
    </CollapsibleSection>
  )
}
