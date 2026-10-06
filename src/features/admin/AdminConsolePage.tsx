import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Summary = {
  reported_accounts: number
  pending_reports: number
  active_bans: number
  admin_suggestions: number
  group_suggestions: number
}

type ReportedAccount = {
  profile_id: string
  username: string
  full_name: string
  report_count: number
  latest_report_at: string
  reasons: string[]
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
  const [reported, setReported] = useState<ReportedAccount[]>([])
  const [banned, setBanned] = useState<BannedAccount[]>([])
  const [suggestions, setSuggestions] = useState<AdminSuggestion[]>([])
  const [groupSuggestions, setGroupSuggestions] = useState<GroupSuggestion[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      if (!supabase) {
        if (active) setAccess('locked')
        return
      }

      const { data: allowed, error: accessError } = await supabase.rpc('has_admin_console_access')
      if (!active) return

      if (accessError || !allowed) {
        setAccess('locked')
        return
      }

      setAccess('granted')

      const [summaryResult, reportedResult, bannedResult, suggestionsResult, groupSuggestionsResult] = await Promise.all([
        supabase.rpc('admin_console_summary'),
        supabase.rpc('admin_list_reported_accounts'),
        supabase.rpc('admin_list_banned_accounts'),
        supabase.rpc('admin_list_suggestions'),
        supabase.rpc('admin_list_group_suggestions'),
      ])

      if (!active) return

      const firstError =
        summaryResult.error ??
        reportedResult.error ??
        bannedResult.error ??
        suggestionsResult.error ??
        groupSuggestionsResult.error

      if (firstError) {
        setError(firstError.message)
        return
      }

      setSummary(summaryResult.data as Summary)
      setReported((reportedResult.data ?? []) as ReportedAccount[])
      setBanned((bannedResult.data ?? []) as BannedAccount[])
      setSuggestions((suggestionsResult.data ?? []) as AdminSuggestion[])
      setGroupSuggestions((groupSuggestionsResult.data ?? []) as GroupSuggestion[])
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  if (access === 'checking') {
    return <div className="grid min-h-[55vh] place-items-center text-sm font-semibold text-[var(--nexus-muted)]">Verificando acceso administrativo...</div>
  }

  if (access === 'locked') {
    return (
      <section className="mx-auto max-w-xl py-12 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--nexus-coral)]">Nexus · administración</p>
        <h1 className="mt-4 font-display text-4xl font-bold text-[var(--nexus-navy)]">Panel bloqueado</h1>
        <p className="mt-4 leading-7 text-[var(--nexus-muted)]">
          Este apartado está protegido por el backend. El mecanismo de código secreto todavía no está habilitado.
        </p>
        <div className="mt-8 rounded-2xl border border-[var(--nexus-line)] bg-white p-5 text-left">
          <label className="block text-sm font-semibold text-[var(--nexus-ink)]">
            Código de acceso
            <input
              type="password"
              disabled
              placeholder="Pendiente de activación"
              className="mt-2 w-full rounded-xl border border-[var(--nexus-line)] bg-slate-50 px-4 py-3 text-[var(--nexus-muted)]"
            />
          </label>
          <p className="mt-3 text-xs leading-5 text-[var(--nexus-muted)]">
            Aunque alguien descubra esta ruta o modifique el frontend, las consultas de administración siguen bloqueadas en Supabase.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--nexus-coral)]">Nexus · administración</p>
        <h1 className="mt-3 font-display text-4xl font-bold text-[var(--nexus-navy)]">Centro de control</h1>
        <p className="mt-3 text-[var(--nexus-muted)]">Reportes, baneos y sugerencias centralizadas.</p>
      </div>

      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Cuentas reportadas" value={summary?.reported_accounts ?? 0} />
        <Stat label="Reportes pendientes" value={summary?.pending_reports ?? 0} />
        <Stat label="Baneos activos" value={summary?.active_bans ?? 0} />
        <Stat label="Sugerencias admin" value={summary?.admin_suggestions ?? 0} />
        <Stat label="Sugerencias de grupos" value={summary?.group_suggestions ?? 0} />
      </div>

      <AdminTable title="Cuentas reportadas" empty="No hay cuentas reportadas pendientes.">
        {reported.map((item) => (
          <Row key={item.profile_id} title={item.full_name} subtitle={`@${item.username} · ${item.report_count} reporte(s)`}>
            <span>{item.reasons.join(', ')}</span>
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold text-[var(--nexus-navy)]">{title}</p>
          <p className="mt-1 text-xs text-[var(--nexus-muted)]">{subtitle}</p>
        </div>
      </div>
      <div className="mt-3 text-sm leading-6 text-[var(--nexus-muted)]">{children}</div>
    </div>
  )
}
