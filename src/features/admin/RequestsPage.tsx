import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type AccountRequest = {
  user_id: string
  email: string
  full_name: string
  status: string
  requested_at: string
  application_complete: boolean
  username: string | null
  birth_date: string | null
  age: number | null
  school_level: 'secundaria' | 'preparatoria' | 'universidad' | null
  school_name: string | null
  gpa: number | null
  bio: string | null
  avatar_path: string | null
  accepts_message_requests: boolean | null
  interests: string[]
  looking_for: string[]
  grade_evidence_path: string | null
}

export function RequestsPage() {
  const [requests, setRequests] = useState<AccountRequest[]>([])
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  const load = useCallback(async () => {
    setError('')

    const { data: adminRows, error: adminError } = await supabase.rpc('current_admin_state')
    const adminState = Array.isArray(adminRows) ? adminRows[0] : adminRows

    if (adminError || !adminState?.is_admin) {
      setAllowed(false)
      setLoading(false)
      return
    }

    setAllowed(true)

    const { data, error: requestsError } = await supabase.rpc('moderator_list_account_approvals')
    if (requestsError) {
      setError(requestsError.message)
    } else {
      setRequests((data ?? []) as AccountRequest[])
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function review(item: AccountRequest, approve: boolean) {
    setError('')
    setFeedback('')

    const promptText = approve
      ? 'Nota de aprobación (opcional):'
      : 'Motivo del rechazo (opcional):'

    const note = window.prompt(promptText, '')
    if (note === null) return

    const { error: reviewError } = await supabase.rpc('moderator_review_account_approval', {
      target_user: item.user_id,
      approve,
      note,
    })

    if (reviewError) {
      if (reviewError.message.includes('ACCOUNT_APPLICATION_INCOMPLETE')) {
        setError('No puedes aprobar esta cuenta hasta que el usuario complete todos los datos obligatorios de su solicitud.')
      } else {
        setError(reviewError.message)
      }
      return
    }

    setFeedback(approve ? 'Cuenta aprobada correctamente.' : 'Solicitud rechazada.')
    await load()
  }

  async function openEvidence(path: string) {
    setError('')
    const { data, error: signedError } = await supabase.storage
      .from('boletas')
      .createSignedUrl(path, 300)

    if (signedError || !data?.signedUrl) {
      setError(signedError?.message ?? 'No fue posible abrir el comprobante.')
      return
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  if (loading || allowed === null) {
    return <div className="grid min-h-[55vh] place-items-center text-sm font-semibold text-[var(--nexus-muted)]">Cargando solicitudes...</div>
  }

  if (!allowed) {
    return (
      <section className="mx-auto max-w-xl py-12 text-center">
        <h1 className="font-display text-4xl font-bold text-[var(--nexus-navy)]">Acceso restringido</h1>
        <p className="mt-4 text-[var(--nexus-muted)]">Esta sección solo está disponible para administradores de Nexus.</p>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--nexus-coral)]">Administración</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-[var(--nexus-navy)]">Solicitudes</h1>
          <p className="mt-2 text-sm text-[var(--nexus-muted)]">
            Revisa las solicitudes de ingreso antes de permitir el acceso a Nexus.
          </p>
        </div>
        <span className="rounded-full bg-[var(--nexus-navy)] px-4 py-2 text-sm font-bold text-white">
          {requests.length} pendiente{requests.length === 1 ? '' : 's'}
        </span>
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {feedback && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{feedback}</p>}

      <div className="mt-7 grid gap-5">
        {requests.length ? requests.map((item) => {
          const avatarUrl = item.avatar_path
            ? supabase.storage.from('avatars').getPublicUrl(item.avatar_path).data.publicUrl
            : null

          return (
            <article key={item.user_id} className="rounded-2xl border border-[var(--nexus-line)] bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start gap-4">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-20 w-20 rounded-xl object-cover" />
                ) : (
                  <div className="grid h-20 w-20 place-items-center rounded-xl bg-[var(--nexus-mist)] font-display text-2xl font-bold text-[var(--nexus-navy)]">
                    {item.full_name.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-2xl font-bold text-[var(--nexus-navy)]">{item.full_name}</h2>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                      item.application_complete
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {item.application_complete ? 'Lista para revisar' : 'Perfil incompleto'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--nexus-muted)]">{item.email}</p>
                  <p className="mt-1 text-xs text-[var(--nexus-muted)]">
                    Solicitud recibida: {new Date(item.requested_at).toLocaleString('es-MX')}
                  </p>
                </div>
              </div>

              <dl className="mt-6 grid gap-4 rounded-xl bg-[var(--nexus-paper)] p-5 text-sm sm:grid-cols-2">
                <RequestField label="Usuario" value={item.username ? `@${item.username}` : 'Pendiente de completar'} />
                <RequestField label="Edad" value={item.age != null ? `${item.age} años` : 'Pendiente de completar'} />
                <RequestField label="Fecha de nacimiento" value={item.birth_date ?? 'Pendiente de completar'} />
                <RequestField label="Nivel escolar" value={item.school_level ? capitalize(item.school_level) : 'Pendiente de completar'} />
                <RequestField label="Escuela" value={item.school_name ?? 'Pendiente de completar'} />
                <RequestField label="Promedio" value={item.gpa != null ? String(item.gpa) : 'Pendiente de completar'} />
                <RequestField
                  label="Solicitudes de mensaje"
                  value={item.accepts_message_requests == null ? 'Pendiente de completar' : item.accepts_message_requests ? 'Sí' : 'No'}
                />
                <RequestField label="Intereses" value={item.interests?.length ? item.interests.join(', ') : 'Pendiente de completar'} />
                <div className="sm:col-span-2">
                  <RequestField label="Qué busca" value={item.looking_for?.length ? item.looking_for.join(', ') : 'Pendiente de completar'} />
                </div>
                {item.bio && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-bold uppercase tracking-wide text-[var(--nexus-muted)]">Bio</dt>
                    <dd className="mt-1 whitespace-pre-wrap leading-6 text-[var(--nexus-ink)]">{item.bio}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-5 flex flex-wrap gap-2">
                {item.grade_evidence_path && (
                  <button
                    type="button"
                    onClick={() => void openEvidence(item.grade_evidence_path!)}
                    className="rounded-lg border border-[var(--nexus-line)] bg-white px-4 py-2.5 text-sm font-bold text-[var(--nexus-navy)]"
                  >
                    Ver comprobante
                  </button>
                )}
                <button
                  type="button"
                  disabled={!item.application_complete}
                  onClick={() => void review(item, true)}
                  className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Aprobar acceso
                </button>
                <button
                  type="button"
                  onClick={() => void review(item, false)}
                  className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-bold text-white"
                >
                  Rechazar
                </button>
              </div>

              {!item.application_complete && (
                <p className="mt-4 text-xs leading-5 text-amber-700">
                  Esta solicitud ya aparece en administración, pero no puede aprobarse hasta que el usuario complete su perfil obligatorio.
                </p>
              )}
            </article>
          )
        }) : (
          <div className="rounded-2xl border border-dashed border-[var(--nexus-line)] bg-white p-10 text-center text-sm text-[var(--nexus-muted)]">
            No hay solicitudes pendientes.
          </div>
        )}
      </div>
    </section>
  )
}

function RequestField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-[var(--nexus-muted)]">{label}</dt>
      <dd className="mt-1 font-semibold text-[var(--nexus-ink)]">{value}</dd>
    </div>
  )
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
