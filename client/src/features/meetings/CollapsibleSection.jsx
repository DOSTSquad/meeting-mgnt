/**
 * Shared shell for the collapsible panels inside the recording card.
 *
 * Transcript and generated analysis sit next to each other, so they share one
 * header layout: disclosure marker on the left, title, then a muted count. Only
 * the accent differs — the analysis is a proposal awaiting review, the
 * transcript is source material — and `tone` carries that difference alone.
 *
 * `actions` and `notice` render outside the toggle. Controls, and warnings a
 * reviewer must see before acting, belong there rather than inside the collapsed
 * body: a banner nobody can see is worse than a taller card.
 */
const TONE_CLASS = {
  neutral: 'border-slate-200 bg-white',
  accent: 'border-blue-100 bg-blue-50/30',
}

export const CollapsibleSection = ({
  isOpen,
  onToggle,
  title,
  meta,
  description,
  actions,
  notice,
  tone = 'neutral',
  children,
}) => (
  <section className={`mt-3 rounded-2xl border p-4 ${TONE_CLASS[tone] ?? TONE_CLASS.neutral}`}>
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className="flex items-center gap-2 text-sm font-bold text-slate-900 transition hover:text-blue-700"
        >
          <span aria-hidden="true" className="w-3 text-slate-400">
            {isOpen ? '−' : '+'}
          </span>
          {title}
          {meta ? <span className="font-medium text-slate-400">{meta}</span> : null}
        </button>
        {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>

    {notice}
    {isOpen ? children : null}
  </section>
)
