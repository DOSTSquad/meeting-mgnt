const OVERDUE_STATUSES = new Set(['todo', 'in_progress', 'blocked'])

export const isOverdueActionItem = ({ dueDate, status }, now = new Date()) => {
  if (!dueDate || !OVERDUE_STATUSES.has(status)) {
    return false
  }

  const due = dueDate instanceof Date ? dueDate : new Date(dueDate)
  const current = now instanceof Date ? now : new Date(now)

  if (Number.isNaN(due.getTime()) || Number.isNaN(current.getTime())) {
    return false
  }

  return due.getTime() < current.getTime()
}

export const getActionItemDueState = (item, now = new Date()) => {
  if (!item?.dueDate) {
    return 'none'
  }

  if (['completed', 'cancelled'].includes(item.status)) {
    return 'closed'
  }

  return isOverdueActionItem(item, now) ? 'overdue' : 'upcoming'
}
