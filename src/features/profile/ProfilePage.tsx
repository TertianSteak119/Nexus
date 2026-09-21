import { useEffect, useState } from 'react'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'

const profileSchema = z.object({
  username: z.string().regex(/^[a-z0-9_]{3,30}$/, 'Usa 3-30 caracteres: minúsculas, números o guion bajo.'),
  fullName: z.string().trim().min(2, 'Escribe tu nombre completo.').max(80),
  birthDate: z.string().min(1, 'Selecciona tu fecha de nacimiento.'),
  schoolLevel: z.enum(['secundaria', 'preparatoria', 'universidad']),
  schoolName: z.string().trim().min(2, 'Escribe tu escuela.').max(120),
  bio: z.string().max(500, 'La bio no puede superar 500 caracteres.'),
})

export function ProfilePage() {
  const { user, configured, signOut } = useAuth()
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [schoolLevel, setSchoolLevel] = useState<'secundaria' | 'preparatoria' | 'universidad'>('universidad')
  const [schoolName, setSchoolName] = useState('')
  const [bio, setBio] = useState('')
  const [acceptsRequests, setAcceptsRequests] = useState(true)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [loadingProfile, setLoadingProfile] = useState(true)

  useEffect(() => {
    let active = true

    async function loadProfile() {
      if (!user || !supabase) {
        if (active) setLoadingProfile(false)
        return
      }

      const { data, error: loadError } = await supabase
        .from('profiles')
        .select('username, full_name, birth_date, school_level, school_name, bio, accepts_message_requests')
        .eq('id', user.id)
        .maybeSingle()

      if (!active) return
      if (loadError) {
        setError(loadError.message)
      } else if (data) {
        setUsername(data.username)
        setFullName(data.full_name)
        setBirthDate(data.birth_date)
        setSchoolLevel(data.school_level)
        setSchoolName(data.school_name)
        setBio(data.bio ?? '')
        setAcceptsRequests(data.accepts_message_requests)
      }
      setLoadingProfile(false)
    }

    void loadProfile()
    return () => {
      active = false
    }
  }, [user])

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback('')
    setError('')
    const result = profileSchema.safeParse({ username, fullName, birthDate, schoolLevel, schoolName, bio })
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Revisa los datos.')
      return
    }
    const age = calculateAge(result.data.birthDate)
    if (age < 12) {
      setError('Nexus es para estudiantes de 12 años o más.')
      return
    }
    if (!supabase || !user) {
      setError('Necesitas una sesión activa y Supabase configurado para guardar el perfil.')
      return
    }
    const { error: saveError } = await supabase.from('profiles').upsert({
      id: user.id,
      username: result.data.username,
      full_name: result.data.fullName,
      birth_date: result.data.birthDate,
      school_level: result.data.schoolLevel,
      school_name: result.data.schoolName,
      bio: result.data.bio || null,
      accepts_message_requests: acceptsRequests,
    })
    if (saveError) {
      setError(saveError.message)
      return
    }
    setFeedback('Perfil guardado correctamente.')
  }

  if (!user) {
    return <div className="mx-auto max-w-xl py-12 text-center"><h1 className="font-display text-4xl font-bold text-[var(--nexus-navy)]">Perfil</h1><p className="mt-4 text-[var(--nexus-muted)]">Inicia sesión para completar tu perfil.</p></div>
  }

  if (loadingProfile) {
    return <div className="mx-auto max-w-xl py-12 text-center text-sm font-semibold text-[var(--nexus-muted)]">Cargando tu perfil...</div>
  }

  return (
    <section className="mx-auto max-w-3xl">
      <div className="flex items-end justify-between gap-4">
        <div><p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--nexus-coral)]">Fase 2 · onboarding</p><h1 className="mt-3 font-display text-4xl font-bold text-[var(--nexus-navy)]">Cuéntanos de ti.</h1></div>
        <button type="button" onClick={() => void signOut()} className="text-sm font-bold text-[var(--nexus-muted)] hover:text-[var(--nexus-navy)]">Cerrar sesión</button>
      </div>
      <form onSubmit={saveProfile} className="mt-8 grid gap-5 rounded-3xl border border-[var(--nexus-line)] bg-white p-6 shadow-xl shadow-slate-200/60 sm:grid-cols-2 sm:p-8">
        <Field label="Username"><input value={username} onChange={(event) => setUsername(event.target.value)} className="input" placeholder="tu_usuario" /></Field>
        <Field label="Nombre completo"><input value={fullName} onChange={(event) => setFullName(event.target.value)} className="input" placeholder="Tu nombre" /></Field>
        <Field label="Fecha de nacimiento"><input value={birthDate} onChange={(event) => setBirthDate(event.target.value)} type="date" max={maximumBirthDate()} className="input" aria-describedby="birth-date-help" /><span id="birth-date-help" className="mt-2 block text-xs font-normal text-[var(--nexus-muted)]">Puedes editarla. Debes tener al menos 12 años.</span></Field>
        <Field label="Nivel escolar"><select value={schoolLevel} onChange={(event) => setSchoolLevel(event.target.value as typeof schoolLevel)} className="input"><option value="secundaria">Secundaria</option><option value="preparatoria">Preparatoria</option><option value="universidad">Universidad</option></select></Field>
        <Field label="Escuela"><input value={schoolName} onChange={(event) => setSchoolName(event.target.value)} className="input" placeholder="Nombre de tu escuela" /></Field>
        <Field label="Bio"><textarea value={bio} onChange={(event) => setBio(event.target.value)} className="input min-h-28 resize-y" placeholder="Qué te interesa compartir..." /></Field>
        <label className="flex items-center gap-3 text-sm font-semibold text-[var(--nexus-ink)] sm:col-span-2"><input checked={acceptsRequests} onChange={(event) => setAcceptsRequests(event.target.checked)} type="checkbox" className="h-5 w-5 accent-[var(--nexus-coral)]" />Recibir solicitudes de mensaje</label>
        {!configured && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 sm:col-span-2">Supabase está desconectado: puedes revisar el formulario, pero el guardado requiere `.env`.</p>}
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">{error}</p>}
        {feedback && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 sm:col-span-2">{feedback}</p>}
        <button className="rounded-xl bg-[var(--nexus-coral)] px-4 py-3 font-bold text-white hover:bg-[#d95a42] sm:col-span-2">Guardar perfil</button>
      </form>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-semibold text-[var(--nexus-ink)]">{label}{children}</label>
}

function calculateAge(birthDate: string) {
  const birth = new Date(`${birthDate}T00:00:00`)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const beforeBirthday = today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  if (beforeBirthday) age -= 1
  return age
}

function maximumBirthDate() {
  const date = new Date()
  date.setFullYear(date.getFullYear() - 12)
  return date.toISOString().slice(0, 10)
}