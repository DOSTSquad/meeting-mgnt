const accentStyles = {
  blue: {
    glow: 'from-blue-500/10 via-sky-400/5 to-transparent',
    icon: 'bg-blue-600 text-white shadow-blue-200',
    eyebrow: 'text-blue-700',
  },
  violet: {
    glow: 'from-violet-500/10 via-fuchsia-400/5 to-transparent',
    icon: 'bg-violet-600 text-white shadow-violet-200',
    eyebrow: 'text-violet-700',
  },
  emerald: {
    glow: 'from-emerald-500/10 via-teal-400/5 to-transparent',
    icon: 'bg-emerald-600 text-white shadow-emerald-200',
    eyebrow: 'text-emerald-700',
  },
}

export const PageHeader = ({
  title,
  description,
  eyebrow,
  icon: Icon,
  accent = 'blue',
  action,
}) => {
  const styles = accentStyles[accent] || accentStyles.blue

  return (
    <header className="relative overflow-hidden rounded-2xl border border-white/90 bg-gradient-to-r from-white via-white to-blue-50/80 px-5 py-5 shadow-sm shadow-blue-100/70 ring-1 ring-blue-100/60 sm:px-7 sm:py-6">
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-lg ${styles.icon}`}
          >
            {Icon ? <Icon className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" /> : null}
          </span>
          <div className="min-w-0">
            <p
              className={`text-[10px] font-extrabold uppercase tracking-[0.2em] ${styles.eyebrow}`}
            >
              {eyebrow}
            </p>
            <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-[1.9rem]">
              {title}
            </h1>
            <p className="mt-1 text-sm font-medium text-slate-500">{description}</p>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  )
}
