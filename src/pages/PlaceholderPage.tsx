export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <section className="mx-auto max-w-2xl py-12 text-center">
      <h1 className="font-display text-4xl font-bold text-[var(--nexus-navy)]">{title}</h1>
      <p className="mt-4 text-lg leading-8 text-[var(--nexus-muted)]">{description}</p>
    </section>
  )
}
