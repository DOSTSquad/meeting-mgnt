export const isOverdueActionItem = (item) => {
  if (!item?.dueDate) {
    return false
  }

  if (!['todo', 'in_progress'].includes(item.status)) {
    return false
  }

  return new Date(item.dueDate).getTime() < Date.now()
}
