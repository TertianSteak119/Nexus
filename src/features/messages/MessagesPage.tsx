import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'

type DirectConversation = {
  conversation_id: string
  other_id: string
  username: string
  full_name: string
  avatar_path: string | null
  last_message: string | null
  last_message_at: string | null
}

type ChatRequest = {
  id: string
  from_id: string
  to_id: string
  status: 'pending' | 'accepted' | 'rejected'
  conversation_id: string | null
  created_at: string
}

type MiniProfile = {
  id: string
  username: string
  full_name: string
}

type ChatMessage = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
}

export function MessagesPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [conversations, setConversations] = useState<DirectConversation[]>([])
  const [requests, setRequests] = useState<ChatRequest[]>([])
  const [requestProfiles, setRequestProfiles] = useState<Record<string, MiniProfile>>({})
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('conversation'))
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.conversation_id === selectedId) ?? null,
    [conversations, selectedId],
  )

  const loadOverview = useCallback(async () => {
    if (!user) return
    setError('')
    const [{ data: conversationData, error: conversationError }, { data: requestData, error: requestError }] = await Promise.all([
      supabase.rpc('list_direct_conversations'),
      supabase.from('chat_requests').select('id, from_id, to_id, status, conversation_id, created_at').eq('status', 'pending').order('created_at', { ascending: false }),
    ])

    if (conversationError) {
      setError(conversationError.message)
      setLoading(false)
      return
    }
    if (requestError) {
      setError(requestError.message)
      setLoading(false)
      return
    }

    const nextConversations = (conversationData ?? []) as DirectConversation[]
    const nextRequests = (requestData ?? []) as ChatRequest[]
    setConversations(nextConversations)
    setRequests(nextRequests)

    const ids = [...new Set(nextRequests.map((item) => item.from_id === user.id ? item.to_id : item.from_id))]
    if (ids.length) {
      const { data: profiles } = await supabase.from('profiles').select('id, username, full_name').in('id', ids)
      const profileMap: Record<string, MiniProfile> = {}
      for (const profile of profiles ?? []) profileMap[profile.id] = profile as MiniProfile
      setRequestProfiles(profileMap)
    } else {
      setRequestProfiles({})
    }

    if (selectedId && !nextConversations.some((item) => item.conversation_id === selectedId)) {
      setSelectedId(null)
      setSearchParams({})
    }
    setLoading(false)
  }, [selectedId, setSearchParams, user])

  const loadMessages = useCallback(async (conversationId: string) => {
    const { data, error: messageError } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, body, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(300)
    if (messageError) setError(messageError.message)
    else setMessages((data ?? []) as ChatMessage[])
  }, [])

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      return
    }
    void loadMessages(selectedId)
    const channel = supabase
      .channel(`messages:${selectedId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedId}` }, (payload) => {
        const message = payload.new as ChatMessage
        setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message])
        void loadOverview()
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadMessages, loadOverview, selectedId])

  async function respond(requestId: string, status: 'accepted' | 'rejected') {
    setError('')
    const { data, error: responseError } = await supabase
      .from('chat_requests')
      .update({ status })
      .eq('id', requestId)
      .select('conversation_id')
      .single()
    if (responseError) {
      setError(responseError.message)
      return
    }
    await loadOverview()
    if (status === 'accepted' && data?.conversation_id) {
      setSelectedId(data.conversation_id)
      setSearchParams({ conversation: data.conversation_id })
    }
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault()
    if (!user || !selectedId || !draft.trim()) return
    const body = draft.trim()
    setDraft('')
    const { error: sendError } = await supabase.from('messages').insert({
      conversation_id: selectedId,
      sender_id: user.id,
      body,
    })
    if (sendError) {
      setDraft(body)
      setError(sendError.message)
    }
  }

  async function blockSelected() {
    if (!user || !selectedConversation) return
    const confirmed = window.confirm(`¿Bloquear a @${selectedConversation.username}? El chat quedará cortado.`)
    if (!confirmed) return
    const { error: blockError } = await supabase.from('blocks').insert({
      blocker_id: user.id,
      blocked_id: selectedConversation.other_id,
    })
    if (blockError && blockError.code !== '23505') {
      setError(blockError.message)
      return
    }
    setSelectedId(null)
    setSearchParams({})
    setMessages([])
    await loadOverview()
  }

  if (!user) return null

  const incoming = requests.filter((item) => item.to_id === user.id)
  const outgoing = requests.filter((item) => item.from_id === user.id)

  return (
    <section className="mx-auto max-w-6xl">
      <div className="mb-7">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--nexus-coral)]">Fase 5 · mensajes</p>
        <h1 className="mt-3 font-display text-4xl font-bold text-[var(--nexus-navy)]">Conversaciones.</h1>
        <p className="mt-2 text-sm text-[var(--nexus-muted)]">Los mensajes son solo texto y respetan automáticamente bloqueos y reglas de edad.</p>
      </div>

      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {incoming.length > 0 && (
        <div className="mb-6 rounded-2xl border border-[var(--nexus-line)] bg-white p-5">
          <h2 className="font-display text-xl font-bold text-[var(--nexus-navy)]">Solicitudes recibidas</h2>
          <div className="mt-4 grid gap-3">
            {incoming.map((request) => {
              const profile = requestProfiles[request.from_id]
              return (
                <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--nexus-paper)] p-4">
                  <div>
                    <p className="font-bold text-[var(--nexus-navy)]">{profile?.full_name ?? 'Usuario'}</p>
                    <p className="text-sm text-[var(--nexus-muted)]">@{profile?.username ?? 'perfil'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => void respond(request.id, 'rejected')} className="rounded-xl border border-[var(--nexus-line)] px-4 py-2 text-sm font-bold text-[var(--nexus-muted)]">Rechazar</button>
                    <button onClick={() => void respond(request.id, 'accepted')} className="rounded-xl bg-[var(--nexus-coral)] px-4 py-2 text-sm font-bold text-white">Aceptar</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="mb-6 rounded-2xl border border-[var(--nexus-line)] bg-white p-5">
          <h2 className="font-display text-xl font-bold text-[var(--nexus-navy)]">Solicitudes enviadas</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {outgoing.map((request) => {
              const profile = requestProfiles[request.to_id]
              return <span key={request.id} className="rounded-full bg-[var(--nexus-mist)] px-3 py-2 text-sm text-[var(--nexus-muted)]">@{profile?.username ?? 'perfil'} · pendiente</span>
            })}
          </div>
        </div>
      )}

      <div className="grid min-h-[560px] overflow-hidden rounded-3xl border border-[var(--nexus-line)] bg-white lg:grid-cols-[320px_1fr]">
        <aside className="border-b border-[var(--nexus-line)] p-4 lg:border-b-0 lg:border-r">
          <h2 className="px-2 font-bold text-[var(--nexus-navy)]">Tus chats</h2>
          <div className="mt-3 grid gap-2">
            {loading ? <p className="px-2 py-4 text-sm text-[var(--nexus-muted)]">Cargando...</p> : conversations.length ? conversations.map((conversation) => (
              <button
                key={conversation.conversation_id}
                onClick={() => {
                  setSelectedId(conversation.conversation_id)
                  setSearchParams({ conversation: conversation.conversation_id })
                }}
                className={`rounded-2xl p-3 text-left transition ${selectedId === conversation.conversation_id ? 'bg-[var(--nexus-navy)] text-white' : 'hover:bg-[var(--nexus-mist)]'}`}
              >
                <p className="font-bold">{conversation.full_name}</p>
                <p className={`text-xs ${selectedId === conversation.conversation_id ? 'text-white/70' : 'text-[var(--nexus-muted)]'}`}>@{conversation.username}</p>
                <p className={`mt-1 truncate text-sm ${selectedId === conversation.conversation_id ? 'text-white/80' : 'text-[var(--nexus-muted)]'}`}>{conversation.last_message ?? 'Inicia la conversación'}</p>
              </button>
            )) : <p className="px-2 py-4 text-sm text-[var(--nexus-muted)]">Aún no tienes conversaciones.</p>}
          </div>
        </aside>

        <div className="flex min-h-[520px] flex-col">
          {selectedConversation ? (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-[var(--nexus-line)] p-4">
                <div>
                  <p className="font-bold text-[var(--nexus-navy)]">{selectedConversation.full_name}</p>
                  <p className="text-sm text-[var(--nexus-muted)]">@{selectedConversation.username}</p>
                </div>
                <button onClick={() => void blockSelected()} className="rounded-xl border border-red-200 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50">Bloquear</button>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto bg-[var(--nexus-paper)] p-4">
                {messages.length ? messages.map((message) => (
                  <div key={message.id} className={`flex ${message.sender_id === user.id ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.sender_id === user.id ? 'bg-[var(--nexus-navy)] text-white' : 'border border-[var(--nexus-line)] bg-white text-[var(--nexus-ink)]'}`}>
                      {message.body}
                    </div>
                  </div>
                )) : <p className="py-10 text-center text-sm text-[var(--nexus-muted)]">Todavía no hay mensajes. Di hola.</p>}
              </div>
              <form onSubmit={sendMessage} className="flex gap-2 border-t border-[var(--nexus-line)] p-4">
                <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} className="input mt-0 flex-1" placeholder="Escribe un mensaje..." />
                <button className="rounded-xl bg-[var(--nexus-coral)] px-5 font-bold text-white">Enviar</button>
              </form>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center text-[var(--nexus-muted)]">
              <div><p className="font-display text-2xl font-bold text-[var(--nexus-navy)]">Selecciona un chat</p><p className="mt-2 text-sm">También puedes enviar una solicitud desde el perfil de otro estudiante.</p></div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
