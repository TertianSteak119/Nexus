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
  bio: string | null
  avatar_path: string | null
  accepts_message_requests: boolean | null
  interests: string[]
  looking_for: string[]
}

type GradeRequest = {
  verification_id: string
  profile_id: string
  username: string
  full_name: string
  gpa: number
  image_path: string
  status: string
  created_at: string
}

type RequestTab = 'accounts' | 'grades'

export function RequestsPage() {
  const [accountRequests, setAccountRequests] = useState<AccountRequest[]>([])
  const [gradeRequests, setGradeRequests] = useState<GradeRequest[]>([])
  const [activeTab, setActiveTab] = useState<RequestTab>('accounts')
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

    const [accountsResult, gradesResult] = await Promise.all([
      supabase.rpc('moderator_list_account_approvals'),
      supabase.rpc('moderator_list_grade_verifications'),
    ])

    if (accountsResult.error) setError(accountsResult.error.message)
    else setAccountRequests((accountsResult.data ?? []) as AccountRequest[])

    if (gradesResult.error) setError((current) => current || gradesResult.error?.message || '')
    else setGradeRequests((gradesResult.data ?? []) as GradeRequest[])

    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function copyApplicationLink(item: AccountRequest) {
    setError('')
    setFeedback('')

    const { data: token, error: tokenError } = await supabase.rpc('admin_issue_pending_application_link', {
      target_user: item.user_id,
    })

    if (tokenError || !token) {
      setError(tokenError?.message ?? 'No fue posible crear el enlace.')
      return
    }

    const applicationUrl = new URL(import.meta.env.BASE_URL, window.location.origin)
    applicationUrl.searchParams.set('mode', 'application')
    applicationUrl.searchParams.set('uid', item.user_id)
    applicationUrl.searchParams.set('token', String(token))
    applicationUrl.searchParams.set('name', item.full_name)

    await navigator.clipboard.writeText(applicationUrl.toString())
    setFeedback('Enlace para completar la solicitud copiado. Puedes enviárselo al usuario.')
  }

  async function reviewAccount(item: AccountRequest, approve: boolean) {
    setError('')
    setFeedback('')

    const note = window.prompt(approve ? 'Nota de aprobación (opcional):' : 'Motivo del rechazo (opcional):', '')
    if (note === null) return

    const { error: reviewError } = await supabase.rpc('moderator_review_account_approval', {
      target_user: item.user_id,
      approve,
      note,
    })

    if (reviewError) {
      if (reviewError.message.includes('ACCOUNT_APPLICATION_INCOMPLETE')) {
        setError('No puedes aprobar esta cuenta hasta que el usuario complete los datos obligatorios de la solicitud.')
      } else {
        setError(reviewError.message)
      }
      return
    }

    setFeedback(approve ? 'Cuenta aprobada correctamente.' : 'Solicitud de cuenta rechazada.')
    await load()
  }

  async function reviewGrade(item: GradeRequest, approve: boolean) {
    setError('')
    setFeedback('')

    const note = window.prompt(approve ? 'Nota de aprobación del promedio (opcional):' : 'Motivo del rechazo (opcional):', '')
    if (note === null) return

    const { error: reviewError } = await supabase.rpc('moderator_review_grade_verification', {
      verification_id: item.verification_id,
      approve,
      note,
    })

    if (reviewError) {
      setError(reviewError.message)
      return
    }

    setFeedback(approve ? 'Promedio verificado y publicado en el perfil.' : 'Solicitud de promedio rechazada.')
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

  const totalPending = accountRequests.length + gradeRequests.length

  return (
    <section className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--nexus-coral)]">Administración</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-[var(--nexus-navy)]">Solicitudes</h1>
          <p className="mt-2 text-sm text-[var(--nexus-muted)]">
            Revisa por separado el acceso de nuevas cuentas y las solicitudes opcionales de verificación de promedio.
          </p>
        </div>
        <span className="rounded-full bg-[var(--nexus-navy)] px-4 py-2 text-sm font-bold text-white">
          {totalPending} pendiente{totalPending === 1 ? '' : 's'}
        </span>
      </div>

      <div className="mt-6 flex gap-2 rounded-2xl border border-[var(--nexus-line)] bg-white p-2">
        <TabButton active={activeTab === 'accounts'} onClick={() => setActiveTab('accounts')}>
          Cuentas · {accountRequests.length}
        </TabButton>
        <TabButton active={activeTab === 'grades'} onClick={() => setActiveTab('grades')}>
          Promedios · {gradeRequests.length}
        </TabButton>
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {feedback && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{feedback}</p>}

      {activeTab === 'accounts' ? (
        <div className="mt-7 grid gap-5">
          {accountRequests.length ? accountRequests.map((item) => {
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
                  {!item.application_complete && (
                    <button
                      type="button"
                      onClick={() => void copyApplicationLink(item)}
                      className="rounded-lg border border-[var(--nexus-line)] bg-white px-4 py-2.5 text-sm font-bold text-[#315f8c]"
                    >
                      Copiar enlace para completar solicitud
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!item.application_complete}
                    onClick={() => void reviewAccount(item, true)}
                    className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Aprobar acceso
                  </button>
                  <button
                    type="button"
                    onClick={() => void reviewAccount(item, false)}
                    className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-bold text-white"
                  >
                    Rechazar
                  </button>
                </div>
              </article>
            )
          }) : (
            <EmptyState text="No hay solicitudes de cuenta pendientes." />
          )}
        </div>
      ) : (
        <div className="mt-7 grid gap-5">
          {gradeRequests.length ? gradeRequests.map((item) => (
            <article key={item.verification_id} className="rounded-2xl border border-[var(--nexus-line)] bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl font-bold text-[var(--nexus-navy)]">{item.full_name}</h2>
                  <p className="mt-1 text-sm text-[var(--nexus-muted)]">@{item.username}</p>
                  <p className="mt-2 text-xs text-[var(--nexus-muted)]">
                    Solicitud recibida: {new Date(item.created_at).toLocaleString('es-MX')}
                  </p>
                </div>
                <div className="rounded-2xl bg-[var(--nexus-paper)] px-5 py-3 text-center">
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--nexus-muted)]">Promedio solicitado</p>
                  <p className="mt-1 font-display text-3xl font-bold text-[var(--nexus-navy)]">{item.gpa}</p>
                </div>
              </div>

              <p className="mt-5 text-sm leading-6 text-[var(--nexus-muted)]">
                El promedio solo se mostrará como verificado en Nexus si apruebas esta solicitud después de revisar el comprobante.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void openEvidence(item.image_path)}
                  className="rounded-lg border border-[var(--nexus-line)] bg-white px-4 py-2.5 text-sm font-bold text-[var(--nexus-navy)]"
                >
                  Ver comprobante
                </button>
                <button
                  type="button"
                  onClick={() => void reviewGrade(item, true)}
                  className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white"
                >
                  Aprobar promedio
                </button>
                <button
                  type="button"
                  onClick={() => void reviewGrade(item, false)}
                  className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-bold text-white"
                >
                  Rechazar
                </button>
              </div>
            </article>
          )) : (
            <EmptyState text="No hay solicitudes de promedio pendientes." />
          )}
        </div>
      )}
    </section>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold transition ${
        active ? 'bg-[var(--nexus-navy)] text-white' : 'text-[var(--nexus-muted)] hover:bg-[var(--nexus-mist)]'
      }`}
    >
      {children}
    </button>
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

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--nexus-line)] bg-white p-10 text-center text-sm text-[var(--nexus-muted)]">
      {text}
    </div>
  )
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
