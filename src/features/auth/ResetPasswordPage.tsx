import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from './useAuth'

export function ResetPasswordPage() {
  const { user, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [verifying, setVerifying] = useState(true)
  const [verified, setVerified] = useState(false)

  useEffect(() => {
    let active = true

    async function verifyRecovery() {
      const params = new URLSearchParams(window.location.search)
      const tokenHash = params.get('token_hash')

      if (tokenHash) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        })

        if (!active) return

        if (verifyError) {
          setError('El enlace de recuperación no es válido o ya expiró. Solicita uno nuevo.')
          setVerified(false)
        } else {
          setVerified(true)
          window.history.replaceState({}, '', `${import.meta.env.BASE_URL}?mode=recovery`)
        }
        setVerifying(false)
        return
      }

      if (user) {
        setVerified(true)
      } else {
        setError('Falta el código de recuperación. Solicita un enlace nuevo desde Nexus.')
      }
      setVerifying(false)
    }

    void verifyRecovery()
    return () => {
      active = false
    }
  }, [user])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    if (!verified) {
      setError('Primero debes abrir un enlace de recuperación válido.')
      return
    }
    if (password.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setSubmitting(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (updateError) {
      setError('No fue posible cambiar la contraseña. Solicita un enlace nuevo e inténtalo otra vez.')
      return
    }

    setDone(true)
  }

  async function finish() {
    await signOut()
    window.history.replaceState({}, '', import.meta.env.BASE_URL)
    window.location.assign(import.meta.env.BASE_URL)
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--nexus-paper)] px-5 py-10">
      <section className="w-full max-w-lg rounded-3xl border border-[var(--nexus-line)] bg-white p-8 shadow-xl shadow-slate-200/60">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--nexus-coral)]">Nexus · seguridad</p>
        <h1 className="mt-4 font-display text-4xl font-bold text-[var(--nexus-navy)]">Crea una nueva contraseña</h1>

        {verifying ? (
          <p className="mt-5 text-[var(--nexus-muted)]">Verificando enlace...</p>
        ) : done ? (
          <>
            <p className="mt-5 leading-7 text-[var(--nexus-muted)]">Tu contraseña fue actualizada correctamente.</p>
            <button type="button" onClick={() => void finish()} className="mt-7 w-full rounded-xl bg-[var(--nexus-navy)] px-5 py-3 font-bold text-white">
              Volver a iniciar sesión
            </button>
          </>
        ) : verified ? (
          <form onSubmit={submit} className="mt-6">
            <label className="block text-sm font-semibold text-[var(--nexus-ink)]">
              Nueva contraseña
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className="input" />
            </label>
            <label className="mt-4 block text-sm font-semibold text-[var(--nexus-ink)]">
              Confirmar contraseña
              <input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" className="input" />
            </label>
            {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <button disabled={submitting} className="mt-6 w-full rounded-xl bg-[var(--nexus-navy)] px-5 py-3 font-bold text-white disabled:opacity-60">
              {submitting ? 'Guardando...' : 'Cambiar contraseña'}
            </button>
          </form>
        ) : (
          <>
            {error && <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <button type="button" onClick={() => window.location.assign(import.meta.env.BASE_URL)} className="mt-6 w-full rounded-xl bg-[var(--nexus-navy)] px-5 py-3 font-bold text-white">
              Volver a Nexus
            </button>
          </>
        )}
      </section>
    </main>
  )
}
