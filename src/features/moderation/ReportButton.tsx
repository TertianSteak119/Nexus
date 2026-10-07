import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'

type TargetKind = 'profile' | 'post' | 'comment' | 'message'

type Props = {
  reportedId: string
  targetKind: TargetKind
  targetId?: string | null
  compact?: boolean
}

export function ReportButton({ reportedId, targetKind, targetId = null, compact = false }: Props) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [message, setMessage] = useState('')
  const [evidence, setEvidence] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || categories.length) return
    void supabase.from('report_categories').select('id, name').order('name').then(({ data }) => {
      setCategories(data ?? [])
      if (data?.[0]) setCategoryId(data[0].id)
    })
  }, [categories.length, open])

  if (!user || user.id === reportedId) return null

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!user || !categoryId) return
    setError('')
    setFeedback('')

    let evidencePath: string | null = null
    if (evidence) {
      const extension = evidence.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      if (!['jpg', 'jpeg', 'png', 'webp'].includes(extension) || evidence.size > 5 * 1024 * 1024) {
        setError('La evidencia debe ser JPG, PNG o WebP y pesar máximo 5 MB.')
        return
      }
      evidencePath = `${user.id}/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('report-evidence').upload(evidencePath, evidence, {
        contentType: evidence.type,
      })
      if (uploadError) {
        setError(uploadError.message)
        return
      }
    }

    setSubmitting(true)
    const { error: reportError } = await supabase.from('reports').insert({
      reporter_id: user.id,
      reported_id: reportedId,
      category_id: categoryId,
      target_kind: targetKind,
      target_id: targetId,
      message: message.trim() || null,
      evidence_path: evidencePath,
    })
    setSubmitting(false)

    if (reportError) {
      setError(reportError.message)
      return
    }

    setFeedback('Reporte enviado.')
    setMessage('')
    setEvidence(null)
    window.setTimeout(() => {
      setOpen(false)
      setFeedback('')
    }, 900)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={compact
          ? 'text-xs font-bold text-red-600'
          : 'rounded-xl border border-red-200 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50'}
      >
        Reportar
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <form onSubmit={submit} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-bold text-[var(--nexus-navy)]">Enviar reporte</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-sm font-bold text-[var(--nexus-muted)]">Cerrar</button>
            </div>

            <label className="mt-5 block text-sm font-semibold text-[var(--nexus-ink)]">
              Motivo
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="input">
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>

            <label className="mt-4 block text-sm font-semibold text-[var(--nexus-ink)]">
              Detalles
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} className="input min-h-28 resize-y" placeholder="Describe lo ocurrido." />
            </label>

            <label className="mt-4 block text-sm font-semibold text-[var(--nexus-ink)]">
              Evidencia opcional
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setEvidence(event.target.files?.[0] ?? null)} className="input file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-2" />
            </label>

            {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {feedback && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{feedback}</p>}

            <button disabled={submitting || !categoryId} className="mt-5 w-full rounded-xl bg-[var(--nexus-navy)] px-4 py-3 font-bold text-white disabled:opacity-50">
              {submitting ? 'Enviando...' : 'Enviar reporte'}
            </button>
          </form>
        </div>
      )}
    </>
  )
}
