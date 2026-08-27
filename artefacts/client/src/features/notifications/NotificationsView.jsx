import { formatDateTime } from '../../utils/date.js'

export const NotificationsView = ({ notifications }) => {
  const meetingCreated = notifications.filter((item) => item.type === 'meeting_created')
  const taskAssigned = notifications.filter((item) => item.type === 'task_assigned')

  const renderItems = (items) =>
    items.length === 0 ? (
      <p className="text-sm text-slate-500">No new notifications.</p>
    ) : (
      items.map((notification) => (
        <article
          key={`${notification.type}-${notification.meetingId}-${notification.actionItemId || ''}`}
          className="rounded-xl border border-slate-200 p-4"
        >
          <p className="mt-1 text-base font-semibold text-slate-700">{notification.title}</p>
          <p className="mt-1 text-sm text-slate-500">{notification.detail}</p>
          <p className="mt-2 text-xs text-slate-500">{formatDateTime(notification.eventAt)}</p>
        </article>
      ))
    )

  return (
    <section>
      <h1 className="text-5xl font-semibold text-slate-800">Notifications</h1>
      <p className="mt-2 text-lg text-slate-500">
        Stay updated with your meetings and action items
      </p>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-700">Meeting Created</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {meetingCreated.length}
            </span>
          </div>
          <div className="space-y-3">{renderItems(meetingCreated)}</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-700">Task Assigned</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {taskAssigned.length}
            </span>
          </div>
          <div className="space-y-3">{renderItems(taskAssigned)}</div>
        </div>
      </div>
    </section>
  )
}
