import { useState } from 'react'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'
import { useAuth } from './useAuth'

const authSchema = z.object({
  email: z.string().email('Escribe un correo válido.'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
})

type AuthMode = 'login' | 'signup'

export function AuthPage() {
  useAuth()
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resetMode, setResetMode] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setError('')
    if (resetMode) {
      const emailResult = z.string().email('Escribe un correo válido.').safeParse(email)
      if (!emailResult.success) {
        setError(emailResult.error.issues[0]?.message ?? 'Revisa el correo.')
        return
      }
      if (!supabase) {
        setError('No fue posible iniciar la recuperación de contraseña. Intenta más tarde.')
        return
      }
      setSubmitting(true)
      const { error: resetError } = await supabase.functions.invoke('request-password-reset', {
        body: { email: emailResult.data },
      })
      setSubmitting(false)
      if (resetError) setError('No pudimos enviar el correo de recuperación. Intenta nuevamente en unos minutos.')
      else setMessage('Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña.')
      return
    }
    if (mode === 'signup' && fullName.trim().length < 2) {
      setError('Escribe tu nombre completo.')
      return
    }
    const result = authSchema.safeParse({ email, password })
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Revisa los datos.')
      return
    }
    if (!supabase) {
      setError('El servicio de acceso no está disponible en este momento. Intenta más tarde.')
      return
    }
    setSubmitting(true)
    const response = mode === 'login'
      ? await supabase.auth.signInWithPassword(result.data)
      : await supabase.auth.signUp({
          email: result.data.email,
          password: result.data.password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: publicAppUrl(),
          },
        })
    setSubmitting(false)
    if (response.error) {
      setError(response.error.message)
      return
    }
    if (mode === 'signup') {
      setMessage('Cuenta creada. Confirma tu correo para continuar y completar la solicitud de ingreso a Nexus.')
    }
  }

  return (
    <section className="mx-auto grid max-w-5xl gap-8 py-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--nexus-coral)]">Nexus · acceso</p>
        <h1 className="mt-4 font-display text-5xl font-bold leading-none text-[var(--nexus-navy)]">Tu espacio empieza aquí.</h1>
        <p className="mt-5 leading-7 text-[var(--nexus-muted)]">Regístrate con correo y completa tu perfil para entrar al espacio de edad que corresponde a tu fecha de nacimiento.</p>
      </div>
      <form onSubmit={submit} className="rounded-3xl border border-[var(--nexus-line)] bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
        <div className="mb-7 grid grid-cols-2 rounded-xl bg-[var(--nexus-mist)] p-1">
          {(['login', 'signup'] as const).map((option) => (
            <button key={option} type="button" onClick={() => setMode(option)} className={`rounded-lg px-4 py-2 text-sm font-bold ${mode === option ? 'bg-white text-[var(--nexus-navy)] shadow-sm' : 'text-[var(--nexus-muted)]'}`}>
              {option === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
            </button>
          ))}
        </div>
        {mode === 'signup' && !resetMode && <label className="block text-sm font-semibold text-[var(--nexus-ink)]">
          Nombre completo
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} type="text" autoComplete="name" className="mt-2 w-full rounded-xl border border-[var(--nexus-line)] px-4 py-3 outline-none focus:border-[var(--nexus-coral)]" placeholder="Tu nombre completo" />
        </label>}
        <label className={`block text-sm font-semibold text-[var(--nexus-ink)] ${mode === 'signup' && !resetMode ? 'mt-4' : ''}`}>
          Correo electrónico
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" className="mt-2 w-full rounded-xl border border-[var(--nexus-line)] px-4 py-3 outline-none focus:border-[var(--nexus-coral)]" placeholder="tu@correo.com" />
        </label>
        {!resetMode && <label className="mt-4 block text-sm font-semibold text-[var(--nexus-ink)]">
          Contraseña
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className="mt-2 w-full rounded-xl border border-[var(--nexus-line)] px-4 py-3 outline-none focus:border-[var(--nexus-coral)]" placeholder="Mínimo 8 caracteres" />
        </label>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
        <button disabled={submitting} className="mt-6 w-full rounded-xl bg-[var(--nexus-navy)] px-4 py-3 font-bold text-white transition hover:bg-[var(--nexus-ink)] disabled:cursor-wait disabled:opacity-60">
          {submitting ? 'Procesando...' : resetMode ? 'Enviar enlace' : mode === 'login' ? 'Entrar a Nexus' : 'Crear mi cuenta'}
        </button>
        {mode === 'login' && <button type="button" onClick={() => { setResetMode(!resetMode); setError(''); setMessage('') }} className="mt-4 w-full text-sm font-bold text-[var(--nexus-coral)]">{resetMode ? 'Volver a iniciar sesión' : '¿Olvidaste tu contraseña?'}</button>}
      </form>
    </section>
  )
}

function publicAppUrl() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}
