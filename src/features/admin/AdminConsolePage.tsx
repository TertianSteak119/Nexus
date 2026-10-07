import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Summary = {
  total_users: number
  pending_account_approvals: number
  reported_accounts: number
  pending_reports: number
  priority_reports: number
  active_bans: number
  pending_grade_verifications: number
  admin_suggestions: number
  group_suggestions: number
}

type AccountApproval = {
  user_id: string
  email: string
  full_name: string
  status: 'pending' | 'approved' | 'rejected'
  requested_at: string
  reviewed_at: string | null
  review_note: string | null
}

type Report = {
  id: string
  reporter_id: string
  reporter_username: string
  reported_id: string
  reported_username: string
  category_name: string
  target_kind: string
  target_id: string | null
  message: string | null
  evidence_path: string | null
  status: string
  involves_minor: boolean
  resolution_note: string | null
  created_at: string
}

type GradeVerification = {
  verification_id: string
  profile_id: string
  username: string
  full_name: string
  gpa: number
  image_path: string
  status: string
  created_at: string
}

type BannedAccount = {
  profile_id: string
  username: string
  full_name: string
  reason: string
  banned_at: string
  banned_until: string | null
  active: boolean
}

type AdminSuggestion = {
  id: string
  submitted_by: string | null
  username: string | null
  area: string
  suggestion: string
  status: string
  created_at: string
}

type GroupSuggestion = {
  id: string
  suggested_by: string | null
  username: string | null
  group_name: string
  description: string | null
  status: string
  created_at: string
}

export function AdminConsolePage() {
  const [access, setAccess] = useState<'checking' | 'locked' | 'granted'>('checking')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [accountApprovals, setAccountApprovals] = useState<AccountApproval[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [gradeVerifications, setGradeVerifications] = useState<GradeVerification[]>([])
  const [banned, setBanned] = useState<BannedAccount[]>([])
  const [suggestions, setSuggestions] = useState<AdminSuggestion[]>([])
  const [groupSuggestions, setGroupSuggestions] = useState<GroupSuggestion[]>([])
  const [reportStatus, setReportStatus] = useState('open')
  const [minorsOnly, setMinorsOnly] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  const load = useCallback(async () => {
    setError('')
    const { data: allowed, error: accessError } = await supabase.rpc('has_admin_console_access')
    if (accessError || !allowed) {
      setAccess('locked')
      return
    }

    setAccess('granted')

    const [summaryResult, approvalsResult, reportsResult, gradeResult, bannedResult, suggestionsResult, groupSuggestionsResult] = await Promise.all([
      supabase.rpc('admin_console_summary'),
      supabase.rpc('admin_list_account_approvals'),
      supabase.rpc('admin_list_reports', { filter_status: reportStatus || null, minors_only: minorsOnly }),
      supabase.rpc('admin_list_grade_verifications'),
      supabase.rpc('admin_list_banned_accounts'),
      supabase.rpc('admin_list_suggestions'),
      supabase.rpc('admin_list_group_suggestions'),
    ])

    const firstError =
      summaryResult.error ??
      approvalsResult.error ??
      reportsResult.error ??
      gradeResult.error ??
      bannedResult.error ??
      suggestionsResult.error ??
      groupSuggestionsResult.error

    if (firstError) {
      setError(firstError.message)
      return
    }

    setSummary(summaryResult.data as Summary)
    setAccountApprovals((approvalsResult.data ?? []) as AccountApproval[])
    setReports((reportsResult.data ?? []) as Report[])
    setGradeVerifications((gradeResult.data ?? []) as GradeVerification[])
    setBanned((bannedResult.data ?? []) as BannedAccount[])
    setSuggestions((suggestionsResult.data ?? []) as AdminSuggestion[])
    setGroupSuggestions((groupSuggestionsResult.data ?? []) as GroupSuggestion[])
  }, [minorsOnly, reportStatus])

  useEffect(() => {
    void load()
  }, [load])

  async function reviewAccount(item: AccountApproval, approve: boolean) {
    const note = window.prompt(approve ? 'Nota de aprobación (opcional):' : 'Motivo del rechazo (opcional):', '') ?? ''
    const { error: reviewError } = await supabase.rpc('admin_review_account_approval', {
      target_user: item.user_id,
      approve,
      note,
    })
    if (reviewError) setError(reviewError.message)
    else {
      setFeedback(approve ? 'Cuenta aprobada.' : 'Solicitud rechazada.')
      await load()
    }
  }

  async function changeReportStatus(report: Report, status: string) {
    const note = window.prompt('Nota de revisión (opcional):', report.resolution_note ?? '') ?? ''
    const { error: updateError } = await supabase.rpc('admin_update_report', {
      target_report: report.id,
      next_status: status,
      note,
    })
    if (updateError) setError(updateError.message)
    else {
      setFeedback('Reporte actualizado.')
      await load()
    }
  }

  async function moderateUser(report: Report, action: 'warn' | 'suspend' | 'ban' | 'unban') {
    const note = window.prompt(`Motivo de la acción: ${action}`, '') ?? ''
    if (action !== 'warn' && !note.trim()) return
    const { error: moderationError } = await supabase.rpc('admin_moderate_user', {
      target_profile: report.reported_id,
      action_name: action,
      note,
      related_report: report.id,
    })
    if (moderationError) setError(moderationError.message)
    else {
      setFeedback('Acción de moderación registrada.')
      await load()
    }
  }

  async function openEvidence(path: string, bucket: 'report-evidence' | 'boletas') {
    const { data, error: signError } = await supabase.storage.from(bucket).createSignedUrl(path, 300)
    if (signError || !data?.signedUrl) {
      setError(signError?.message ?? 'No fue posible abrir la evidencia.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function reviewGrade(item: GradeVerification, approve: boolean) {
    const note = window.prompt(approve ? 'Nota de aprobación (opcional):' : 'Motivo del rechazo:', '') ?? ''
    const { error: reviewError } = await supabase.rpc('admin_review_grade_verification', {
      verification_id: item.verification_id,
      approve,
      note,
    })
    if (reviewError) setError(reviewError.message)
    else {
      setFeedback(approve ? 'Promedio verificado.' : 'Comprobante rechazado.')
      await load()
    }
  }

  if (access === 'checking') {
    return <div className="grid min-h-[55vh] place-items-center text-sm font-semibold text-[var(--nexus-muted)]">Verificando acceso...</div>
  }

  if (access === 'locked') {
    return (
      <section className="mx-auto max-w-xl py-12 text-center">
        <h1 className="font-display text-4xl font-bold text-[var(--nexus-navy)]">Acceso restringido</h1>
        <div className="mt-8 rounded-2xl border border-[var(--nexus-line)] bg-white p-5 text-left">
          <label className="block text-sm font-semibold text-[var(--nexus-ink)]">
            Código de acceso
            <input type="password" disabled placeholder="Código de acceso" className="mt-2 w-full rounded-xl border border-[var(--nexus-line)] bg-slate-50 px-4 py-3 text-[var(--nexus-muted)]" />
          </label>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-8">
      <h1 className="font-display text-4xl font-bold text-[var(--nexus-navy)]">Centro de control</h1>

      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {feedback && <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{feedback}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Usuarios registrados" value={summary?.total_users ?? 0} />
        <Stat label="Solicitudes pendientes" value={summary?.pending_account_approvals ?? 0} />
        <Stat label="Cuentas reportadas" value={summary?.reported_accounts ?? 0} />
        <Stat label="Reportes pendientes" value={summary?.pending_reports ?? 0} />
        <Stat label="Reportes prioritarios" value={summary?.priority_reports ?? 0} />
        <Stat label="Baneos activos" value={summary?.active_bans ?? 0} />
        <Stat label="Boletas pendientes" value={summary?.pending_grade_verifications ?? 0} />
        <Stat label="Sugerencias admin" value={summary?.admin_suggestions ?? 0} />
        <Stat label="Sugerencias de grupos" value={summary?.group_suggestions ?? 0} />
      </div>

      <AdminTable title="Solicitudes de acceso" empty="No hay solicitudes pendientes.">
        {accountApprovals.filter((item) => item.status === 'pending').map((item) => (
          <Row key={item.user_id} title={item.full_name} subtitle={`${item.email} · ${new Date(item.requested_at).toLocaleString('es-MX')}`}>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void reviewAccount(item, true)} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Aprobar acceso</button>
              <button onClick={() => void reviewAccount(item, false)} className="rounded-xl bg-red-700 px-3 py-2 text-xs font-bold text-white">Rechazar</button>
            </div>
          </Row>
        ))}
      </AdminTable>

      <section className="rounded-3xl border border-[var(--nexus-line)] bg-white p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-[var(--nexus-navy)]">Reportes</h2>
            <p className="mt-1 text-sm text-[var(--nexus-muted)]">Los reportes que involucran menores aparecen primero.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <select value={reportStatus} onChange={(event) => setReportStatus(event.target.value)} className="rounded-xl border border-[var(--nexus-line)] bg-white px-3 py-2 text-sm">
              <option value="open">Abiertos</option>
              <option value="reviewing">En revisión</option>
              <option value="resolved">Resueltos</option>
              <option value="dismissed">Descartados</option>
              <option value="">Todos</option>
            </select>
            <label className="flex items-center gap-2 text-sm font-semibold text-[var(--nexus-muted)]">
              <input type="checkbox" checked={minorsOnly} onChange={(event) => setMinorsOnly(event.target.checked)} />
              Solo prioritarios
            </label>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          {reports.length ? reports.map((report) => (
            <article key={report.id} className="rounded-2xl bg-[var(--nexus-paper)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[var(--nexus-navy)]">{report.category_name}</span>
                    {report.involves_minor && <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">Prioritario · menor involucrado</span>}
                  </div>
                  <p className="mt-3 font-bold text-[var(--nexus-navy)]">@{report.reported_username}</p>
                  <p className="text-xs text-[var(--nexus-muted)]">Reportado por @{report.reporter_username} · {report.target_kind} · {new Date(report.created_at).toLocaleString('es-MX')}</p>
                </div>
                <span className="text-xs font-bold uppercase text-[var(--nexus-muted)]">{report.status}</span>
              </div>

              {report.message && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[var(--nexus-ink)]">{report.message}</p>}

              <div className="mt-4 flex flex-wrap gap-2">
                {report.evidence_path && <button onClick={() => void openEvidence(report.evidence_path!, 'report-evidence')} className="rounded-xl border border-[var(--nexus-line)] bg-white px-3 py-2 text-xs font-bold text-[var(--nexus-navy)]">Ver evidencia</button>}
                <button onClick={() => void changeReportStatus(report, 'reviewing')} className="rounded-xl border border-[var(--nexus-line)] bg-white px-3 py-2 text-xs font-bold">Revisar</button>
                <button onClick={() => void changeReportStatus(report, 'resolved')} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Resolver</button>
                <button onClick={() => void changeReportStatus(report, 'dismissed')} className="rounded-xl bg-slate-600 px-3 py-2 text-xs font-bold text-white">Descartar</button>
                <button onClick={() => void moderateUser(report, 'warn')} className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white">Advertir</button>
                <button onClick={() => void moderateUser(report, 'suspend')} className="rounded-xl bg-orange-600 px-3 py-2 text-xs font-bold text-white">Suspender</button>
                <button onClick={() => void moderateUser(report, 'ban')} className="rounded-xl bg-red-700 px-3 py-2 text-xs font-bold text-white">Banear</button>
                <button onClick={() => void moderateUser(report, 'unban')} className="rounded-xl bg-[var(--nexus-navy)] px-3 py-2 text-xs font-bold text-white">Reactivar</button>
              </div>
            </article>
          )) : <p className="rounded-2xl border border-dashed border-[var(--nexus-line)] p-5 text-sm text-[var(--nexus-muted)]">No hay reportes con estos filtros.</p>}
        </div>
      </section>

      <AdminTable title="Verificación de promedios" empty="No hay comprobantes pendientes.">
        {gradeVerifications.map((item) => (
          <Row key={item.verification_id} title={item.full_name} subtitle={`@${item.username} · Promedio ${item.gpa}`}>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void openEvidence(item.image_path, 'boletas')} className="rounded-xl border border-[var(--nexus-line)] bg-white px-3 py-2 text-xs font-bold text-[var(--nexus-navy)]">Ver comprobante</button>
              <button onClick={() => void reviewGrade(item, true)} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Aprobar</button>
              <button onClick={() => void reviewGrade(item, false)} className="rounded-xl bg-red-700 px-3 py-2 text-xs font-bold text-white">Rechazar</button>
            </div>
          </Row>
        ))}
      </AdminTable>

      <AdminTable title="Cuentas baneadas" empty="No hay cuentas baneadas.">
        {banned.map((item) => (
          <Row key={item.profile_id} title={item.full_name} subtitle={`@${item.username} · ${item.active ? 'Activo' : 'Inactivo'}`}>
            <span>{item.reason}</span>
          </Row>
        ))}
      </AdminTable>

      <AdminTable title="Sugerencias de moderación y administración" empty="No hay sugerencias.">
        {suggestions.map((item) => (
          <Row key={item.id} title={item.area} subtitle={item.username ? `@${item.username}` : 'Usuario no disponible'}>
            <span>{item.suggestion}</span>
          </Row>
        ))}
      </AdminTable>

      <AdminTable title="Sugerencias de grupos" empty="No hay sugerencias de grupos.">
        {groupSuggestions.map((item) => (
          <Row key={item.id} title={item.group_name} subtitle={item.username ? `@${item.username}` : 'Usuario no disponible'}>
            <span>{item.description || 'Sin descripción'}</span>
          </Row>
        ))}
      </AdminTable>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[var(--nexus-line)] bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--nexus-muted)]">{label}</p>
      <p className="mt-3 font-display text-3xl font-bold text-[var(--nexus-navy)]">{value}</p>
    </div>
  )
}

function AdminTable({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : [children]
  const visibleItems = items.filter(Boolean)
  return (
    <section className="rounded-3xl border border-[var(--nexus-line)] bg-white p-6">
      <h2 className="font-display text-2xl font-bold text-[var(--nexus-navy)]">{title}</h2>
      <div className="mt-5 grid gap-3">
        {visibleItems.length ? visibleItems : <p className="rounded-2xl border border-dashed border-[var(--nexus-line)] p-5 text-sm text-[var(--nexus-muted)]">{empty}</p>}
      </div>
    </section>
  )
}

function Row({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-[var(--nexus-paper)] p-4">
      <p className="font-bold text-[var(--nexus-navy)]">{title}</p>
      <p className="mt-1 text-xs text-[var(--nexus-muted)]">{subtitle}</p>
      <div className="mt-3 text-sm leading-6 text-[var(--nexus-muted)]">{children}</div>
    </div>
  )
}
