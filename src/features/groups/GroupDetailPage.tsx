import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'

type Group = { id: string; name: string; description: string | null; topic: string; created_by: string }
type Member = { profile_id: string; role: 'owner' | 'member'; profiles: { username: string; full_name: string } | null }
type GroupPost = { id: string; group_id: string; author_id: string; body: string; created_at: string }
type GroupComment = { id: string; post_id: string; author_id: string; body: string; created_at: string }
type ChatMessage = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string }
type PresenceEntry = { profile_id?: string; username?: string }

export function GroupDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [posts, setPosts] = useState<GroupPost[]>([])
  const [comments, setComments] = useState<GroupComment[]>([])
  const [isMember, setIsMember] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatDraft, setChatDraft] = useState('')
  const [onlineProfiles, setOnlineProfiles] = useState<Record<string, string>>({})
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

    const nextMembers = (memberResult.data ?? []) as unknown as Member[]
    const nextPosts = (postResult.data ?? []) as GroupPost[]
    const member = nextMembers.some((item) => item.profile_id === user.id)

    const postIds = nextPosts.map((post) => post.id)
    const commentResult = postIds.length
      ? await supabase.from('group_comments').select('id, post_id, author_id, body, created_at').in('post_id', postIds).order('created_at')
      : { data: [], error: null }

    if (commentResult.error) setError(commentResult.error.message)

    setGroup(groupResult.data as Group)
    setMembers(nextMembers)
    setIsMember(member)
    setPosts(nextPosts)
    setComments((commentResult.data ?? []) as GroupComment[])

    if (member) {
      const { data: conversation, error: conversationError } = await supabase
        .from('conversations')
        .select('id')
        .eq('type', 'group')
        .eq('group_id', id)
        .maybeSingle()

      if (conversationError) {
        setError(conversationError.message)
        setConversationId(null)
      } else if (conversation?.id) {
        setConversationId(conversation.id)
        const { data: messages, error: messagesError } = await supabase
          .from('messages')
          .select('id, conversation_id, sender_id, body, created_at')
          .eq('conversation_id', conversation.id)
          .order('created_at')
          .limit(300)
        if (messagesError) setError(messagesError.message)
        else setChatMessages((messages ?? []) as ChatMessage[])
      }
    } else {
      setConversationId(null)
      setChatMessages([])
      setOnlineProfiles({})
    }

    setLoading(false)
  }

  useEffect(() => {
    void loadGroup()
  }, [id, user])

  useEffect(() => {
    if (!id) return

    const postChannel = supabase
      .channel(`group-posts:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_posts', filter: `group_id=eq.${id}` }, () => {
        void loadGroup()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(postChannel)
    }
  }, [id, user])

  const currentMember = useMemo(() => members.find((member) => member.profile_id === user?.id), [members, user])
  const currentUsername = currentMember?.profiles?.username ?? 'usuario'

  useEffect(() => {
    if (!id || !user || !isMember || !conversationId) return

    const chatChannel = supabase
      .channel(`group-chat:${conversationId}`, { config: { presence: { key: user.id } } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const message = payload.new as ChatMessage
        setChatMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message])
      })
      .on('presence', { event: 'sync' }, () => {
        const state = chatChannel.presenceState<PresenceEntry>()
        const next: Record<string, string> = {}
        for (const [key, entries] of Object.entries(state)) {
          const entry = entries[0]
          next[key] = entry?.username ?? 'usuario'
        }
        setOnlineProfiles(next)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await chatChannel.track({ profile_id: user.id, username: currentUsername })
        }
      })

    return () => {
      void chatChannel.untrack()
      void supabase.removeChannel(chatChannel)
    }
  }, [conversationId, currentUsername, id, isMember, user])

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
    else {
      setCommentDrafts((current) => ({ ...current, [postId]: '' }))
      void loadGroup()
    }
  }

  async function deletePost(postId: string) {
    const { error: deleteError } = await supabase.from('group_posts').delete().eq('id', postId)
    if (deleteError) setError(deleteError.message)
    else void loadGroup()
  }

  async function deleteComment(commentId: string) {
    const { error: deleteError } = await supabase.from('group_comments').delete().eq('id', commentId)
    if (deleteError) setError(deleteError.message)
    else void loadGroup()
  }

  async function sendChatMessage(event: React.FormEvent) {
    event.preventDefault()
    if (!user || !conversationId || !chatDraft.trim() || !isMember) return
    const message = chatDraft.trim()
    setChatDraft('')
    const { error: sendError } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body: message,
    })
    if (sendError) {
      setChatDraft(message)
      setError(sendError.message)
    }
  }

  if (loading) return <div className="py-12 text-center text-sm text-[var(--nexus-muted)]">Cargando grupo...</div>
  if (!group) return <div className="py-12 text-center text-sm text-[var(--nexus-muted)]">Grupo no disponible.</div>

  const isOwner = currentMember?.role === 'owner'

  return (
    <section className="mx-auto max-w-6xl">
      <Link to="/groups" className="text-sm font-bold text-[var(--nexus-coral)]">← Volver a grupos</Link>

      <div className="mt-5 rounded-3xl border border-[var(--nexus-line)] bg-white p-6">
        <span className="rounded-full bg-[var(--nexus-mist)] px-3 py-1 text-xs font-bold text-[var(--nexus-navy)]">{group.topic}</span>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-bold text-[var(--nexus-navy)]">{group.name}</h1>
            {group.description && <p className="mt-3 max-w-2xl leading-7 text-[var(--nexus-muted)]">{group.description}</p>}
          </div>
          {!isMember ? (
            <button onClick={() => void join()} className="rounded-xl bg-[var(--nexus-coral)] px-4 py-2 text-sm font-bold text-white">Unirme</button>
          ) : !isOwner ? (
            <button onClick={() => void leave()} className="rounded-xl border border-[var(--nexus-line)] px-4 py-2 text-sm font-bold text-[var(--nexus-muted)]">Salir del grupo</button>
          ) : (
            <span className="rounded-full bg-orange-50 px-3 py-2 text-xs font-bold text-[var(--nexus-coral)]">Administrador</span>
          )}
        </div>
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <div>
          {isMember && (
            <form onSubmit={createPost} className="rounded-2xl border border-[var(--nexus-line)] bg-white p-5">
              <label className="block text-sm font-bold text-[var(--nexus-ink)]">Publicar en el grupo
                <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} className="input min-h-24 resize-y" placeholder="Comparte algo con el grupo..." />
              </label>
              <div className="mt-3 flex justify-end">
                <button disabled={!body.trim()} className="rounded-xl bg-[var(--nexus-coral)] px-4 py-2 font-bold text-white disabled:opacity-50">Publicar</button>
              </div>
            </form>
          )}

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
                  {isMember && (
                    <div className="mt-3 flex gap-2">
                      <input value={commentDrafts[post.id] ?? ''} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} maxLength={1000} className="input mt-0" placeholder="Escribe un comentario" />
                      <button type="button" onClick={() => void createComment(post.id)} className="rounded-xl bg-[var(--nexus-navy)] px-3 py-2 text-sm font-bold text-white">Enviar</button>
                    </div>
                  )}
                </div>
              </article>
            )) : (
              <div className="rounded-2xl border border-dashed border-[var(--nexus-line)] p-8 text-center text-sm text-[var(--nexus-muted)]">Todavía no hay publicaciones en este grupo.</div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <aside className="rounded-2xl border border-[var(--nexus-line)] bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-bold text-[var(--nexus-navy)]">Miembros</h2>
              <span className="text-xs font-bold text-emerald-700">{Object.keys(onlineProfiles).length} en línea</span>
            </div>
            <div className="mt-4 space-y-3">
              {members.map((member) => (
                <div key={member.profile_id} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-[var(--nexus-navy)]">{member.profiles?.full_name ?? 'Usuario'}</p>
                    <p className="text-xs text-[var(--nexus-muted)]">@{member.profiles?.username ?? 'perfil'}{member.role === 'owner' ? ' · Administrador' : ''}</p>
                  </div>
                  {onlineProfiles[member.profile_id] && <span className="text-xs font-bold text-emerald-700">En línea</span>}
                </div>
              ))}
            </div>
          </aside>

          <section className="overflow-hidden rounded-2xl border border-[var(--nexus-line)] bg-white">
            <div className="border-b border-[var(--nexus-line)] p-4">
              <h2 className="font-display text-xl font-bold text-[var(--nexus-navy)]">Chat del grupo</h2>
            </div>

            {!isMember ? (
              <p className="p-5 text-sm text-[var(--nexus-muted)]">Únete al grupo para participar en el chat.</p>
            ) : (
              <>
                <div className="max-h-96 min-h-72 space-y-3 overflow-y-auto bg-[var(--nexus-paper)] p-4">
                  {chatMessages.length ? chatMessages.map((message) => {
                    const sender = members.find((member) => member.profile_id === message.sender_id)
                    const mine = message.sender_id === user?.id
                    return (
                      <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${mine ? 'bg-[var(--nexus-navy)] text-white' : 'border border-[var(--nexus-line)] bg-white'}`}>
                          {!mine && <p className="mb-1 text-xs font-bold text-[var(--nexus-coral)]">@{sender?.profiles?.username ?? 'usuario'}</p>}
                          <p className="whitespace-pre-wrap">{message.body}</p>
                        </div>
                      </div>
                    )
                  }) : <p className="py-10 text-center text-sm text-[var(--nexus-muted)]">Todavía no hay mensajes.</p>}
                </div>
                <form onSubmit={sendChatMessage} className="flex gap-2 border-t border-[var(--nexus-line)] p-4">
                  <input value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} maxLength={2000} className="input mt-0 flex-1" placeholder="Escribe un mensaje..." />
                  <button className="rounded-xl bg-[var(--nexus-coral)] px-4 text-sm font-bold text-white">Enviar</button>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </section>
  )
}
