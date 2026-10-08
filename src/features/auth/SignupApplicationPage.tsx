import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Interest = { id: string; name: string }
type LookingKind = 'friends' | 'projects' | 'study_groups' | 'other'

const lookingOptions: { value: LookingKind; label: string }[] = [
  { value: 'friends', label: 'Amigos' },
  { value: 'projects', label: 'Proyectos' },
  { value: 'study_groups', label: 'Grupos de estudio' },
  { value: 'other', label: 'Otro' },
]

export function SignupApplicationPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const userId = params.get('uid') ?? ''
  const applicationToken = params.get('token') ?? ''
  const initialName = params.get('name') ?? ''

  const [interests, setInterests] = useState<Interest[]>([])
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState(initialName)
  const [birthDate, setBirthDate] = useState('')
  const [schoolLevel, setSchoolLevel] = useState<'secundaria' | 'preparatoria' | 'universidad'>('preparatoria')
  const [schoolName, setSchoolName] = useState('')
  const [bio, setBio] = useState('')
  const [gpa, setGpa] = useState('')
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [lookingFor, setLookingFor] = useState<LookingKind[]>([])
  const [otherLookingFor, setOtherLookingFor] = useState('')
  const [acceptsRequests, setAcceptsRequests] = useState(true)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [gradeFile, setGradeFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true

    async function loadInterests() {
      const { data, error: interestError } = await supabase.rpc('list_signup_interests')
      if (!active) return
      if (interestError) setError('No pudimos cargar los intereses. Actualiza la página e intenta otra vez.')
      else setInterests((data ?? []) as Interest[])
    }

    void loadInterests()
    return () => {
      active = false
    }
  }, [])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!userId || !applicationToken) {
      setError('Este enlace para completar la solicitud no es válido.')
      return
    }
    if (username.trim().length < 3) {
      setError('El nombre de usuario debe tener al menos 3 caracteres.')
      return
    }
    if (fullName.trim().length < 2) {
      setError('Escribe tu nombre completo.')
      return
    }
    if (!birthDate || calculateAge(birthDate) < 12) {
      setError('Nexus es para estudiantes de 12 años o más.')
      return
    }
    if (schoolName.trim().length < 2) {
      setError('Escribe el nombre de tu escuela.')
      return
    }
    const numericGpa = Number(gpa)
    if (!Number.isFinite(numericGpa) || numericGpa < 0 || numericGpa > 10) {
      setError('Escribe un promedio válido entre 0 y 10.')
      return
    }
    if (!selectedInterests.length) {
      setError('Selecciona al menos un interés.')
      return
    }
    if (!lookingFor.length) {
      setError('Selecciona al menos una opción en “¿Qué buscas?”.')
      return
    }
    if (lookingFor.includes('other') && !otherLookingFor.trim()) {
      setError('Escribe qué buscas en la opción “Otro”.')
      return
    }
    if (!gradeFile) {
      setError('Debes subir una foto de tu boleta o comprobante de promedio.')
      return
    }

    setSubmitting(true)

    try {
      const gradePayload = await fileToPayload(gradeFile)
      const avatarPayload = avatarFile ? await fileToPayload(avatarFile) : null

      const { data, error: submitError } = await supabase.functions.invoke('submit-signup-application', {
        body: {
          user_id: userId,
          application_token: applicationToken,
          username: username.trim(),
          full_name: fullName.trim(),
          birth_date: birthDate,
          school_level: schoolLevel,
          school_name: schoolName.trim(),
          bio: bio.trim(),
          accepts_message_requests: acceptsRequests,
          gpa: numericGpa,
          interests: selectedInterests,
          looking_for: lookingFor.map((kind) => ({
            kind,
            other_text: kind === 'other' ? otherLookingFor.trim() : null,
          })),
          grade_file: gradePayload,
          avatar_file: avatarPayload,
        },
      })

      if (submitError || !data?.ok) {
        const code = String(data?.error ?? submitError?.message ?? '')
        if (code.includes('EXPIRED')) setError('El enlace para completar tu solicitud ya venció. Pide al administrador uno nuevo.')
        else if (code.includes('INVALID_APPLICATION_LINK')) setError('El enlace para completar tu solicitud no es válido.')
        else if (code.includes('PROFILE_SAVE_FAILED')) setError('Ese nombre de usuario puede estar ocupado. Prueba con otro.')
        else setError('No pudimos guardar la solicitud. Revisa los datos e intenta nuevamente.')
        return
      }

      setDone(true)
    } catch {
      setError('No pudimos preparar los archivos. Usa imágenes JPG, PNG o WebP de máximo 5 MB.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--nexus-paper)] px-5 py-10">
        <section className="w-full max-w-xl rounded-3xl border border-[var(--nexus-line)] bg-white p-8 text-center shadow-xl shadow-slate-200/60">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--nexus-coral)]">Nexus · solicitud</p>
          <h1 className="mt-4 font-display text-4xl font-bold text-[var(--nexus-navy)]">Solicitud completada</h1>
          <p className="mt-5 leading-7 text-[var(--nexus-muted)]">
            Tus datos ya fueron enviados para revisión. Si tu correo todavía no está confirmado, aún debes verificarlo antes de poder iniciar sesión normalmente.
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
    <main className="min-h-screen bg-[var(--nexus-paper)] px-5 py-10">
      <section className="mx-auto max-w-4xl">
        <div className="mb-7">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--nexus-coral)]">Nexus · solicitud de ingreso</p>
          <h1 className="mt-3 font-display text-4xl font-bold text-[var(--nexus-navy)]">Completa tu perfil</h1>
          <p className="mt-3 max-w-2xl leading-7 text-[var(--nexus-muted)]">
            Puedes llenar esta solicitud aunque tu correo todavía esté pendiente de confirmación. Confirmar el correo no aprueba tu cuenta; la aprobación la realiza un administrador de Nexus.
          </p>
        </div>

        <form onSubmit={submit} className="grid gap-5 rounded-3xl border border-[var(--nexus-line)] bg-white p-6 shadow-xl shadow-slate-200/50 sm:grid-cols-2 sm:p-8">
          <Field label="Nombre de usuario · obligatorio">
            <input required value={username} onChange={(event) => setUsername(event.target.value)} className="input" placeholder="Tu nombre de usuario" />
          </Field>

          <Field label="Nombre completo · obligatorio">
            <input required value={fullName} onChange={(event) => setFullName(event.target.value)} className="input" placeholder="Tu nombre completo" />
          </Field>

          <Field label="Fecha de nacimiento · obligatorio">
            <input required type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} max={maximumBirthDate()} className="input" />
          </Field>

          <Field label="Nivel escolar · obligatorio">
            <select value={schoolLevel} onChange={(event) => setSchoolLevel(event.target.value as typeof schoolLevel)} className="input">
              <option value="secundaria">Secundaria</option>
              <option value="preparatoria">Preparatoria</option>
              <option value="universidad">Universidad</option>
            </select>
          </Field>

          <Field label="Escuela · obligatorio">
            <input required value={schoolName} onChange={(event) => setSchoolName(event.target.value)} className="input" placeholder="Nombre de tu escuela" />
          </Field>

          <Field label="Promedio escolar · obligatorio">
            <input required type="number" min="0" max="10" step="0.01" value={gpa} onChange={(event) => setGpa(event.target.value)} className="input" placeholder="0 a 10" />
          </Field>

          <Field label="Bio · opcional">
            <textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={500} className="input min-h-28 resize-y" placeholder="Cuéntanos un poco de ti" />
          </Field>

          <Field label="Avatar · opcional">
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)} className="input" />
          </Field>

          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-semibold text-[var(--nexus-ink)]">Intereses · obligatorio</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {interests.map((interest) => (
                <label key={interest.id} className={`cursor-pointer rounded-full border px-3 py-2 text-sm ${
                  selectedInterests.includes(interest.id)
                    ? 'border-[var(--nexus-coral)] bg-orange-50 text-[var(--nexus-coral)]'
                    : 'border-[var(--nexus-line)] text-[var(--nexus-muted)]'
                }`}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={selectedInterests.includes(interest.id)}
                    onChange={(event) => setSelectedInterests((current) =>
                      event.target.checked ? [...current, interest.id] : current.filter((id) => id !== interest.id)
                    )}
                  />
                  {interest.name}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-semibold text-[var(--nexus-ink)]">¿Qué buscas? · obligatorio</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {lookingOptions.map((option) => (
                <label key={option.value} className="flex items-center gap-3 text-sm text-[var(--nexus-muted)]">
                  <input
                    type="checkbox"
                    checked={lookingFor.includes(option.value)}
                    onChange={(event) => setLookingFor((current) =>
                      event.target.checked ? [...current, option.value] : current.filter((value) => value !== option.value)
                    )}
                    className="h-4 w-4 accent-[var(--nexus-coral)]"
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {lookingFor.includes('other') && (
              <input value={otherLookingFor} onChange={(event) => setOtherLookingFor(event.target.value)} className="input" placeholder="Escribe qué buscas" />
            )}
          </fieldset>

          <label className="flex items-center gap-3 rounded-xl border border-[var(--nexus-line)] p-4 text-sm font-semibold text-[var(--nexus-ink)] sm:col-span-2">
            <input type="checkbox" checked={acceptsRequests} onChange={(event) => setAcceptsRequests(event.target.checked)} className="h-5 w-5 accent-[#315f8c]" />
            Aceptar solicitudes de mensaje cuando mi cuenta sea aprobada
          </label>

          <Field label="Boleta o comprobante de promedio · obligatorio">
            <input required type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setGradeFile(event.target.files?.[0] ?? null)} className="input" />
            <span className="mt-2 block text-xs font-normal text-[var(--nexus-muted)]">JPG, PNG o WebP · máximo 5 MB. Se mantiene privado.</span>
          </Field>

          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">{error}</p>}

          <button disabled={submitting} className="rounded-xl bg-[var(--nexus-coral)] px-4 py-3 font-bold text-white disabled:opacity-60 sm:col-span-2">
            {submitting ? 'Enviando solicitud...' : 'Enviar solicitud de ingreso'}
          </button>
        </form>
      </section>
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-semibold text-[var(--nexus-ink)]">{label}{children}</label>
}

async function fileToPayload(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error('Invalid file')
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)))
  }

  return {
    mime: file.type,
    base64: btoa(binary),
  }
}

function calculateAge(birthDate: string) {
  const birth = new Date(`${birthDate}T00:00:00`)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const beforeBirthday =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  if (beforeBirthday) age -= 1
  return age
}

function maximumBirthDate() {
  const date = new Date()
  date.setFullYear(date.getFullYear() - 12)
  return date.toISOString().slice(0, 10)
}
