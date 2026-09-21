import { NavLink, Outlet } from 'react-router-dom'

const navigation = [
  { to: '/', label: 'Inicio', icon: '⌂' },
  { to: '/discover', label: 'Descubrir', icon: '⌕' },
  { to: '/messages', label: 'Mensajes', icon: '✉' },
  { to: '/profile', label: 'Perfil', icon: '○' },
]

export function AppShell() {
  return (
    <div className="min-h-screen bg-[var(--nexus-paper)] text-[var(--nexus-ink)]">
      <header className="border-b border-[var(--nexus-line)] bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <NavLink to="/" className="font-display text-2xl font-bold tracking-tight text-[var(--nexus-navy)]">
            nexus<span className="text-[var(--nexus-coral)]">.</span>
          </NavLink>
          <span className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-[var(--nexus-muted)] sm:block">
            tu espacio, tu ritmo
          </span>
        </div>
      </header>

      <main className="mx-auto min-h-[calc(100vh-145px)] max-w-6xl px-5 pb-24 pt-8 sm:pb-10">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--nexus-line)] bg-white/95 px-3 py-2 backdrop-blur sm:static sm:border-t-0 sm:bg-transparent sm:px-5 sm:py-0">
        <div className="mx-auto flex max-w-6xl justify-around sm:justify-start sm:gap-2">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex min-w-16 flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition sm:flex-row sm:gap-2 sm:px-4 ${
                  isActive ? 'bg-[var(--nexus-navy)] text-white' : 'text-[var(--nexus-muted)] hover:bg-[var(--nexus-mist)]'
                }`
              }
            >
              <span aria-hidden="true" className="text-lg leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}