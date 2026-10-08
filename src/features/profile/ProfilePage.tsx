import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'

const profileSchema = z.object({
  username: z.string().trim().min(3, 'Usa al menos 3 caracteres.').max(30, 'Usa máximo 30 caracteres.').regex(/^[\p{L}\p{N} _-]+$/u, 'Usa letras, números, espacios, guion o guion bajo.'),
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

type ProfileTab = 'profile' | 'edit' | 'privacy' | 'groups'

type ProfilePost = {
  id: string
  body: string
  author_id: string
  created_at: string
  updated_at: string
}

type ProfileGroup = {
  group_id: string
  name: string
  description: string | null
  topic: string
  age_space: 'teen' | 'adult'
  member_role: 'owner' | 'member'
  joined_at: string
}

export function ProfilePage({ applicationMode = false }: { applicationMode?: boolean }) {
  const { user, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState<ProfileTab>(applicationMode ? 'edit' : 'profile')
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [schoolLevel, setSchoolLevel] = useState<'secundaria' | 'preparatoria' | 'universidad'>('universidad')
  const [schoolName, setSchoolName] = useState('')
  const [bio, setBio] = useState('')
  const [acceptsRequests, setAcceptsRequests] = useState(true)
  const [showGroupsPublic, setShowGroupsPublic] = useState(false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPath, setAvatarPath] = useState<string | null>(null)
  const [interests, setInterests] = useState<{ id: string; name: string }[]>([])
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [lookingFor, setLookingFor] = useState<string[]>([])
  const [otherLookingFor, setOtherLookingFor] = useState('')
  const [gpa, setGpa] = useState('')
  const [gradeFile, setGradeFile] = useState<File | null>(null)
  const [hasGradeVerification, setHasGradeVerification] = useState(false)
  const [blockedProfiles, setBlockedProfiles] = useState<{ id: string; username: string; full_name: string; avatar_path: string | null }[]>([])
  const [ownPosts, setOwnPosts] = useState<ProfilePost[]>([])
  const [ownGroups, setOwnGroups] = useState<ProfileGroup[]>([])
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [loadingProfile, setLoadingProfile] = useState(true)

  const avatarUrl = useMemo(() => {
    if (!avatarPath) return null
    return supabase.storage.from('avatars').getPublicUrl(avatarPath).data.publicUrl
  }, [avatarPath])

  useEffect(() => {
    let active = true

    async function loadProfile() {
      if (!user) {
        if (active) setLoadingProfile(false)
        return
      }

      const { data, error: loadError } = await supabase
        .from('profiles')
        .select('username, full_name, birth_date, school_level, school_name, bio, accepts_message_requests, show_groups_public, avatar_path, gpa')
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
        setShowGroupsPublic(Boolean(data.show_groups_public))
        setAvatarPath(data.avatar_path)
        setGpa(data.gpa?.toString() ?? '')
      } else {
        setFullName(String(user.user_metadata?.full_name ?? ''))
      }

      const requests = [
        supabase.from('interests').select('id, name').order('name'),
        supabase.from('profile_interests').select('interest_id').eq('profile_id', user.id),
        supabase.from('profile_looking_for').select('kind, other_text').eq('profile_id', user.id),
        supabase.from('grade_verifications').select('id').eq('profile_id', user.id).limit(1),
      ] as const

      const [interestResult, profileInterestResult, lookingForResult, gradeResult] = await Promise.all(requests)

      if (!active) return

      if (interestResult.data) setInterests(interestResult.data)
      if (profileInterestResult.data) setSelectedInterests(profileInterestResult.data.map((item) => item.interest_id))
      if (lookingForResult.data) {
        setLookingFor(lookingForResult.data.map((item) => item.kind))
        setOtherLookingFor(lookingForResult.data.find((item) => item.kind === 'other')?.other_text ?? '')
      }
      setHasGradeVerification(Boolean(gradeResult.data?.length))

      if (!applicationMode) {
        const [blockedResult, postsResult, groupsResult] = await Promise.all([
          supabase.rpc('list_blocked_profiles'),
          supabase.rpc('list_profile_posts', { target_profile: user.id, result_limit: 100 }),
          supabase.rpc('list_profile_groups', { target_profile: user.id }),
        ])

        if (!active) return

        if (blockedResult.data) setBlockedProfiles(blockedResult.data)
        if (postsResult.data) setOwnPosts(postsResult.data as ProfilePost[])
        if (groupsResult.data) setOwnGroups(groupsResult.data as ProfileGroup[])
      }

      setLoadingProfile(false)
    }

    void loadProfile()
    return () => {
      active = false
    }
  }, [applicationMode, user])

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback('')
    setError('')

    const result = profileSchema.safeParse({
      username,
      fullName,
      birthDate,
      schoolLevel,
      schoolName,
      bio,
      gpa: gpa ? Number(gpa) : null,
    })

    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Revisa los datos.')
      return
    }
    if (result.data.gpa === null) {
      setError('El promedio escolar es obligatorio para completar tu perfil.')
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
    if (!hasGradeVerification && !gradeFile) {
      setError('Debes subir una foto de tu boleta o comprobante de promedio.')
      return
    }

    const age = calculateAge(result.data.birthDate)
    if (age < 12) {
      setError('Nexus es para estudiantes de 12 años o más.')
      return
    }
    if (!user) {
      setError('No fue posible guardar el perfil en este momento.')
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
      show_groups_public: showGroupsPublic,
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
      const { error: avatarError } = await supabase.storage.from('avatars').upload(path, avatarFile, {
        upsert: true,
        contentType: avatarFile.type,
      })

      if (avatarError) {
        setError(avatarError.message)
        return
      }

      await supabase.from('profiles').update({ avatar_path: path }).eq('id', user.id)
      setAvatarPath(path)
      setAvatarFile(null)
    }

    await supabase.from('profile_interests').delete().eq('profile_id', user.id)
    const { error: interestError } = await supabase
      .from('profile_interests')
      .insert(selectedInterests.map((interestId) => ({ profile_id: user.id, interest_id: interestId })))

    if (interestError) {
      setError(interestError.message)
      return
    }

    await supabase.from('profile_looking_for').delete().eq('profile_id', user.id)
    const { error: lookingError } = await supabase
      .from('profile_looking_for')
      .insert(lookingFor.map((kind) => ({
        profile_id: user.id,
        kind,
        other_text: kind === 'other' ? otherLookingFor : null,
      })))

    if (lookingError) {
      setError(lookingError.message)
      return
    }

    if (gradeFile) {
      const extension = gradeFile.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      if (!['jpg', 'jpeg', 'png', 'webp'].includes(extension) || gradeFile.size > 5 * 1024 * 1024) {
        setError('La boleta debe ser JPG, PNG o WebP y pesar máximo 5 MB.')
        return
      }

      const verificationId = crypto.randomUUID()
      const path = `${user.id}/${verificationId}.${extension}`
      const { error: uploadError } = await supabase.storage.from('boletas').upload(path, gradeFile, { contentType: gradeFile.type })

      if (uploadError) {
        setError(uploadError.message)
        return
      }

      const { error: verificationError } = await supabase.from('grade_verifications').insert({
        id: verificationId,
        profile_id: user.id,
        gpa: result.data.gpa,
        image_path: path,
        status: 'pending',
      })

      if (verificationError) {
        setError(verificationError.message)
        return
      }

      setGradeFile(null)
      setHasGradeVerification(true)
    }

    if (applicationMode) {
      const { error: notifyError } = await supabase.functions.invoke('notify-signup', {
        body: { user_id: user.id },
      })

      if (notifyError) {
        setError('Tu solicitud se guardó, pero no pudimos enviar el aviso al administrador. Intenta guardar nuevamente en unos minutos.')
        return
      }

      setFeedback('Solicitud enviada. Queda pendiente de aprobación por el administrador de Nexus.')
    } else {
      setFeedback('Información actualizada correctamente.')
      setActiveTab('profile')
    }
  }

  async function savePrivacy() {
    if (!user) return
    setError('')
    setFeedback('')

    const { error: privacyError } = await supabase
      .from('profiles')
      .update({
        accepts_message_requests: acceptsRequests,
        show_groups_public: showGroupsPublic,
      })
      .eq('id', user.id)

    if (privacyError) {
      setError(privacyError.message)
      return
    }

    setFeedback('Preferencias de privacidad guardadas.')
  }

  async function unblockProfile(profileId: string) {
    if (!user) return
    setError('')

    const { error: unblockError } = await supabase
      .from('blocks')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', profileId)

    if (unblockError) {
      setError(unblockError.message)
      return
    }

    setBlockedProfiles((current) => current.filter((profile) => profile.id !== profileId))
    setFeedback('Usuario desbloqueado.')
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-xl py-12 text-center">
        <h1 className="font-display text-4xl font-bold text-[var(--nexus-navy)]">Perfil</h1>
        <p className="mt-4 text-[var(--nexus-muted)]">Inicia sesión para completar tu perfil.</p>
      </div>
    )
  }

  if (loadingProfile) {
    return <div className="mx-auto max-w-xl py-12 text-center text-sm font-semibold text-[var(--nexus-muted)]">Cargando tu perfil...</div>
  }

  return (
    <section className={applicationMode ? 'mx-auto max-w-3xl' : 'mx-auto max-w-5xl'}>
      {applicationMode ? (
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-bold text-[var(--nexus-navy)]">Completa tu solicitud de ingreso.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--nexus-muted)]">Estos datos se enviarán al administrador para revisar tu solicitud. Todo es obligatorio excepto el avatar y la bio.</p>
          </div>
          <button type="button" onClick={() => void signOut()} className="text-sm font-bold text-[var(--nexus-muted)] hover:text-[var(--nexus-navy)]">Cerrar sesión</button>
        </div>
      ) : (
        <ProfileHeader
          avatarUrl={avatarUrl}
          fullName={fullName}
          username={username}
          schoolName={schoolName}
          schoolLevel={schoolLevel}
          gpa={gpa}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onSignOut={() => void signOut()}
        />
      )}

      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {feedback && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{feedback}</p>}

      {(applicationMode || activeTab === 'edit') && (
        <form onSubmit={saveProfile} className="mt-6 grid gap-5 rounded-2xl border border-[var(--nexus-line)] bg-white p-6 shadow-sm sm:grid-cols-2 sm:p-8">
          {!applicationMode && (
            <div className="sm:col-span-2">
              <h2 className="font-display text-2xl font-bold text-[var(--nexus-navy)]">Editar información</h2>
              <p className="mt-1 text-sm text-[var(--nexus-muted)]">Esta sección solo la puedes ver tú.</p>
            </div>
          )}
          <Field label="Nombre de usuario · obligatorio"><input required value={username} onChange={(event) => setUsername(event.target.value)} className="input" placeholder="Tu nombre de usuario" /></Field>
          <Field label="Nombre completo · obligatorio"><input required value={fullName} onChange={(event) => setFullName(event.target.value)} className="input" placeholder="Tu nombre" /></Field>
          <Field label="Fecha de nacimiento · obligatorio"><input required value={birthDate} onChange={(event) => setBirthDate(event.target.value)} type="date" max={maximumBirthDate()} className="input" /></Field>
          <Field label="Nivel escolar · obligatorio"><select required value={schoolLevel} onChange={(event) => setSchoolLevel(event.target.value as typeof schoolLevel)} className="input"><option value="secundaria">Secundaria</option><option value="preparatoria">Preparatoria</option><option value="universidad">Universidad</option></select></Field>
          <Field label="Escuela · obligatorio"><input required value={schoolName} onChange={(event) => setSchoolName(event.target.value)} className="input" placeholder="Nombre de tu escuela" /></Field>
          <Field label="Bio · opcional"><textarea value={bio} onChange={(event) => setBio(event.target.value)} className="input min-h-28 resize-y" placeholder="Qué te interesa compartir..." /></Field>
          <Field label="Avatar · opcional"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)} className="input file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--nexus-mist)] file:px-3 file:py-2" />{avatarPath && <span className="mt-2 block text-xs font-normal text-[var(--nexus-muted)]">Avatar guardado</span>}</Field>
          <Field label="Promedio escolar · obligatorio"><input value={gpa} onChange={(event) => setGpa(event.target.value)} type="number" min="0" max="10" step="0.01" required className="input" placeholder="0 a 10" /></Field>
          <fieldset className="sm:col-span-2"><legend className="text-sm font-semibold text-[var(--nexus-ink)]">¿Qué buscas? · obligatorio</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{lookingForOptions.map((option) => <label key={option.value} className="flex items-center gap-3 text-sm text-[var(--nexus-muted)]"><input type="checkbox" checked={lookingFor.includes(option.value)} onChange={(event) => setLookingFor((current) => event.target.checked ? [...current, option.value] : current.filter((value) => value !== option.value))} className="h-4 w-4 accent-[var(--nexus-coral)]" />{option.label}</label>)}</div>{lookingFor.includes('other') && <input value={otherLookingFor} onChange={(event) => setOtherLookingFor(event.target.value)} className="input" placeholder="Cuéntanos qué buscas" />}</fieldset>
          <fieldset className="sm:col-span-2"><legend className="text-sm font-semibold text-[var(--nexus-ink)]">Intereses · obligatorio</legend><div className="mt-2 flex flex-wrap gap-2">{interests.length ? interests.map((interest) => <label key={interest.id} className={`cursor-pointer rounded-full border px-3 py-2 text-sm ${selectedInterests.includes(interest.id) ? 'border-[var(--nexus-coral)] bg-orange-50 text-[var(--nexus-coral)]' : 'border-[var(--nexus-line)] text-[var(--nexus-muted)]'}`}><input type="checkbox" className="sr-only" checked={selectedInterests.includes(interest.id)} onChange={(event) => setSelectedInterests((current) => event.target.checked ? [...current, interest.id] : current.filter((id) => id !== interest.id))} />{interest.name}</label>) : <p className="text-sm text-[var(--nexus-muted)]">Aún no hay intereses configurados.</p>}</div></fieldset>
          <Field label="Foto de boleta/comprobante · obligatorio"><input type="file" accept="image/jpeg,image/png,image/webp" required={!hasGradeVerification} onChange={(event) => setGradeFile(event.target.files?.[0] ?? null)} className="input file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--nexus-mist)] file:px-3 file:py-2" /><span className="mt-2 block text-xs font-normal text-[var(--nexus-muted)]">{hasGradeVerification ? 'Comprobante ya enviado. Puedes subir uno nuevo si deseas actualizarlo.' : 'Debes subirlo para completar el acceso. Tu comprobante se mantiene privado.'}</span></Field>
          <button className="rounded-xl bg-[var(--nexus-coral)] px-4 py-3 font-bold text-white hover:bg-[#d95a42] sm:col-span-2">{applicationMode ? 'Enviar solicitud de ingreso' : 'Guardar información'}</button>
        </form>
      )}

      {!applicationMode && activeTab === 'profile' && (
        <section className="mt-6">
          <div className="mb-4">
            <h2 className="font-display text-2xl font-bold text-[var(--nexus-navy)]">Publicaciones</h2>
            <p className="mt-1 text-sm text-[var(--nexus-muted)]">Tus publicaciones son visibles para todos los usuarios aprobados de Nexus, salvo bloqueos.</p>
          </div>
          <div className="space-y-4">
            {ownPosts.length ? ownPosts.map((post) => (
              <article key={post.id} className="rounded-xl border border-[var(--nexus-line)] bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  {avatarUrl ? <img src={avatarUrl} alt="" className="h-11 w-11 rounded-lg object-cover" /> : <div className="grid h-11 w-11 place-items-center rounded-lg bg-[var(--nexus-mist)] font-bold text-[var(--nexus-navy)]">{(fullName || 'N').charAt(0).toUpperCase()}</div>}
                  <div>
                    <p className="font-bold text-[#315f8c]">{fullName}</p>
                    <time className="text-xs text-[var(--nexus-muted)]">{new Date(post.created_at).toLocaleString('es-MX')}</time>
                  </div>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-[var(--nexus-ink)]">{post.body}</p>
              </article>
            )) : <div className="rounded-xl border border-dashed border-[var(--nexus-line)] bg-white p-8 text-center text-sm text-[var(--nexus-muted)]">Todavía no tienes publicaciones.</div>}
          </div>
        </section>
      )}

      {!applicationMode && activeTab === 'privacy' && (
        <section className="mt-6 space-y-5">
          <div className="rounded-2xl border border-[var(--nexus-line)] bg-white p-6 shadow-sm sm:p-8">
            <h2 className="font-display text-2xl font-bold text-[var(--nexus-navy)]">Privacidad</h2>
            <p className="mt-2 text-sm text-[var(--nexus-muted)]">Controla cómo pueden interactuar los demás contigo y qué partes de tu perfil pueden consultar.</p>

            <div className="mt-6 space-y-4">
              <PrivacyToggle
                checked={acceptsRequests}
                onChange={setAcceptsRequests}
                title="Aceptar solicitudes de mensaje"
                description="Si lo desactivas, otros usuarios no podrán enviarte nuevas solicitudes de chat."
              />
              <PrivacyToggle
                checked={showGroupsPublic}
                onChange={setShowGroupsPublic}
                title="Mostrar mis grupos en mi perfil"
                description="Si lo activas, otros usuarios podrán ver los grupos tuyos que también sean accesibles para su rango de edad."
              />
            </div>

            <button type="button" onClick={() => void savePrivacy()} className="mt-6 rounded-xl bg-[var(--nexus-navy)] px-5 py-3 text-sm font-bold text-white">Guardar privacidad</button>
          </div>

          <div className="rounded-2xl border border-[var(--nexus-line)] bg-white p-6 shadow-sm sm:p-8">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--nexus-coral)]">Privacidad</p>
            <h3 className="mt-2 font-display text-2xl font-bold text-[var(--nexus-navy)]">Usuarios bloqueados</h3>
            <p className="mt-2 text-sm text-[var(--nexus-muted)]">Puedes desbloquearlos en cualquier momento.</p>
            <div className="mt-5 grid gap-3">
              {blockedProfiles.length ? blockedProfiles.map((profile) => (
                <div key={profile.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--nexus-paper)] p-4">
                  <div>
                    <p className="font-bold text-[var(--nexus-navy)]">{profile.full_name}</p>
                    <p className="text-sm text-[var(--nexus-muted)]">@{profile.username}</p>
                  </div>
                  <button type="button" onClick={() => void unblockProfile(profile.id)} className="rounded-lg bg-[var(--nexus-navy)] px-4 py-2 text-sm font-bold text-white">Desbloquear</button>
                </div>
              )) : <p className="rounded-xl border border-dashed border-[var(--nexus-line)] p-5 text-sm text-[var(--nexus-muted)]">No tienes usuarios bloqueados.</p>}
            </div>
          </div>
        </section>
      )}

      {!applicationMode && activeTab === 'groups' && (
        <section className="mt-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold text-[var(--nexus-navy)]">Mis grupos</h2>
              <p className="mt-1 text-sm text-[var(--nexus-muted)]">{showGroupsPublic ? 'Actualmente permites que otros usuarios vean tus grupos accesibles.' : 'Actualmente tus grupos son privados en tu perfil.'}</p>
            </div>
            <button type="button" onClick={() => setActiveTab('privacy')} className="rounded-lg border border-[var(--nexus-line)] bg-white px-4 py-2 text-sm font-bold text-[var(--nexus-navy)]">Cambiar privacidad</button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {ownGroups.length ? ownGroups.map((group) => (
              <Link key={group.group_id} to={`/groups/${group.group_id}`} className="rounded-xl border border-[var(--nexus-line)] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-lg font-bold text-[var(--nexus-navy)]">{group.name}</h3>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-[#315f8c]">{group.topic}</p>
                  </div>
                  <span className="rounded-full bg-[var(--nexus-mist)] px-2.5 py-1 text-xs font-bold text-[var(--nexus-navy)]">{group.member_role === 'owner' ? 'Administrador' : 'Miembro'}</span>
                </div>
                {group.description && <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--nexus-muted)]">{group.description}</p>}
              </Link>
            )) : <div className="rounded-xl border border-dashed border-[var(--nexus-line)] bg-white p-8 text-center text-sm text-[var(--nexus-muted)] md:col-span-2">Todavía no perteneces a ningún grupo.</div>}
          </div>
        </section>
      )}
    </section>
  )
}

function ProfileHeader({
  avatarUrl,
  fullName,
  username,
  schoolName,
  schoolLevel,
  gpa,
  activeTab,
  onTabChange,
  onSignOut,
}: {
  avatarUrl: string | null
  fullName: string
  username: string
  schoolName: string
  schoolLevel: string
  gpa: string
  activeTab: ProfileTab
  onTabChange: (tab: ProfileTab) => void
  onSignOut: () => void
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[var(--nexus-line)] bg-white shadow-sm">
      <div className="relative h-44 bg-[linear-gradient(125deg,#173a57_0%,#264f6c_42%,#7da1b5_100%)] sm:h-52">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_18%_30%,white_0,transparent_26%),radial-gradient(circle_at_82%_15%,white_0,transparent_18%)]" />
      </div>
      <div className="relative px-5 sm:px-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-end gap-4">
            <div className="-mt-14 shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-28 w-28 rounded-xl border-4 border-white object-cover shadow-md sm:h-32 sm:w-32" />
              ) : (
                <div className="grid h-28 w-28 place-items-center rounded-xl border-4 border-white bg-[var(--nexus-mist)] font-display text-4xl font-bold text-[var(--nexus-navy)] shadow-md sm:h-32 sm:w-32">{(fullName || username || 'N').charAt(0).toUpperCase()}</div>
              )}
            </div>
            <div className="min-w-0 pb-3">
              <h1 className="truncate font-display text-3xl font-bold text-[var(--nexus-navy)]">{fullName || 'Tu perfil'}</h1>
              <p className="mt-1 text-sm text-[var(--nexus-muted)]">{username ? `@${username}` : 'Completa tu nombre de usuario'}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-[var(--nexus-muted)]">
                {schoolName && <span>🎓 {schoolName}</span>}
                <span className="capitalize">📚 {schoolLevel}</span>
                {gpa && <span>★ Promedio {gpa}</span>}
              </div>
            </div>
          </div>
          <button type="button" onClick={onSignOut} className="mb-4 rounded-lg border border-[var(--nexus-line)] bg-white px-4 py-2 text-sm font-bold text-[var(--nexus-muted)] hover:bg-slate-50">Cerrar sesión</button>
        </div>

        <nav className="mt-1 flex gap-1 overflow-x-auto border-t border-[var(--nexus-line)]">
          <TabButton active={activeTab === 'profile'} onClick={() => onTabChange('profile')}>Perfil</TabButton>
          <TabButton active={activeTab === 'edit'} onClick={() => onTabChange('edit')}>Editar información</TabButton>
          <TabButton active={activeTab === 'privacy'} onClick={() => onTabChange('privacy')}>Privacidad</TabButton>
          <TabButton active={activeTab === 'groups'} onClick={() => onTabChange('groups')}>Grupos</TabButton>
        </nav>
      </div>
    </article>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`whitespace-nowrap px-4 py-3 text-sm font-bold ${active ? 'border-b-3 border-[#315f8c] text-[#315f8c]' : 'text-[var(--nexus-muted)] hover:bg-slate-50'}`}>{children}</button>
}

function PrivacyToggle({ checked, onChange, title, description }: { checked: boolean; onChange: (value: boolean) => void; title: string; description: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-[var(--nexus-line)] p-4">
      <div>
        <p className="font-bold text-[var(--nexus-navy)]">{title}</p>
        <p className="mt-1 text-sm leading-6 text-[var(--nexus-muted)]">{description}</p>
      </div>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[#315f8c]" />
    </label>
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
