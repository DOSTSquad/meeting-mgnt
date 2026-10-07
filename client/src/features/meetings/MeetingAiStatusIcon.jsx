import { CircleAlert, Loader2 } from 'lucide-react'

import { getAiStatusLabel } from './aiStatus.js'

const ICON_STYLES = {
  processing: { Icon: Loader2, className: 'h-4 w-4 animate-spin text-blue-600' },
  failed: { Icon: CircleAlert, className: 'h-4 w-4 text-rose-600' },
}

export const MeetingAiStatusIcon = ({ status }) => {
  const label = getAiStatusLabel(status)
  const style = ICON_STYLES[status]

  if (!label || !style) {
    return null
  }

  const { Icon, className } = style

  return (
    <span role="img" aria-label={label} title={label} className="inline-flex shrink-0">
      <Icon className={className} aria-hidden="true" />
    </span>
  )
}
