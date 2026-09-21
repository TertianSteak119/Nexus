export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <section className="mx-auto max-w-2xl py-12 text-center">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--nexus-coral)]">Próximamente</p>
      <h1 className="mt-4 font-display text-4xl font-bold text-[var(--nexus-navy)]">{title}</h1>
      <p className="mt-4 text-lg leading-8 text-[var(--nexus-muted)]">{description}</p>
      <div className="mt-10 rounded-2xl border border-dashed border-[var(--nexus-line)] bg-white p-8 text-sm text-[var(--nexus-muted)]">
        Esta vista está reservada para la siguiente fase.
      </div>
    </section>
  )
}