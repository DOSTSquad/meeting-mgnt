import { isOverdueActionItem } from '../../utils/actionItems.js'
import { formatDateOnly } from '../../utils/date.js'

export const ActionItemsView = ({ actionItems, onMoveActionItem }) => {
  const grouped = {
    todo: actionItems.filter((item) => item.status === 'todo'),
    in_progress: actionItems.filter((item) => item.status === 'in_progress'),
    done: actionItems.filter((item) => item.status === 'completed'),
  }

  const columns = [
    { id: 'todo', label: 'To-do' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'done', label: 'Done' },
  ]

  return (
    <section>
      <h1 className="text-5xl font-semibold text-slate-800">Action Items Tracker</h1>
      <p className="mt-2 text-lg text-slate-500">
        Track and manage post-meeting action items across all projects
      </p>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        {columns.map((column) => (
          <div key={column.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-slate-700">{column.label}</h2>
              <span className="rounded-lg bg-slate-200 px-2 py-0.5 text-sm text-slate-600">
                {grouped[column.id].length}
              </span>
            </div>
            <div className="space-y-3">
              {grouped[column.id].map((item) => (
                <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-700">{item.title}</p>
                    {isOverdueActionItem(item) ? (
                      <span className="rounded-md bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                        overdue
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Due: {formatDateOnly(item.dueDate)}</p>
                  <div className="mt-2">
                    {item.status === 'todo' ? (
                      <button
                        type="button"
                        onClick={() => onMoveActionItem(item.id, 'in_progress')}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
                      >
                        Move to In Progress
                      </button>
                    ) : null}
                    {item.status === 'in_progress' ? (
                      <button
                        type="button"
                        onClick={() => onMoveActionItem(item.id, 'completed')}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
                      >
                        Move to Done
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
              {grouped[column.id].length === 0 ? (
                <p className="text-sm text-slate-500">No items</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
