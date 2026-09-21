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
  gpa: z.number().min(0).max(10).nullable(),
})

const lookingForOptions = [
  { value: 'friends', label: 'Amigos' },
  { value: 'projects', label: 'Proyectos' },
  { value: 'study_groups', label: 'Grupos de estudio' },
  { value: 'other', label: 'Otro' },
] as const

export function ProfilePage() {
  const { user, configured, signOut } = useAuth()
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [schoolLevel, setSchoolLevel] = useState<'secundaria' | 'preparatoria' | 'universidad'>('universidad')
  const [schoolName, setSchoolName] = useState('')
  const [bio, setBio] = useState('')
  const [acceptsRequests, setAcceptsRequests] = useState(true)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPath, setAvatarPath] = useState<string | null>(null)
  const [interests, setInterests] = useState<{ id: string; name: string }[]>([])
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [lookingFor, setLookingFor] = useState<string[]>([])
  const [otherLookingFor, setOtherLookingFor] = useState('')
  const [gpa, setGpa] = useState('')
  const [gradeFile, setGradeFile] = useState<File | null>(null)
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
        .select('username, full_name, birth_date, school_level, school_name, bio, accepts_message_requests, avatar_path, gpa')
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
        setAvatarPath(data.avatar_path)
        setGpa(data.gpa?.toString() ?? '')
      }
      const [{ data: interestData }, { data: profileInterestData }, { data: lookingForData }] = await Promise.all([
        supabase.from('interests').select('id, name').order('name'),
        supabase.from('profile_interests').select('interest_id').eq('profile_id', user.id),
        supabase.from('profile_looking_for').select('kind, other_text').eq('profile_id', user.id),
      ])
      if (interestData) setInterests(interestData)
      if (profileInterestData) setSelectedInterests(profileInterestData.map((item) => item.interest_id))
      if (lookingForData) {
        setLookingFor(lookingForData.map((item) => item.kind))
        setOtherLookingFor(lookingForData.find((item) => item.kind === 'other')?.other_text ?? '')
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
    const result = profileSchema.safeParse({ username, fullName, birthDate, schoolLevel, schoolName, bio, gpa: gpa ? Number(gpa) : null })
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
      gpa: result.data.gpa,
    })
    if (saveError) {
      setError(saveError.message)
      return
    }
    if (avatarFile) {
      const extension = avatarFile.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      if (!['jpg', 'jpeg', 'png', 'webp'].includes(extension) || avatarFile.size > 5 * 1024 * 1024) {
        setError('El avatar debe ser JPG, PNG o WebP y pesar máximo 5 MB.')
        return
      }
      const path = `${user.id}/avatar.${extension}`
      const { error: avatarError } = await supabase.storage.from('avatars').upload(path, avatarFile, { upsert: true, contentType: avatarFile.type })
      if (avatarError) { setError(avatarError.message); return }
      await supabase.from('profiles').update({ avatar_path: path }).eq('id', user.id)
      setAvatarPath(path)
    }
    await supabase.from('profile_interests').delete().eq('profile_id', user.id)
    if (selectedInterests.length) {
      const { error: interestError } = await supabase.from('profile_interests').insert(selectedInterests.map((interestId) => ({ profile_id: user.id, interest_id: interestId })))
      if (interestError) { setError(interestError.message); return }
    }
    await supabase.from('profile_looking_for').delete().eq('profile_id', user.id)
    if (lookingFor.length) {
      const { error: lookingError } = await supabase.from('profile_looking_for').insert(lookingFor.map((kind) => ({ profile_id: user.id, kind, other_text: kind === 'other' ? otherLookingFor : null })))
      if (lookingError) { setError(lookingError.message); return }
    }
    if (gradeFile) {
      const extension = gradeFile.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      if (!['jpg', 'jpeg', 'png', 'webp'].includes(extension) || gradeFile.size > 5 * 1024 * 1024 || !result.data.gpa) {
        setError('La boleta debe ser JPG, PNG o WebP, pesar máximo 5 MB y tener un promedio válido.')
        return
      }
      const verificationId = crypto.randomUUID()
      const path = `${user.id}/${verificationId}.${extension}`
      const { error: uploadError } = await supabase.storage.from('boletas').upload(path, gradeFile, { contentType: gradeFile.type })
      if (uploadError) { setError(uploadError.message); return }
      const { error: verificationError } = await supabase.from('grade_verifications').insert({ id: verificationId, profile_id: user.id, gpa: result.data.gpa, image_path: path, status: 'pending' })
      if (verificationError) { setError(verificationError.message); return }
      setGradeFile(null)
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
        <Field label="Avatar"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)} className="input file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--nexus-mist)] file:px-3 file:py-2" />{avatarPath && <span className="mt-2 block text-xs font-normal text-[var(--nexus-muted)]">Avatar guardado</span>}</Field>
        <Field label="Promedio escolar"><input value={gpa} onChange={(event) => setGpa(event.target.value)} type="number" min="0" max="10" step="0.01" className="input" placeholder="0 a 10" /></Field>
        <fieldset className="sm:col-span-2"><legend className="text-sm font-semibold text-[var(--nexus-ink)]">¿Qué buscas?</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{lookingForOptions.map((option) => <label key={option.value} className="flex items-center gap-3 text-sm text-[var(--nexus-muted)]"><input type="checkbox" checked={lookingFor.includes(option.value)} onChange={(event) => setLookingFor((current) => event.target.checked ? [...current, option.value] : current.filter((value) => value !== option.value))} className="h-4 w-4 accent-[var(--nexus-coral)]" />{option.label}</label>)}</div>{lookingFor.includes('other') && <input value={otherLookingFor} onChange={(event) => setOtherLookingFor(event.target.value)} className="input" placeholder="Cuéntanos qué buscas" />}</fieldset>
        <fieldset className="sm:col-span-2"><legend className="text-sm font-semibold text-[var(--nexus-ink)]">Intereses</legend><div className="mt-2 flex flex-wrap gap-2">{interests.length ? interests.map((interest) => <label key={interest.id} className={`cursor-pointer rounded-full border px-3 py-2 text-sm ${selectedInterests.includes(interest.id) ? 'border-[var(--nexus-coral)] bg-orange-50 text-[var(--nexus-coral)]' : 'border-[var(--nexus-line)] text-[var(--nexus-muted)]'}`}><input type="checkbox" className="sr-only" checked={selectedInterests.includes(interest.id)} onChange={(event) => setSelectedInterests((current) => event.target.checked ? [...current, interest.id] : current.filter((id) => id !== interest.id))} />{interest.name}</label>) : <p className="text-sm text-[var(--nexus-muted)]">Aún no hay intereses configurados.</p>}</div></fieldset>
        <Field label="Foto de boleta para verificación"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setGradeFile(event.target.files?.[0] ?? null)} className="input file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--nexus-mist)] file:px-3 file:py-2" /><span className="mt-2 block text-xs font-normal text-[var(--nexus-muted)]">Se guarda en un bucket privado y queda pendiente de moderación.</span></Field>
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