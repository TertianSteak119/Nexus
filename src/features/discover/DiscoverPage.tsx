import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'

type ProfileResult = {
  id: string
  username: string
  full_name: string
  avatar_path: string | null
  bio: string | null
  school_level: 'secundaria' | 'preparatoria' | 'universidad'
  gpa: number | null
  gpa_verified: boolean
}

export function DiscoverPage() {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [minGpa, setMinGpa] = useState('')
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [results, setResults] = useState<ProfileResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const runSearch = useCallback(async () => {
    if (!supabase || !user) return
    setLoading(true)
    setError('')
    const { data, error: searchError } = await supabase.rpc('search_profiles', {
      search_text: query || null,
      min_gpa: minGpa ? Number(minGpa) : null,
      verified_only: verifiedOnly,
      result_limit: 30,
      result_offset: 0,
    })
    if (searchError) setError(searchError.message)
    else setResults(data ?? [])
    setLoading(false)
  }, [minGpa, query, user, verifiedOnly])

  useEffect(() => {
    if (user) void runSearch()
  }, [runSearch, user])

  if (!user) return <div className="py-12 text-center text-[var(--nexus-muted)]">Inicia sesión para descubrir perfiles de tu espacio.</div>

  return (
    <section className="mx-auto max-w-5xl">
      <div className="mb-8"><p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--nexus-coral)]">Fase 4 · descubrir</p><h1 className="mt-3 font-display text-4xl font-bold text-[var(--nexus-navy)]">Encuentra intereses en común.</h1></div>
      <form onSubmit={(event) => { event.preventDefault(); void runSearch() }} className="grid gap-4 rounded-2xl border border-[var(--nexus-line)] bg-white p-5 sm:grid-cols-[1fr_160px_auto] sm:items-end">
        <label className="text-sm font-bold text-[var(--nexus-ink)]">Nombre o username<input value={query} onChange={(event) => setQuery(event.target.value)} className="input" placeholder="Busca personas" /></label>
        <label className="text-sm font-bold text-[var(--nexus-ink)]">Promedio mínimo<input value={minGpa} onChange={(event) => setMinGpa(event.target.value)} type="number" min="0" max="10" step="0.1" className="input" placeholder="0 a 10" /></label>
        <div><label className="flex items-center gap-2 text-sm font-semibold text-[var(--nexus-ink)]"><input checked={verifiedOnly} onChange={(event) => setVerifiedOnly(event.target.checked)} type="checkbox" className="h-4 w-4 accent-[var(--nexus-coral)]" />Solo verificados</label><button className="mt-3 w-full rounded-xl bg-[var(--nexus-navy)] px-4 py-3 font-bold text-white">Buscar</button></div>
      </form>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? <p className="py-10 text-center text-sm text-[var(--nexus-muted)]">Buscando...</p> : <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{results.length ? results.map((profile) => <article key={profile.id} className="rounded-2xl border border-[var(--nexus-line)] bg-white p-5"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-full bg-[var(--nexus-mist)] font-display text-lg font-bold text-[var(--nexus-navy)]">{profile.full_name.charAt(0).toUpperCase()}</div><div><h2 className="font-bold text-[var(--nexus-navy)]">{profile.full_name}</h2><p className="text-sm text-[var(--nexus-muted)]">@{profile.username}</p></div></div><p className="mt-4 text-sm text-[var(--nexus-muted)]">{profile.school_level}{profile.gpa_verified ? ' · Promedio verificado' : ''}</p>{profile.bio && <p className="mt-3 text-sm leading-6 text-[var(--nexus-ink)]">{profile.bio}</p>}</article>) : <div className="sm:col-span-2 lg:col-span-3 rounded-2xl border border-dashed border-[var(--nexus-line)] p-8 text-center text-[var(--nexus-muted)]">No encontramos perfiles con esos filtros.</div>}</div>}
    </section>
  )
}