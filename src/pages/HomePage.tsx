import { isSupabaseConfigured } from '../lib/supabase'

export function HomePage() {
  return (
    <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <div className="animate-rise">
        <p className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-[var(--nexus-coral)]">Fase 1 · Base lista</p>
        <h1 className="max-w-3xl font-display text-5xl font-bold leading-[0.95] tracking-tight text-[var(--nexus-navy)] sm:text-7xl">
          Un lugar para encontrar tu gente.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--nexus-muted)]">
          Nexus conecta estudiantes con intereses, proyectos y conversaciones que tienen sentido.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="/profile" className="rounded-full bg-[var(--nexus-coral)] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-orange-200 transition hover:-translate-y-0.5 hover:bg-[#d95a42]">
            Explorar mi perfil
          </a>
          <a href="/discover" className="rounded-full border border-[var(--nexus-line)] bg-white px-5 py-3 text-sm font-bold text-[var(--nexus-navy)] transition hover:border-[var(--nexus-navy)]">
            Descubrir personas
          </a>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[2rem] bg-[var(--nexus-navy)] p-7 text-white shadow-2xl shadow-slate-300 animate-rise-delayed">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full border-[24px] border-[var(--nexus-gold)]/80" />
        <div className="relative">
          <p className="text-sm font-semibold text-[var(--nexus-gold)]">Estado del espacio</p>
          <h2 className="mt-10 font-display text-3xl font-bold">La base está preparada.</h2>
          <div className="mt-8 space-y-3 text-sm text-slate-200">
            <Status label="Frontend Vite + React + TypeScript" done />
            <Status label="Navegación mobile first" done />
            <Status label="Cliente Supabase" done={isSupabaseConfigured} />
          </div>
        </div>
      </div>
    </section>
  )
}

function Status({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-3 border-t border-white/15 pt-3">
      <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${done ? 'bg-[var(--nexus-gold)] text-[var(--nexus-navy)]' : 'bg-white/15 text-white'}`}>
        {done ? '✓' : '·'}
      </span>
      <span>{label}</span>
    </div>
  )
}