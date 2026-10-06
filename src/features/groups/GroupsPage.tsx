import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'

type Group = {
  id: string
  name: string
  description: string | null
  topic: string
  age_space: 'all' | 'teen' | 'adult'
  created_by: string
  created_at: string
}

type Membership = { group_id: string; role: 'owner' | 'member' }

export function GroupsPage() {
  const { user } = useAuth()
  const [groups, setGroups] = useState<Group[]>([])
  const [memberships, setMemberships] = useState<Record<string, Membership>>({})
  const [canCreate, setCanCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [topic, setTopic] = useState('')
  const [ageSpace, setAgeSpace] = useState<'all' | 'teen' | 'adult'>('all')
  const [suggestionName, setSuggestionName] = useState('')
  const [suggestionDescription, setSuggestionDescription] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showSuggestion, setShowSuggestion] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!user) return
      const [groupResult, memberResult, adminResult] = await Promise.all([
        supabase.from('groups').select('id, name, description, topic, age_space, created_by, created_at').order('created_at', { ascending: false }),
        supabase.from('group_members').select('group_id, role').eq('profile_id', user.id),
        supabase.rpc('can_create_groups'),
      ])
      if (groupResult.error || memberResult.error || adminResult.error) {
        setError((groupResult.error ?? memberResult.error ?? adminResult.error)?.message ?? 'No fue posible cargar los grupos.')
      } else {
        setGroups((groupResult.data ?? []) as Group[])
        const next: Record<string, Membership> = {}
        for (const item of (memberResult.data ?? []) as Membership[]) next[item.group_id] = item
        setMemberships(next)
        setCanCreate(Boolean(adminResult.data))
      }
      setLoading(false)
    }
    void load()
  }, [user])

  async function createGroup(event: React.FormEvent) {
    event.preventDefault()
    if (!user || !canCreate || !name.trim() || !topic.trim()) return
    setError('')
    setFeedback('')
    const { data, error: createError } = await supabase
      .from('groups')
      .insert({
        name: name.trim(),
        description: description.trim() || null,
        topic: topic.trim(),
        age_space: ageSpace,
        created_by: user.id,
      })
      .select('id, name, description, topic, age_space, created_by, created_at')
      .single()
    if (createError) {
      setError(createError.message)
      return
    }
    setGroups((current) => [data as Group, ...current])
    setMemberships((current) => ({ ...current, [data.id]: { group_id: data.id, role: 'owner' } }))
    setName('')
    setDescription('')
    setTopic('')
    setAgeSpace('all')
    setShowCreate(false)
    setFeedback('Grupo creado.')
  }

  async function joinGroup(groupId: string) {
    if (!user) return
    setError('')
    const { error: joinError } = await supabase.from('group_members').insert({
      group_id: groupId,
      profile_id: user.id,
      role: 'member',
    })
    if (joinError) {
      setError(joinError.message)
      return
    }
    setMemberships((current) => ({ ...current, [groupId]: { group_id: groupId, role: 'member' } }))
  }

  async function leaveGroup(groupId: string) {
    if (!user) return
    setError('')
    const { error: leaveError } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('profile_id', user.id)
    if (leaveError) {
      setError(leaveError.message)
      return
    }
    setMemberships((current) => {
      const next = { ...current }
      delete next[groupId]
      return next
    })
  }

  async function suggestGroup(event: React.FormEvent) {
    event.preventDefault()
    if (!user || !suggestionName.trim()) return
    setError('')
    setFeedback('')
    const { error: suggestionError } = await supabase.from('group_suggestions').insert({
      suggested_by: user.id,
      group_name: suggestionName.trim(),
      description: suggestionDescription.trim() || null,
    })
    if (suggestionError) {
      setError(suggestionError.message)
      return
    }
    setSuggestionName('')
    setSuggestionDescription('')
    setShowSuggestion(false)
    setFeedback('Sugerencia enviada.')
  }

  return (
    <section className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold text-[var(--nexus-navy)]">Grupos</h1>
          <p className="mt-2 text-sm text-[var(--nexus-muted)]">Encuentra espacios para estudiar, conversar y compartir ideas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowSuggestion((value) => !value)} className="rounded-xl border border-[var(--nexus-line)] bg-white px-4 py-2 text-sm font-bold text-[var(--nexus-navy)]">Sugerir grupo</button>
          {canCreate && <button type="button" onClick={() => setShowCreate((value) => !value)} className="rounded-xl bg-[var(--nexus-coral)] px-4 py-2 text-sm font-bold text-white">Crear grupo</button>}
        </div>
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {feedback && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{feedback}</p>}

      {showCreate && canCreate && (
        <form onSubmit={createGroup} className="mt-6 grid gap-4 rounded-3xl border border-[var(--nexus-line)] bg-white p-6 sm:grid-cols-2">
          <label className="text-sm font-semibold text-[var(--nexus-ink)]">Nombre
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} className="input" placeholder="Nombre del grupo" />
          </label>
          <label className="text-sm font-semibold text-[var(--nexus-ink)]">Tema
            <input value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={80} className="input" placeholder="Ej. Matemáticas" />
          </label>
          <label className="text-sm font-semibold text-[var(--nexus-ink)] sm:col-span-2">Descripción
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1500} className="input min-h-24 resize-y" placeholder="¿De qué trata este grupo?" />
          </label>
          <label className="text-sm font-semibold text-[var(--nexus-ink)]">Acceso
            <select value={ageSpace} onChange={(event) => setAgeSpace(event.target.value as typeof ageSpace)} className="input">
              <option value="all">Todos</option>
              <option value="teen">12 a 17 años</option>
              <option value="adult">18 años o más</option>
            </select>
          </label>
          <div className="flex items-end justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="rounded-xl border border-[var(--nexus-line)] px-4 py-3 text-sm font-bold text-[var(--nexus-muted)]">Cancelar</button>
            <button className="rounded-xl bg-[var(--nexus-coral)] px-4 py-3 text-sm font-bold text-white">Crear</button>
          </div>
        </form>
      )}

      {showSuggestion && (
        <form onSubmit={suggestGroup} className="mt-6 grid gap-4 rounded-3xl border border-[var(--nexus-line)] bg-white p-6">
          <label className="text-sm font-semibold text-[var(--nexus-ink)]">Nombre sugerido
            <input value={suggestionName} onChange={(event) => setSuggestionName(event.target.value)} maxLength={100} className="input" placeholder="¿Qué grupo te gustaría ver?" />
          </label>
          <label className="text-sm font-semibold text-[var(--nexus-ink)]">Descripción
            <textarea value={suggestionDescription} onChange={(event) => setSuggestionDescription(event.target.value)} maxLength={1500} className="input min-h-20 resize-y" placeholder="Cuéntanos la idea." />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowSuggestion(false)} className="rounded-xl border border-[var(--nexus-line)] px-4 py-2 text-sm font-bold text-[var(--nexus-muted)]">Cancelar</button>
            <button className="rounded-xl bg-[var(--nexus-navy)] px-4 py-2 text-sm font-bold text-white">Enviar sugerencia</button>
          </div>
        </form>
      )}

      <div className="mt-7 grid gap-4 md:grid-cols-2">
        {loading ? <p className="text-sm text-[var(--nexus-muted)]">Cargando grupos...</p> : groups.length ? groups.map((group) => {
          const membership = memberships[group.id]
          return (
            <article key={group.id} className="rounded-3xl border border-[var(--nexus-line)] bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="rounded-full bg-[var(--nexus-mist)] px-3 py-1 text-xs font-bold text-[var(--nexus-navy)]">{group.topic}</span>
                  <h2 className="mt-3 font-display text-2xl font-bold text-[var(--nexus-navy)]">{group.name}</h2>
                </div>
                {membership?.role === 'owner' && <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-[var(--nexus-coral)]">Administrador</span>}
              </div>
              {group.description && <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--nexus-muted)]">{group.description}</p>}
              <div className="mt-5 flex flex-wrap gap-2">
                <Link to={`/groups/${group.id}`} className="rounded-xl bg-[var(--nexus-navy)] px-4 py-2 text-sm font-bold text-white">Abrir grupo</Link>
                {!membership && <button type="button" onClick={() => void joinGroup(group.id)} className="rounded-xl border border-[var(--nexus-line)] px-4 py-2 text-sm font-bold text-[var(--nexus-navy)]">Unirme</button>}
                {membership?.role === 'member' && <button type="button" onClick={() => void leaveGroup(group.id)} className="rounded-xl border border-[var(--nexus-line)] px-4 py-2 text-sm font-bold text-[var(--nexus-muted)]">Salir</button>}
              </div>
            </article>
          )
        }) : <p className="rounded-2xl border border-dashed border-[var(--nexus-line)] p-7 text-sm text-[var(--nexus-muted)] md:col-span-2">Todavía no hay grupos disponibles.</p>}
      </div>
    </section>
  )
}
