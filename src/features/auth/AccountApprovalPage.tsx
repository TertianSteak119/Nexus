import { useAuth } from './useAuth'

export function AccountApprovalPage({ status }: { status: 'pending' | 'rejected' }) {
  const { signOut } = useAuth()

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--nexus-paper)] px-5 py-10">
      <section className="w-full max-w-xl rounded-3xl border border-[var(--nexus-line)] bg-white p-8 text-center shadow-xl shadow-slate-200/60">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--nexus-coral)]">Nexus · acceso</p>
        <h1 className="mt-4 font-display text-4xl font-bold text-[var(--nexus-navy)]">
          {status === 'pending' ? 'Solicitud pendiente de aprobación' : 'Solicitud no aprobada'}
        </h1>
        <p className="mt-5 leading-7 text-[var(--nexus-muted)]">
          {status === 'pending'
            ? 'Tu correo puede estar confirmado, pero eso no autoriza el acceso. Solo el administrador de Nexus puede aprobar tu cuenta.'
            : 'El administrador de Nexus no aprobó esta solicitud de acceso.'}
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-7 rounded-xl bg-[var(--nexus-navy)] px-5 py-3 font-bold text-white"
        >
          Cerrar sesión
        </button>
      </section>
    </main>
  )
}
