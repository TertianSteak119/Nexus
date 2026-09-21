import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'

type Post = { id: string; body: string; author_id: string; created_at: string }
type Comment = { id: string; post_id: string; body: string; author_id: string; created_at: string }

export function FeedPage() {
  const { user } = useAuth()
  const [posts, setPosts] = useState<Post[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [body, setBody] = useState('')
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [editingPost, setEditingPost] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')

  useEffect(() => {
    async function loadFeed() {
      if (!supabase || !user) { setLoading(false); return }
      const from = page * 20
      const { data: postData, error: postError } = await supabase.from('posts').select('id, body, author_id, created_at').order('created_at', { ascending: false }).range(from, from + 19)
      if (postError) { setError(postError.message); setLoading(false); return }
      const postIds = (postData ?? []).map((post) => post.id)
      const { data: commentData, error: commentError } = postIds.length ? await supabase.from('comments').select('id, post_id, body, author_id, created_at').in('post_id', postIds).order('created_at') : { data: [], error: null }
      if (commentError) setError(commentError.message)
      setPosts((current) => page === 0 ? (postData ?? []) : [...current, ...(postData ?? [])])
      setComments((current) => page === 0 ? (commentData ?? []) : [...current, ...(commentData ?? [])])
      setHasMore((postData ?? []).length === 20)
      setLoading(false)
    }
    void loadFeed()
  }, [user, page])

  async function createPost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !user || !body.trim()) return
    const { data, error: postError } = await supabase.from('posts').insert({ author_id: user.id, body: body.trim() }).select('id, body, author_id, created_at').single()
    if (postError) { setError(postError.message); return }
    setPosts((current) => [data, ...current])
    setBody('')
  }

  async function createComment(postId: string) {
    const draft = commentDrafts[postId]?.trim()
    if (!supabase || !user || !draft) return
    const { data, error: commentError } = await supabase.from('comments').insert({ post_id: postId, author_id: user.id, body: draft }).select('id, post_id, body, author_id, created_at').single()
    if (commentError) { setError(commentError.message); return }
    setComments((current) => [...current, data])
    setCommentDrafts((current) => ({ ...current, [postId]: '' }))
  }

  async function deletePost(postId: string) {
    if (!supabase || !user) return
    const { error: deleteError } = await supabase.from('posts').delete().eq('id', postId).eq('author_id', user.id)
    if (deleteError) { setError(deleteError.message); return }
    setPosts((current) => current.filter((post) => post.id !== postId))
    setComments((current) => current.filter((comment) => comment.post_id !== postId))
  }

  async function updatePost(postId: string) {
    if (!supabase || !user || !editingBody.trim()) return
    const { error: updateError } = await supabase.from('posts').update({ body: editingBody.trim() }).eq('id', postId).eq('author_id', user.id)
    if (updateError) { setError(updateError.message); return }
    setPosts((current) => current.map((post) => post.id === postId ? { ...post, body: editingBody.trim() } : post))
    setEditingPost(null)
  }

  async function deleteComment(commentId: string) {
    if (!supabase || !user) return
    const { error: deleteError } = await supabase.from('comments').delete().eq('id', commentId).eq('author_id', user.id)
    if (deleteError) { setError(deleteError.message); return }
    setComments((current) => current.filter((comment) => comment.id !== commentId))
  }

  if (loading) return <div className="py-12 text-center text-sm font-semibold text-[var(--nexus-muted)]">Cargando feed...</div>

  return (
    <section className="mx-auto max-w-2xl">
      <div className="mb-8"><p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--nexus-coral)]">Fase 3 · feed</p><h1 className="mt-3 font-display text-4xl font-bold text-[var(--nexus-navy)]">Lo que está pasando.</h1></div>
      <form onSubmit={createPost} className="rounded-2xl border border-[var(--nexus-line)] bg-white p-5 shadow-sm"><label className="block text-sm font-bold text-[var(--nexus-ink)]">Comparte algo<textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} className="input min-h-28 resize-y" placeholder="Solo texto, hasta 2000 caracteres..." /></label><div className="mt-3 flex justify-end"><button className="rounded-xl bg-[var(--nexus-coral)] px-4 py-2 font-bold text-white disabled:opacity-50" disabled={!body.trim()}>Publicar</button></div></form>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mt-6 space-y-5">{posts.length ? posts.map((post) => <article key={post.id} className="rounded-2xl border border-[var(--nexus-line)] bg-white p-5">{editingPost === post.id ? <div><textarea value={editingBody} onChange={(event) => setEditingBody(event.target.value)} maxLength={2000} className="input min-h-24" /><div className="mt-2 flex gap-2"><button type="button" onClick={() => void updatePost(post.id)} className="rounded-lg bg-[var(--nexus-coral)] px-3 py-2 text-sm font-bold text-white">Guardar</button><button type="button" onClick={() => setEditingPost(null)} className="rounded-lg border px-3 py-2 text-sm font-bold">Cancelar</button></div></div> : <p className="whitespace-pre-wrap leading-7 text-[var(--nexus-ink)]">{post.body}</p>}<div className="mt-4 flex items-center justify-between"><time className="block text-xs text-[var(--nexus-muted)]">{new Date(post.created_at).toLocaleString('es-MX')}</time>{post.author_id === user?.id && <div className="flex gap-3 text-xs font-bold"><button type="button" onClick={() => { setEditingPost(post.id); setEditingBody(post.body) }} className="text-[var(--nexus-navy)]">Editar</button><button type="button" onClick={() => void deletePost(post.id)} className="text-red-600">Borrar</button></div>}</div><div className="mt-4 border-t border-[var(--nexus-line)] pt-4">{comments.filter((comment) => comment.post_id === post.id).map((comment) => <div key={comment.id} className="mb-2 flex items-start gap-2"><p className="flex-1 rounded-lg bg-[var(--nexus-mist)] px-3 py-2 text-sm text-[var(--nexus-ink)]">{comment.body}</p>{comment.author_id === user?.id && <button type="button" onClick={() => void deleteComment(comment.id)} className="pt-2 text-xs font-bold text-red-600">Borrar</button>}</div>)}<div className="mt-3 flex gap-2"><input value={commentDrafts[post.id] ?? ''} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} maxLength={1000} className="input mt-0" placeholder="Escribe un comentario" /><button type="button" onClick={() => void createComment(post.id)} className="rounded-xl bg-[var(--nexus-navy)] px-3 py-2 text-sm font-bold text-white">Enviar</button></div></div></article>) : <div className="rounded-2xl border border-dashed border-[var(--nexus-line)] p-8 text-center text-[var(--nexus-muted)]">Todavía no hay publicaciones en tu espacio.</div>}</div>
      {hasMore && <button type="button" onClick={() => setPage((current) => current + 1)} className="mt-6 w-full rounded-xl border border-[var(--nexus-line)] bg-white px-4 py-3 text-sm font-bold text-[var(--nexus-navy)]">Cargar más publicaciones</button>}
    </section>
  )
}