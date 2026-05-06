import { FolderKanban, KanbanSquare, LayoutDashboard } from 'lucide-react'

import { menuItems } from '../../constants/navigation.js'

const navIcons = {
  dashboard: LayoutDashboard,
  repository: FolderKanban,
  'action-items': KanbanSquare,
}

export const Sidebar = ({ activePage, onSelect }) => (
  <aside className="w-full bg-slate-950 text-white lg:min-h-screen lg:w-[205px] lg:shrink-0">
    <div className="flex h-full flex-col px-5 py-6">
      <div className="mb-6 flex items-center gap-2">
        <img src="/logo.png" alt="Meeting Manager logo" className="h-8 w-auto" />
        <span className="text-sm font-bold">Meeting Manager</span>
      </div>
      <div className="mb-4 h-px bg-slate-700" />
      <nav className="space-y-2">
        {menuItems.map((item) => {
          const Icon = navIcons[item.id]

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold transition ${
                activePage === item.id
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-300 hover:bg-slate-800/70'
              }`}
            >
              {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  </aside>
)
