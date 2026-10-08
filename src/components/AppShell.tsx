import { NavLink, Outlet } from 'react-router-dom'

const navigation = [
  { to: '/', label: 'Inicio', icon: '⌂', end: true },
  { to: '/discover', label: 'Descubrir', icon: '⌕' },
  { to: '/messages', label: 'Mensajes', icon: '✉' },
  { to: '/groups', label: 'Grupos', icon: '◫' },
  { to: '/profile', label: 'Perfil', icon: '○' },
]

export function AppShell() {
  return (
    <div className="min-h-screen bg-[var(--nexus-paper)] text-[var(--nexus-ink)]">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-[84px] flex-col border-r border-[var(--nexus-line)] bg-white/95 shadow-sm backdrop-blur sm:w-64">
        <div className="border-b border-[var(--nexus-line)] px-3 py-5 sm:px-6">
          <NavLink
            to="/"
            className="block text-center font-display text-xl font-bold tracking-tight text-[var(--nexus-navy)] sm:text-left sm:text-2xl"
          >
            <span className="sm:hidden">N</span>
            <span className="hidden sm:inline">nexus</span>
          </NavLink>
          <p className="mt-1 hidden text-xs font-semibold uppercase tracking-[0.16em] text-[var(--nexus-muted)] sm:block">
            tu espacio, tu ritmo
          </p>
        </div>

        <nav className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 py-4 sm:px-3">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `group flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-2 py-3 text-xs font-bold transition sm:min-h-0 sm:flex-row sm:justify-start sm:gap-3 sm:px-4 sm:py-3 sm:text-sm ${
                  isActive
                    ? 'bg-[var(--nexus-navy)] text-white shadow-sm'
                    : 'text-[var(--nexus-muted)] hover:bg-[var(--nexus-mist)] hover:text-[var(--nexus-navy)]'
                }`
              }
            >
              <span aria-hidden="true" className="text-xl leading-none sm:w-6 sm:text-center">{item.icon}</span>
              <span className="max-w-full truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-[var(--nexus-line)] px-2 py-4 sm:px-5">
          <p className="hidden text-xs leading-5 text-[var(--nexus-muted)] sm:block">
            Navegación fija de Nexus
          </p>
          <div className="mx-auto h-2 w-2 rounded-full bg-[var(--nexus-coral)] sm:hidden" aria-hidden="true" />
        </div>
      </aside>

      <div className="min-h-screen pl-[84px] sm:pl-64">
        <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
