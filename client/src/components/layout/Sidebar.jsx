import { menuItems } from '../../constants/navigation.js'

export const Sidebar = ({ activePage, onSelect, onLogout, currentUser, notificationCount }) => (
  <aside className="w-full bg-slate-900 text-white lg:w-72">
    <div className="flex h-full flex-col px-5 py-6">
      <div className="mb-8 flex items-center gap-3">
        <img src="/logo.png" alt="Meeting Manager logo" className="h-8 w-auto" />
        <span className="text-2xl font-semibold">Meeting Manager</span>
      </div>
      <nav className="space-y-1.5">
        {menuItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xl transition ${
              activePage === item.id ? 'bg-slate-800' : 'hover:bg-slate-800/70'
            }`}
          >
            <span>{item.label}</span>
            {item.id === 'notifications' && notificationCount > 0 ? (
              <span className="min-w-6 rounded-full bg-rose-600 px-2 py-0.5 text-center text-xs font-semibold text-white">
                {notificationCount}
              </span>
            ) : null}
          </button>
        ))}
      </nav>
      <div className="mt-auto pt-8">
        <p className="mb-3 text-xs text-slate-300">Signed in as {currentUser.name}</p>
        <button
          type="button"
          onClick={onLogout}
          className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200"
        >
          Log out
        </button>
      </div>
    </div>
  </aside>
)
