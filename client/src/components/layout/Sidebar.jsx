import {
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  KanbanSquare,
  LayoutDashboard,
} from 'lucide-react'

import { menuItems } from '../../constants/navigation.js'

const navIcons = {
  dashboard: LayoutDashboard,
  repository: FolderKanban,
  'action-items': KanbanSquare,
}

export const Sidebar = ({ activePage, isCollapsed, onSelect, onToggle }) => (
  <>
    {!isCollapsed ? (
      <button
        type="button"
        className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
        aria-label="Close sidebar"
        onClick={onToggle}
      />
    ) : null}

    <aside
      className={`${
        isCollapsed
          ? 'fixed left-3 top-3 z-40 h-12 w-12 rounded-xl shadow-lg shadow-slate-950/20 lg:sticky lg:bottom-auto lg:left-auto lg:top-0 lg:z-20 lg:h-auto lg:min-h-screen lg:w-16 lg:self-stretch lg:rounded-none lg:shadow-none'
          : 'fixed inset-y-0 left-0 z-40 h-screen w-64 shadow-2xl shadow-slate-950/30 lg:sticky lg:bottom-auto lg:top-0 lg:h-auto lg:min-h-screen lg:w-[240px] lg:self-stretch lg:shadow-none'
      } shrink-0 overflow-y-auto bg-slate-950 text-white transition-all duration-200`}
    >
      <div
        className={`relative flex h-full flex-col ${
          isCollapsed ? 'p-2 lg:px-3 lg:py-6' : 'px-5 py-6'
        }`}
      >
        {isCollapsed ? (
          <button
            type="button"
            onClick={onToggle}
            className="flex h-full w-full items-center justify-center rounded-lg lg:hidden"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <img src="/logo.png" alt="Meeting Manager logo" className="h-8 w-auto" />
          </button>
        ) : null}

        <button
          type="button"
          onClick={onToggle}
          className={`z-10 flex items-center justify-center border border-slate-200 bg-white text-slate-700 shadow-md transition hover:text-blue-700 ${
            isCollapsed
              ? 'absolute -right-2 -top-2 hidden h-6 w-6 rounded-full lg:-right-3 lg:top-14 lg:flex lg:h-7 lg:w-7'
              : 'absolute -right-3 top-14 h-7 w-7 rounded-full'
          }`}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          )}
        </button>

        <div
          className={`flex items-center ${
            isCollapsed ? 'hidden justify-center lg:mb-6 lg:flex' : 'mb-6 gap-2'
          }`}
          title={isCollapsed ? 'Meeting Manager' : undefined}
        >
          <img src="/logo.png" alt="Meeting Manager logo" className="h-8 w-auto" />
          {!isCollapsed ? <span className="text-sm font-bold">Meeting Manager</span> : null}
        </div>
        <div className={`mb-4 h-px bg-slate-700 ${isCollapsed ? 'hidden lg:block' : ''}`} />
        <nav className={`space-y-1.5 ${isCollapsed ? 'hidden lg:block' : ''}`}>
          {menuItems.map((item) => {
            const Icon = navIcons[item.id]

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item)}
                className={`group flex h-11 w-full items-center rounded-xl text-xs font-bold transition-all ${
                  isCollapsed ? 'justify-center px-0' : 'gap-3 px-2 text-left'
                } ${
                  activePage === item.id
                    ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/10'
                    : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
                }`}
                aria-label={item.label}
                title={isCollapsed ? item.label : undefined}
              >
                {Icon ? (
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
                      activePage === item.id
                        ? 'bg-blue-500 text-white shadow-md shadow-blue-950/30'
                        : 'bg-white/[0.04] text-slate-400 group-hover:bg-white/10 group-hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                ) : null}
                {!isCollapsed ? <span>{item.label}</span> : null}
              </button>
            )
          })}
        </nav>
      </div>
    </aside>
  </>
)
