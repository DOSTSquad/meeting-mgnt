import { Check, CheckCircle2, CircleX, Loader2, X } from 'lucide-react'

const PILL_STYLES = {
  processing: {
    label: 'Processing',
    className: 'bg-blue-50 text-blue-700',
    Icon: Loader2,
    spin: true,
  },
  ready: { label: 'Ready', className: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 },
  failed: { label: 'Failed', className: 'bg-rose-50 text-rose-700', Icon: CircleX },
}

const STATE_TEXT = {
  done: 'Completed',
  active: 'In progress',
  pending: 'Not started',
  failed: 'Failed',
}

const CIRCLE_STYLES = {
  done: 'bg-blue-600 text-white',
  active: 'bg-blue-600 text-white',
  pending: 'border-2 border-slate-200 bg-white',
  failed: 'bg-rose-600 text-white',
}

const CONNECTOR_FILL = {
  done: 'w-full bg-blue-600',
  active: 'w-1/3 bg-blue-600',
  pending: 'w-0',
  failed: 'w-0',
}

export const RecordingStatusPill = ({ pill }) => {
  const style = PILL_STYLES[pill]

  if (!style) {
    return null
  }

  const { Icon } = style

  return (
    <span
      role="status"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${style.className}`}
    >
      <Icon className={`h-4 w-4 ${style.spin ? 'animate-spin' : ''}`} aria-hidden="true" />
      {style.label}
    </span>
  )
}

const StepCircle = ({ state }) => (
  <span
    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${CIRCLE_STYLES[state]}`}
  >
    {state === 'done' ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" /> : null}
    {state === 'active' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
    {state === 'failed' ? <X className="h-4 w-4" strokeWidth={3} aria-hidden="true" /> : null}
    {state === 'pending' ? <span className="h-2.5 w-2.5 rounded-full bg-slate-200" /> : null}
  </span>
)

const StepConnector = ({ state }) => (
  <span className="ml-2 h-0.5 flex-1 rounded-full bg-slate-200" aria-hidden="true">
    <span className={`block h-full rounded-full ${CONNECTOR_FILL[state]}`} />
  </span>
)

export const RecordingProgress = ({ steps }) => (
  <div className="relative overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/70 p-4">
    <ol className="grid min-w-[34rem] grid-cols-4 gap-3" aria-label="Recording processing progress">
      {steps.map((step, index) => (
        <li key={step.key} aria-current={step.state === 'active' ? 'step' : undefined}>
          <div className="flex items-center">
            <StepCircle state={step.state} />
            {index < steps.length - 1 ? <StepConnector state={step.state} /> : null}
          </div>
          <p className="mt-2 text-sm font-bold text-slate-900">
            {step.label}
            <span className="sr-only"> - {STATE_TEXT[step.state]}</span>
          </p>
          <p
            className={`mt-0.5 pr-2 text-xs ${
              step.state === 'failed' ? 'font-semibold text-rose-700' : 'text-slate-500'
            }`}
          >
            {step.description}
          </p>
        </li>
      ))}
    </ol>
  </div>
)
