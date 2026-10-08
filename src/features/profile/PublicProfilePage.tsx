import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { ReportButton } from '../moderation/ReportButton'

type PublicProfile = {
  id: string
  username: string
  full_name: string
  avatar_path: string | null
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

type ProfilePost = {
  id: string
  body: string
  created_at: string
}

type LookingForRow = {
  kind: 'friends' | 'projects' | 'study_groups' | 'other'
  other_text: string | null
}

const lookingLabels: Record<LookingForRow['kind'], string> = {
  friends: 'Amigos',
  projects: 'Proyectos',
  study_groups: 'Grupos de estudio',
  other: 'Otro',
}

export function PublicProfilePage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [blockedByMe, setBlockedByMe] = useState(false)
  const [requestState, setRequestState] = useState<'none' | 'outgoing' | 'incoming'>('none')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [interests, setInterests] = useState<string[]>([])
  const [lookingFor, setLookingFor] = useState<string[]>([])
  const [posts, setPosts] = useState<ProfilePost[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const avatarUrl = useMemo(() => {
    if (!profile?.avatar_path) return null
    return supabase.storage.from('avatars').getPublicUrl(profile.avatar_path).data.publicUrl
  }, [profile?.avatar_path])

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
          avatar_path: blockedProfile.avatar_path ?? null,
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

    const [
      { data: profileData, error: profileError },
      { data: requestData },
      { data: conversations },
      { data: interestRows },
      { data: lookingRows },
      { data: postRows },
    ] = await Promise.all([
      supabase.from('profiles').select('id, username, full_name, avatar_path, bio, school_level, school_name, gpa, gpa_verified, accepts_message_requests').eq('id', id).maybeSingle(),
      supabase.from('chat_requests').select('from_id, to_id, status').eq('status', 'pending').or(`and(from_id.eq.${user.id},to_id.eq.${id}),and(from_id.eq.${id},to_id.eq.${user.id})`),
      supabase.rpc('list_direct_conversations'),
      supabase.from('profile_interests').select('interests(name)').eq('profile_id', id),
      supabase.from('profile_looking_for').select('kind, other_text').eq('profile_id', id),
      supabase.from('posts').select('id, body, created_at').eq('author_id', id).order('created_at', { ascending: false }).limit(12),
    ])

    if (profileError) setError(profileError.message)
    setProfile((profileData as PublicProfile | null) ?? null)

    setInterests(
      (interestRows ?? [])
        .map((row: { interests?: { name?: string } | null }) => row.interests?.name)
        .filter((name): name is string => Boolean(name)),
    )

    setLookingFor(
      ((lookingRows ?? []) as LookingForRow[]).map((row) =>
        row.kind === 'other' && row.other_text
          ? `Otro: ${row.other_text}`
          : lookingLabels[row.kind],
      ),
    )

    setPosts((postRows ?? []) as ProfilePost[])

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
      <section className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-[var(--nexus-line)] bg-white shadow-sm">
        <div className="h-32 bg-[linear-gradient(135deg,#173a57_0%,#315d7b_58%,#89aebf_100%)]" />
        <div className="px-7 pb-8 text-center">
          <div className="-mt-12 mx-auto grid h-24 w-24 place-items-center rounded-xl border-4 border-white bg-[var(--nexus-mist)] font-display text-3xl font-bold text-[var(--nexus-navy)] shadow">
            {profile?.full_name?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <h1 className="mt-4 font-display text-3xl font-bold text-[var(--nexus-navy)]">{profile?.full_name ?? 'Usuario bloqueado'}</h1>
          <p className="text-[var(--nexus-muted)]">@{profile?.username ?? 'perfil'}</p>
          <p className="mt-5 text-sm text-[var(--nexus-muted)]">Has bloqueado a este usuario. No puede interactuar contigo mientras el bloqueo esté activo.</p>
          <button onClick={() => void unblock()} className="mt-6 rounded-lg bg-[var(--nexus-navy)] px-5 py-2.5 text-sm font-bold text-white">Desbloquear</button>
        </div>
      </section>
    )
  }

  if (!profile) {
    return <div className="mx-auto max-w-xl py-12 text-center"><h1 className="font-display text-3xl font-bold text-[var(--nexus-navy)]">Perfil no disponible</h1><p className="mt-3 text-[var(--nexus-muted)]">Puede estar fuera de tu rango de interacción, bloqueado o no disponible.</p></div>
  }

  return (
    <section className="mx-auto max-w-5xl">
      <article className="overflow-hidden rounded-2xl border border-[var(--nexus-line)] bg-white shadow-sm">
        <div className="relative h-44 bg-[linear-gradient(125deg,#173a57_0%,#264f6c_42%,#7da1b5_100%)] sm:h-52">
          <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_18%_30%,white_0,transparent_26%),radial-gradient(circle_at_82%_15%,white_0,transparent_18%)]" />
        </div>

        <div className="relative px-5 pb-0 sm:px-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 items-end gap-4">
              <div className="-mt-14 shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-28 w-28 rounded-xl border-4 border-white object-cover shadow-md sm:h-32 sm:w-32" />
                ) : (
                  <div className="grid h-28 w-28 place-items-center rounded-xl border-4 border-white bg-[var(--nexus-mist)] font-display text-4xl font-bold text-[var(--nexus-navy)] shadow-md sm:h-32 sm:w-32">
                    {profile.full_name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="min-w-0 pb-3">
                <h1 className="truncate font-display text-3xl font-bold text-[var(--nexus-navy)]">{profile.full_name}</h1>
                <p className="mt-1 text-sm text-[var(--nexus-muted)]">@{profile.username}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-[var(--nexus-muted)]">
                  <span>🎓 {profile.school_name}</span>
                  <span className="capitalize">📚 {profile.school_level}</span>
                  {profile.gpa !== null && <span>★ Promedio {profile.gpa}{profile.gpa_verified ? ' · verificado' : ''}</span>}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pb-4">
              {conversationId ? (
                <button onClick={() => navigate(`/messages?conversation=${conversationId}`)} className="rounded-lg bg-[#315f8c] px-4 py-2 text-sm font-bold text-white hover:bg-[#274f75]">Mensaje</button>
              ) : requestState === 'outgoing' ? (
                <span className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-bold text-[var(--nexus-muted)]">Solicitud enviada</span>
              ) : requestState === 'incoming' ? (
                <button onClick={() => navigate('/messages')} className="rounded-lg bg-[#315f8c] px-4 py-2 text-sm font-bold text-white">Responder solicitud</button>
              ) : profile.accepts_message_requests ? (
                <button onClick={() => void sendRequest()} className="rounded-lg bg-[#315f8c] px-4 py-2 text-sm font-bold text-white hover:bg-[#274f75]">Enviar solicitud</button>
              ) : (
                <span className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-bold text-[var(--nexus-muted)]">Mensajes cerrados</span>
              )}
              <ReportButton reportedId={profile.id} targetKind="profile" targetId={profile.id} />
              <button onClick={() => void block()} className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50">Bloquear</button>
            </div>
          </div>

          <nav className="mt-1 flex gap-1 overflow-x-auto border-t border-[var(--nexus-line)]">
            <a href="#muro" className="border-b-3 border-[#315f8c] px-4 py-3 text-sm font-bold text-[#315f8c]">Muro</a>
            <a href="#informacion" className="px-4 py-3 text-sm font-bold text-[var(--nexus-muted)] hover:bg-slate-50">Información</a>
            <a href="#intereses" className="px-4 py-3 text-sm font-bold text-[var(--nexus-muted)] hover:bg-slate-50">Intereses</a>
          </nav>
        </div>
      </article>

      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="mt-5 grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <section id="informacion" className="rounded-xl border border-[var(--nexus-line)] bg-white shadow-sm">
            <div className="border-b border-[var(--nexus-line)] px-5 py-3">
              <h2 className="font-display text-lg font-bold text-[var(--nexus-navy)]">Información</h2>
            </div>
            <div className="space-y-4 px-5 py-4 text-sm">
              <InfoRow icon="🎓" label="Estudia en" value={profile.school_name} />
              <InfoRow icon="📚" label="Nivel" value={capitalize(profile.school_level)} />
              {profile.gpa !== null && <InfoRow icon="★" label="Promedio" value={`${profile.gpa}${profile.gpa_verified ? ' · verificado' : ''}`} />}
              <InfoRow icon="💬" label="Solicitudes de mensaje" value={profile.accepts_message_requests ? 'Disponibles' : 'No disponibles'} />
            </div>
          </section>

          {profile.bio && (
            <section className="rounded-xl border border-[var(--nexus-line)] bg-white shadow-sm">
              <div className="border-b border-[var(--nexus-line)] px-5 py-3">
                <h2 className="font-display text-lg font-bold text-[var(--nexus-navy)]">Acerca de</h2>
              </div>
              <p className="whitespace-pre-wrap px-5 py-4 text-sm leading-6 text-[var(--nexus-ink)]">{profile.bio}</p>
            </section>
          )}

          <section id="intereses" className="rounded-xl border border-[var(--nexus-line)] bg-white shadow-sm">
            <div className="border-b border-[var(--nexus-line)] px-5 py-3">
              <h2 className="font-display text-lg font-bold text-[var(--nexus-navy)]">Intereses</h2>
            </div>
            <div className="flex flex-wrap gap-2 px-5 py-4">
              {interests.length ? interests.map((interest) => (
                <span key={interest} className="rounded-full bg-[#edf3f8] px-3 py-1.5 text-xs font-bold text-[#315f8c]">{interest}</span>
              )) : <p className="text-sm text-[var(--nexus-muted)]">Sin intereses visibles.</p>}
            </div>
          </section>

          <section className="rounded-xl border border-[var(--nexus-line)] bg-white shadow-sm">
            <div className="border-b border-[var(--nexus-line)] px-5 py-3">
              <h2 className="font-display text-lg font-bold text-[var(--nexus-navy)]">Busca</h2>
            </div>
            <div className="flex flex-wrap gap-2 px-5 py-4">
              {lookingFor.length ? lookingFor.map((item) => (
                <span key={item} className="rounded-md border border-[var(--nexus-line)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--nexus-muted)]">{item}</span>
              )) : <p className="text-sm text-[var(--nexus-muted)]">Sin preferencias visibles.</p>}
            </div>
          </section>
        </aside>

        <main id="muro" className="space-y-4">
          <section className="rounded-xl border border-[var(--nexus-line)] bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
              ) : (
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--nexus-mist)] font-bold text-[var(--nexus-navy)]">{profile.full_name.charAt(0).toUpperCase()}</div>
              )}
              <div className="flex-1 rounded-lg border border-[var(--nexus-line)] bg-slate-50 px-4 py-3 text-sm text-[var(--nexus-muted)]">
                Muro de {profile.full_name}
              </div>
            </div>
          </section>

          {posts.length ? posts.map((post) => (
            <article key={post.id} className="rounded-xl border border-[var(--nexus-line)] bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-11 w-11 rounded-lg object-cover" />
                ) : (
                  <div className="grid h-11 w-11 place-items-center rounded-lg bg-[var(--nexus-mist)] font-bold text-[var(--nexus-navy)]">{profile.full_name.charAt(0).toUpperCase()}</div>
                )}
                <div className="min-w-0">
                  <p className="font-bold text-[#315f8c]">{profile.full_name}</p>
                  <time className="text-xs text-[var(--nexus-muted)]">{new Date(post.created_at).toLocaleString('es-MX')}</time>
                </div>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-[var(--nexus-ink)]">{post.body}</p>
              <div className="mt-4 border-t border-[var(--nexus-line)] pt-3 text-right">
                <ReportButton reportedId={profile.id} targetKind="post" targetId={post.id} compact />
              </div>
            </article>
          )) : (
            <div className="rounded-xl border border-dashed border-[var(--nexus-line)] bg-white p-8 text-center text-sm text-[var(--nexus-muted)]">
              Este usuario todavía no ha publicado nada.
            </div>
          )}
        </main>
      </div>
    </section>
  )
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span aria-hidden="true" className="w-5 shrink-0 text-center">{icon}</span>
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--nexus-muted)]">{label}</p>
        <p className="mt-0.5 font-semibold text-[var(--nexus-ink)]">{value}</p>
      </div>
    </div>
  )
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
