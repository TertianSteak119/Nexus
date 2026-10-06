import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'

type Group = { id: string; name: string; description: string | null; topic: string; created_by: string }
type Member = { profile_id: string; role: 'owner' | 'member'; profiles: { username: string; full_name: string } | null }
type GroupPost = { id: string; group_id: string; author_id: string; body: string; created_at: string }
type GroupComment = { id: string; post_id: string; author_id: string; body: string; created_at: string }

export function GroupDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [posts, setPosts] = useState<GroupPost[]>([])
  const [comments, setComments] = useState<GroupComment[]>([])
  const [isMember, setIsMember] = useState(false)
  const [body, setBody] = useState('')
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function loadGroup() {
    if (!id || !user) return
    setLoading(true)
    const [groupResult, memberResult, postResult] = await Promise.all([
      supabase.from('groups').select('id, name, description, topic, created_by').eq('id', id).maybeSingle(),
      supabase.from('group_members').select('profile_id, role, profiles(username, full_name)').eq('group_id', id).order('joined_at'),
      supabase.from('group_posts').select('id, group_id, author_id, body, created_at').eq('group_id', id).order('created_at', { ascending: false }),
    ])

    if (groupResult.error || memberResult.error || postResult.error || !groupResult.data) {
      setError((groupResult.error ?? memberResult.error ?? postResult.error)?.message ?? 'No fue posible abrir el grupo.')
      setLoading(false)
      return
    }

    const nextPosts = (postResult.data ?? []) as GroupPost[]
    const postIds = nextPosts.map((post) => post.id)
    const commentResult = postIds.length
      ? await supabase.from('group_comments').select('id, post_id, author_id, body, created_at').in('post_id', postIds).order('created_at')
      : { data: [], error: null }

    if (commentResult.error) setError(commentResult.error.message)
    setGroup(groupResult.data as Group)
    setMembers((memberResult.data ?? []) as unknown as Member[])
    setIsMember((memberResult.data ?? []).some((member) => member.profile_id === user.id))
    setPosts(nextPosts)
    setComments((commentResult.data ?? []) as GroupComment[])
    setLoading(false)
  }

  useEffect(() => {
    void loadGroup()
  }, [id, user])

  useEffect(() => {
    if (!id) return
    const postChannel = supabase
      .channel(`group-posts:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_posts', filter: `group_id=eq.${id}` }, (payload) => {
        const post = payload.new as GroupPost
        setPosts((current) => current.some((item) => item.id === post.id) ? current : [post, ...current])
      })
      .subscribe()
    const commentChannel = supabase
      .channel(`group-comments:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_comments' }, (payload) => {
        const comment = payload.new as GroupComment
        setComments((current) => current.some((item) => item.id === comment.id) ? current : [...current, comment])
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(postChannel)
      void supabase.removeChannel(commentChannel)
    }
  }, [id])

  async function join() {
    if (!id || !user) return
    const { error: joinError } = await supabase.from('group_members').insert({ group_id: id, profile_id: user.id, role: 'member' })
    if (joinError) setError(joinError.message)
    else void loadGroup()
  }

  async function leave() {
    if (!id || !user) return
    const { error: leaveError } = await supabase.from('group_members').delete().eq('group_id', id).eq('profile_id', user.id)
    if (leaveError) setError(leaveError.message)
    else void loadGroup()
  }

  async function createPost(event: React.FormEvent) {
    event.preventDefault()
    if (!id || !user || !body.trim() || !isMember) return
    const { error: postError } = await supabase.from('group_posts').insert({ group_id: id, author_id: user.id, body: body.trim() })
    if (postError) setError(postError.message)
    else setBody('')
  }

  async function createComment(postId: string) {
    if (!user || !isMember) return
    const draft = commentDrafts[postId]?.trim()
    if (!draft) return
    const { error: commentError } = await supabase.from('group_comments').insert({ post_id: postId, author_id: user.id, body: draft })
    if (commentError) setError(commentError.message)
    else setCommentDrafts((current) => ({ ...current, [postId]: '' }))
  }

  async function deletePost(postId: string) {
    const { error: deleteError } = await supabase.from('group_posts').delete().eq('id', postId)
    if (deleteError) setError(deleteError.message)
    else {
      setPosts((current) => current.filter((post) => post.id !== postId))
      setComments((current) => current.filter((comment) => comment.post_id !== postId))
    }
  }

  async function deleteComment(commentId: string) {
    const { error: deleteError } = await supabase.from('group_comments').delete().eq('id', commentId)
    if (deleteError) setError(deleteError.message)
    else setComments((current) => current.filter((comment) => comment.id !== commentId))
  }

  if (loading) return <div className="py-12 text-center text-sm text-[var(--nexus-muted)]">Cargando grupo...</div>
  if (!group) return <div className="py-12 text-center text-sm text-[var(--nexus-muted)]">Grupo no disponible.</div>

  const myMembership = members.find((member) => member.profile_id === user?.id)
  const isOwner = myMembership?.role === 'owner'

  return (
    <section className="mx-auto max-w-5xl">
      <Link to="/groups" className="text-sm font-bold text-[var(--nexus-coral)]">← Volver a grupos</Link>
      <div className="mt-5 rounded-3xl border border-[var(--nexus-line)] bg-white p-6">
        <span className="rounded-full bg-[var(--nexus-mist)] px-3 py-1 text-xs font-bold text-[var(--nexus-navy)]">{group.topic}</span>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-bold text-[var(--nexus-navy)]">{group.name}</h1>
            {group.description && <p className="mt-3 max-w-2xl leading-7 text-[var(--nexus-muted)]">{group.description}</p>}
          </div>
          {!isMember ? <button onClick={() => void join()} className="rounded-xl bg-[var(--nexus-coral)] px-4 py-2 text-sm font-bold text-white">Unirme</button> : !isOwner ? <button onClick={() => void leave()} className="rounded-xl border border-[var(--nexus-line)] px-4 py-2 text-sm font-bold text-[var(--nexus-muted)]">Salir del grupo</button> : <span className="rounded-full bg-orange-50 px-3 py-2 text-xs font-bold text-[var(--nexus-coral)]">Administrador</span>}
        </div>
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px]">
        <div>
          {isMember && <form onSubmit={createPost} className="rounded-2xl border border-[var(--nexus-line)] bg-white p-5">
            <label className="block text-sm font-bold text-[var(--nexus-ink)]">Publicar en el grupo
              <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} className="input min-h-24 resize-y" placeholder="Comparte algo con el grupo..." />
            </label>
            <div className="mt-3 flex justify-end"><button disabled={!body.trim()} className="rounded-xl bg-[var(--nexus-coral)] px-4 py-2 font-bold text-white disabled:opacity-50">Publicar</button></div>
          </form>}

          <div className="mt-5 space-y-4">
            {posts.length ? posts.map((post) => (
              <article key={post.id} className="rounded-2xl border border-[var(--nexus-line)] bg-white p-5">
                <p className="whitespace-pre-wrap leading-7 text-[var(--nexus-ink)]">{post.body}</p>
                <div className="mt-3 flex items-center justify-between">
                  <time className="text-xs text-[var(--nexus-muted)]">{new Date(post.created_at).toLocaleString('es-MX')}</time>
                  {(post.author_id === user?.id || isOwner) && <button type="button" onClick={() => void deletePost(post.id)} className="text-xs font-bold text-red-600">Borrar</button>}
                </div>
                <div className="mt-4 border-t border-[var(--nexus-line)] pt-4">
                  {comments.filter((comment) => comment.post_id === post.id).map((comment) => (
                    <div key={comment.id} className="mb-2 flex items-start gap-2">
                      <p className="flex-1 rounded-lg bg-[var(--nexus-mist)] px-3 py-2 text-sm">{comment.body}</p>
                      {(comment.author_id === user?.id || isOwner) && <button type="button" onClick={() => void deleteComment(comment.id)} className="pt-2 text-xs font-bold text-red-600">Borrar</button>}
                    </div>
                  ))}
                  {isMember && <div className="mt-3 flex gap-2">
                    <input value={commentDrafts[post.id] ?? ''} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} maxLength={1000} className="input mt-0" placeholder="Escribe un comentario" />
                    <button type="button" onClick={() => void createComment(post.id)} className="rounded-xl bg-[var(--nexus-navy)] px-3 py-2 text-sm font-bold text-white">Enviar</button>
                  </div>}
                </div>
              </article>
            )) : <div className="rounded-2xl border border-dashed border-[var(--nexus-line)] p-8 text-center text-sm text-[var(--nexus-muted)]">Todavía no hay publicaciones en este grupo.</div>}
          </div>
        </div>

        <aside className="rounded-2xl border border-[var(--nexus-line)] bg-white p-5">
          <h2 className="font-display text-xl font-bold text-[var(--nexus-navy)]">Miembros</h2>
          <div className="mt-4 space-y-3">
            {members.map((member) => (
              <div key={member.profile_id}>
                <p className="font-bold text-[var(--nexus-navy)]">{member.profiles?.full_name ?? 'Usuario'}</p>
                <p className="text-xs text-[var(--nexus-muted)]">@{member.profiles?.username ?? 'perfil'}{member.role === 'owner' ? ' · Administrador' : ''}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  )
}
