import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'

type PublicProfile = {
  id: string
  username: string
  full_name: string
  bio: string | null
  school_level: 'secundaria' | 'preparatoria' | 'universidad'
  school_name: string
  gpa: number | null
  gpa_verified: boolean
  accepts_message_requests: boolean
}

type Conversation = {
  conversation_id: string
  other_id: string
}

export function PublicProfilePage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [blockedByMe, setBlockedByMe] = useState(false)
  const [requestState, setRequestState] = useState<'none' | 'outgoing' | 'incoming'>('none')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user || !id) return
    setError('')

    const { data: blockedData } = await supabase.rpc('list_blocked_profiles')
    const blocked = (blockedData ?? []).some((item: { id: string }) => item.id === id)
    setBlockedByMe(blocked)

    if (blocked) {
      const blockedProfile = (blockedData ?? []).find((item: { id: string }) => item.id === id)
      if (blockedProfile) {
        setProfile({
          id: blockedProfile.id,
          username: blockedProfile.username,
          full_name: blockedProfile.full_name,
          bio: null,
          school_level: 'secundaria',
          school_name: '',
          gpa: null,
          gpa_verified: false,
          accepts_message_requests: false,
        })
      }
      setLoading(false)
      return
    }

    const [{ data: profileData, error: profileError }, { data: requestData }, { data: conversations }] = await Promise.all([
      supabase.from('profiles').select('id, username, full_name, bio, school_level, school_name, gpa, gpa_verified, accepts_message_requests').eq('id', id).maybeSingle(),
      supabase.from('chat_requests').select('from_id, to_id, status').eq('status', 'pending').or(`and(from_id.eq.${user.id},to_id.eq.${id}),and(from_id.eq.${id},to_id.eq.${user.id})`),
      supabase.rpc('list_direct_conversations'),
    ])

    if (profileError) setError(profileError.message)
    setProfile((profileData as PublicProfile | null) ?? null)

    const request = requestData?.[0]
    setRequestState(!request ? 'none' : request.from_id === user.id ? 'outgoing' : 'incoming')
    const conversation = ((conversations ?? []) as Conversation[]).find((item) => item.other_id === id)
    setConversationId(conversation?.conversation_id ?? null)
    setLoading(false)
  }, [id, user])

  useEffect(() => {
    void load()
  }, [load])

  async function sendRequest() {
    if (!user || !id) return
    setError('')
    const { error: requestError } = await supabase.from('chat_requests').insert({ from_id: user.id, to_id: id })
    if (requestError) setError(requestError.message)
    else setRequestState('outgoing')
  }

  async function block() {
    if (!user || !id) return
    if (!window.confirm(`¿Bloquear a @${profile?.username ?? 'este usuario'}?`)) return
    const { error: blockError } = await supabase.from('blocks').insert({ blocker_id: user.id, blocked_id: id })
    if (blockError && blockError.code !== '23505') setError(blockError.message)
    else setBlockedByMe(true)
  }

  async function unblock() {
    if (!user || !id) return
    const { error: unblockError } = await supabase.from('blocks').delete().eq('blocker_id', user.id).eq('blocked_id', id)
    if (unblockError) setError(unblockError.message)
    else {
      setBlockedByMe(false)
      setLoading(true)
      await load()
    }
  }

  if (!user || !id) return null
  if (id === user.id) return <div className="mx-auto max-w-xl py-12 text-center"><p className="text-[var(--nexus-muted)]">Este es tu perfil.</p><Link to="/profile" className="mt-4 inline-block font-bold text-[var(--nexus-coral)]">Ir a editar mi perfil</Link></div>
  if (loading) return <div className="py-12 text-center text-sm text-[var(--nexus-muted)]">Cargando perfil...</div>

  if (blockedByMe) {
    return (
      <section className="mx-auto max-w-2xl rounded-3xl border border-[var(--nexus-line)] bg-white p-8 text-center">
        <h1 className="font-display text-3xl font-bold text-[var(--nexus-navy)]">{profile?.full_name ?? 'Usuario bloqueado'}</h1>
        <p className="mt-2 text-[var(--nexus-muted)]">@{profile?.username ?? 'perfil'}</p>
        <p className="mt-6 text-sm text-[var(--nexus-muted)]">Has bloqueado a este usuario. No puede interactuar contigo mientras el bloqueo esté activo.</p>
        <button onClick={() => void unblock()} className="mt-6 rounded-xl bg-[var(--nexus-navy)] px-5 py-3 font-bold text-white">Desbloquear</button>
      </section>
    )
  }

  if (!profile) {
    return <div className="mx-auto max-w-xl py-12 text-center"><h1 className="font-display text-3xl font-bold text-[var(--nexus-navy)]">Perfil no disponible</h1><p className="mt-3 text-[var(--nexus-muted)]">Puede estar fuera de tu rango de interacción, bloqueado o no disponible.</p></div>
  }

  return (
    <section className="mx-auto max-w-2xl">
      <article className="rounded-3xl border border-[var(--nexus-line)] bg-white p-7 shadow-xl shadow-slate-200/50">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="grid h-16 w-16 place-items-center rounded-full bg-[var(--nexus-mist)] font-display text-2xl font-bold text-[var(--nexus-navy)]">{profile.full_name.charAt(0).toUpperCase()}</div>
            <h1 className="mt-4 font-display text-3xl font-bold text-[var(--nexus-navy)]">{profile.full_name}</h1>
            <p className="text-[var(--nexus-muted)]">@{profile.username}</p>
          </div>
          <button onClick={() => void block()} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50">Bloquear</button>
        </div>

        {profile.bio && <p className="mt-6 leading-7 text-[var(--nexus-ink)]">{profile.bio}</p>}
        <div className="mt-6 grid gap-3 rounded-2xl bg-[var(--nexus-paper)] p-5 text-sm sm:grid-cols-2">
          <div><span className="font-bold text-[var(--nexus-navy)]">Nivel</span><p className="capitalize text-[var(--nexus-muted)]">{profile.school_level}</p></div>
          <div><span className="font-bold text-[var(--nexus-navy)]">Escuela</span><p className="text-[var(--nexus-muted)]">{profile.school_name}</p></div>
          {profile.gpa !== null && <div><span className="font-bold text-[var(--nexus-navy)]">Promedio</span><p className="text-[var(--nexus-muted)]">{profile.gpa}{profile.gpa_verified ? ' · verificado' : ''}</p></div>}
        </div>

        <div className="mt-6">
          {conversationId ? (
            <button onClick={() => navigate(`/messages?conversation=${conversationId}`)} className="w-full rounded-xl bg-[var(--nexus-coral)] px-5 py-3 font-bold text-white">Abrir chat</button>
          ) : requestState === 'outgoing' ? (
            <div className="rounded-xl bg-[var(--nexus-mist)] p-4 text-center text-sm font-semibold text-[var(--nexus-muted)]">Solicitud de chat enviada</div>
          ) : requestState === 'incoming' ? (
            <button onClick={() => navigate('/messages')} className="w-full rounded-xl bg-[var(--nexus-navy)] px-5 py-3 font-bold text-white">Tienes una solicitud · responder</button>
          ) : profile.accepts_message_requests ? (
            <button onClick={() => void sendRequest()} className="w-full rounded-xl bg-[var(--nexus-coral)] px-5 py-3 font-bold text-white">Enviar solicitud de chat</button>
          ) : (
            <div className="rounded-xl bg-[var(--nexus-paper)] p-4 text-center text-sm font-semibold text-[var(--nexus-muted)]">No recibe solicitudes de mensaje</div>
          )}
        </div>

        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </article>
    </section>
  )
}
