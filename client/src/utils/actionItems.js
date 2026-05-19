export const isOverdueActionItem = (item) => {
  if (typeof item?.isOverdue === 'boolean') {
    return item.isOverdue
  }

  if (!item?.dueDate) {
    return false
  }

  if (!['todo', 'in_progress', 'blocked'].includes(item.status)) {
    return false
  }

  return new Date(item.dueDate).getTime() < Date.now()
}
