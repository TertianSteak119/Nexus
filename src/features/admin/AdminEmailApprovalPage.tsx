import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

type ApprovalAction = 'approve' | 'reject'

export function AdminEmailApprovalPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const token = params.get('token') ?? ''
  const action = (params.get('action') === 'reject' ? 'reject' : 'approve') as ApprovalAction
  const name = params.get('name') ?? 'esta cuenta'
  const linkError = params.get('error')

  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<'approved' | 'rejected' | null>(null)
  const [error, setError] = useState(() => {
    if (linkError === 'used') return 'Esta solicitud ya fue procesada.'
    if (linkError === 'expired') return 'Este enlace ya venció.'
    if (linkError === 'invalid') return 'Este enlace de administración no es válido.'
    return ''
  })

  const approving = action === 'approve'

  async function confirm() {
    if (!token) {
      setError('Este enlace de administración no es válido.')
      return
    }

    setSubmitting(true)
    setError('')

    const { data, error: invokeError } = await supabase.functions.invoke('account-approval', {
      body: { token },
    })

    setSubmitting(false)

    if (invokeError || !data?.ok) {
      const code = String(data?.error ?? '')
      if (code === 'ALREADY_PROCESSED') setError('Esta solicitud ya fue procesada.')
      else if (code === 'EXPIRED') setError('Este enlace ya venció.')
      else if (code === 'APPLICATION_INCOMPLETE') setError('La solicitud todavía no contiene todos los datos obligatorios.')
      else setError('No fue posible procesar la solicitud. Revísala desde el panel de administración.')
      return
    }

    setResult(data.action === 'reject' ? 'rejected' : 'approved')
  }

  if (result) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--nexus-paper)] px-5 py-10">
        <section className="w-full max-w-xl rounded-3xl border border-[var(--nexus-line)] bg-white p-8 text-center shadow-xl shadow-slate-200/60">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--nexus-coral)]">Nexus · administración</p>
          <h1 className="mt-4 font-display text-4xl font-bold text-[var(--nexus-navy)]">
            {result === 'approved' ? 'Cuenta aprobada' : 'Solicitud rechazada'}
          </h1>
          <p className="mt-5 leading-7 text-[var(--nexus-muted)]">
            {result === 'approved'
              ? `${name} ya puede iniciar sesión en Nexus.`
              : `La solicitud de ${name} fue rechazada.`}
          </p>
          <button
            type="button"
            onClick={() => window.location.assign(import.meta.env.BASE_URL)}
            className="mt-7 rounded-xl bg-[var(--nexus-navy)] px-5 py-3 font-bold text-white"
          >
            Volver a Nexus
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--nexus-paper)] px-5 py-10">
      <section className="w-full max-w-xl rounded-3xl border border-[var(--nexus-line)] bg-white p-8 text-center shadow-xl shadow-slate-200/60">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--nexus-coral)]">Nexus · administración</p>
        <h1 className="mt-4 font-display text-4xl font-bold text-[var(--nexus-navy)]">
          {approving ? 'Confirmar aprobación' : 'Confirmar rechazo'}
        </h1>

        {error ? (
          <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
        ) : (
          <>
            <p className="mt-5 leading-7 text-[var(--nexus-muted)]">
              Abriste el enlace desde el correo. Todavía no se ha realizado ninguna acción.
              {approving
                ? ` Confirma para aprobar la cuenta de ${name} y habilitar su acceso a Nexus.`
                : ` Confirma para rechazar la solicitud de ${name}.`}
            </p>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void confirm()}
              className={`mt-7 rounded-xl px-5 py-3 font-bold text-white disabled:opacity-60 ${
                approving ? 'bg-emerald-700' : 'bg-red-700'
              }`}
            >
              {submitting
                ? 'Procesando...'
                : approving
                  ? 'Confirmar y aprobar cuenta'
                  : 'Confirmar y rechazar solicitud'}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => window.location.assign(import.meta.env.BASE_URL)}
          className="mt-4 block w-full text-sm font-bold text-[var(--nexus-muted)]"
        >
          Volver a Nexus
        </button>
      </section>
    </main>
  )
}
