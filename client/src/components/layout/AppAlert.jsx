import { useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'

const alertStyles = {
  error: {
    icon: 'text-rose-600',
    panel: 'border-rose-200 bg-rose-50 text-rose-900 shadow-rose-950/10',
    text: 'text-rose-800',
    button: 'text-rose-700 hover:bg-rose-100 hover:text-rose-900 focus:ring-rose-500',
  },
  warning: {
    icon: 'text-amber-600',
    panel: 'border-amber-200 bg-amber-50 text-amber-900 shadow-amber-950/10',
    text: 'text-amber-800',
    button: 'text-amber-700 hover:bg-amber-100 hover:text-amber-900 focus:ring-amber-500',
  },
}

export const AppAlert = ({ message, tone = 'error', autoDismissMs = 5000, onDismiss }) => {
  useEffect(() => {
    if (!message || !autoDismissMs) {
      return undefined
    }

    const timerId = window.setTimeout(onDismiss, autoDismissMs)

    return () => window.clearTimeout(timerId)
  }, [autoDismissMs, message, onDismiss])

  if (!message) {
    return null
  }

  const styles = alertStyles[tone] ?? alertStyles.error
  const title = tone === 'warning' ? 'Warning' : 'Error'

  return (
    <div
      className="fixed inset-x-4 top-4 z-50 sm:left-auto sm:right-6 sm:top-6 sm:max-w-md"
      role="alert"
      aria-live="assertive"
    >
      <div className={`flex gap-3 rounded-lg border p-4 shadow-2xl ${styles.panel}`}>
        <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${styles.icon}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{title}</p>
          <p className={`mt-1 text-sm leading-5 ${styles.text}`}>{message}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${styles.button}`}
          aria-label={`Dismiss ${title.toLowerCase()} message`}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
