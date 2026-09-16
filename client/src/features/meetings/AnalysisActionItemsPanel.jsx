import { useState } from 'react'

import { CollapsibleSection } from './CollapsibleSection.jsx'

const STATUS_CLASS = {
  proposed: 'bg-slate-100 text-slate-500',
  accepted: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-slate-100 text-slate-400',
}

const PRIORITY_CLASS = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-rose-50 text-rose-700',
}

export const AnalysisActionItemsPanel = ({
  review,
  canReview = false,
  onAcceptSuggestion,
  onRejectSuggestion,
}) => {
  const [isOpen, setIsOpen] = useState(true)
  const run = review?.analysisRun

  if (!run || run.status !== 'ready_for_review') {
    return null
  }

  const items = review.suggestions ?? []

  return (
    <CollapsibleSection
      tone="accent"
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
      title="Action items"
      meta={`${items.length}`}
      description="Tasks explicitly stated in the transcript. Accept an item to add it to Action Items."
    >
      <div className="mt-3 rounded-xl bg-white p-3">
        {items.length ? (
          <ul className="space-y-3">
            {items.map((item) => (
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
                  {canReview && item.status === 'proposed' ? (
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
                  <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No action items found.</p>
        )}
      </div>
    </CollapsibleSection>
  )
}
