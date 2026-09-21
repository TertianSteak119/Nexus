# Nexus — Especificación para el agente de programación

Red social para estudiantes (secundaria a universidad), estilo Facebook. Proyecto personal de práctica. Trabaja **fase por fase, en orden**; no avances a la siguiente fase sin cumplir los criterios de aceptación de la actual.

---

## 1. Stack

- **Frontend:** Vite + React + TypeScript, Tailwind CSS, diseño **mobile first**
- **Librerías:** React Router, TanStack Query, react-hook-form + zod, `@supabase/supabase-js`
- **Backend:** Supabase (Auth, Postgres, Realtime, Storage, Edge Functions)
- **Correo:** Resend desde una Edge Function (requiere dominio verificado; ver pendientes)
- **Deploy frontend:** Vercel
- **Migraciones:** Supabase CLI, todo el esquema versionado en `supabase/migrations/`. Nada de cambios manuales en el dashboard.

## 2. Reglas no negociables

1. **Dos espacios de edad separados: `teen` (12–17) y `adult` (18+).** No se encimen ni se mezclen.
   - Se calcula a partir de `birth_date`, nunca lo elige el usuario. Al cumplir 18 el usuario pasa automáticamente a `adult` (usar una función/vista que lo calcule, no un valor fijo).
   - Búsqueda, sugerencias, feed, perfiles, solicitudes de chat, chats y grupos **solo funcionan dentro del mismo espacio**.
   - Edad mínima de registro: 12 años. Rechazar registros menores.
2. **Toda regla de acceso vive en RLS de Postgres**, no solo en el frontend. Toda tabla con RLS habilitado.
3. **Perfiles de menores:** visibles solo para usuarios registrados del espacio `teen`. Nunca para visitantes sin cuenta. Mostrar nivel escolar, no la edad exacta.
4. **Foto de boleta:** bucket privado. Solo el dueño y los moderadores pueden leerla (URLs firmadas). Se conserva como evidencia. Lo público es el promedio y el badge de verificado.
5. **Bloqueos** aplican en ambas direcciones y se respetan en cada consulta: perfil, publicaciones, comentarios, búsqueda, sugerencias, solicitudes y chat.
6. **Secretos y correo del moderador en variables de entorno**, nunca en el código.

## 3. Funcionalidades (resumen)

- Registro de perfiles
- Perfil público por defecto (dentro de las reglas de la sección 2)
- Qué busca el usuario: `amigos`, `proyectos`, `grupos de estudio`, `otro` (con texto libre). Selección múltiple.
- Intereses
- Promedio escolar visible para todos (dentro de su espacio), con foto de boleta como evidencia y badge "verificado" solo tras aprobación de un moderador
- Fotos: **solo** avatar y boleta. Sin fotos en publicaciones ni chats. Sin videos.
- Publicaciones de **solo texto**, con **comentarios** (sin likes)
- Feed visible a desconocidos (del mismo espacio)
- Búsqueda de perfiles por intereses, qué busca, edad y promedio
- Sugerencias de conexión: aleatorias totales o con filtros
- Solicitudes de chat sin necesidad de ser amigos
- Opción en el perfil `accepts_message_requests` (default `true`)
- Chat 1 a 1 en tiempo real, solo texto
- Grupos: salas por tema (estudio o discusión abierta) en tiempo real, solo texto
- Bloqueo: corta chat, publicaciones y perfil
- Reportes con categorías, mensaje y foto de evidencia; correo al moderador
- Panel de moderador

## 4. Modelo de datos

Usa UUID como PK, `created_at timestamptz default now()`. Nombres en inglés.

| Tabla | Campos clave |
|---|---|
| `profiles` | `id` (FK a `auth.users`), `username` único, `full_name`, `avatar_path`, `bio`, `birth_date`, `school_level` enum (`secundaria`, `preparatoria`, `universidad`), `school_name`, `gpa` numeric nullable, `gpa_verified` bool default false, `accepts_message_requests` bool default true, `role` enum (`user`, `moderator`) default `user`, `status` enum (`active`, `suspended`, `banned`) |
| `age_space` | Función SQL `age_space(birth_date) returns text` → `'teen'` / `'adult'`. Usar en RLS. |
| `interests` | `id`, `name` único |
| `profile_interests` | `profile_id`, `interest_id` (PK compuesta) |
| `profile_looking_for` | `profile_id`, `kind` enum (`friends`, `projects`, `study_groups`, `other`), `other_text` nullable |
| `grade_verifications` | `id`, `profile_id`, `gpa`, `image_path`, `status` (`pending`, `approved`, `rejected`), `reviewed_by`, `reviewed_at`, `review_note` |
| `posts` | `id`, `author_id`, `body` text (con límite de longitud) |
| `comments` | `id`, `post_id`, `author_id`, `body` |
| `chat_requests` | `id`, `from_id`, `to_id`, `status` (`pending`, `accepted`, `rejected`), único por par pendiente |
| `conversations` | `id`, `type` (`direct`, `group`), `group_id` nullable |
| `conversation_members` | `conversation_id`, `profile_id`, `joined_at` |
| `messages` | `id`, `conversation_id`, `sender_id`, `body` text |
| `groups` | `id`, `name`, `description`, `topic`, `age_space`, `created_by` |
| `blocks` | `blocker_id`, `blocked_id` (PK compuesta) |
| `report_categories` | `id`, `name` (acoso, perfil falso, contenido inapropiado, spam, suplantación, otro…) |
| `reports` | `id`, `reporter_id`, `reported_id`, `category_id`, `message`, `evidence_path`, `status` (`open`, `reviewing`, `resolved`, `dismissed`), `involves_minor` bool, `resolved_by`, `resolution_note` |
| `moderation_actions` | `id`, `moderator_id`, `target_id`, `action` (`warn`, `suspend`, `ban`, `unban`), `report_id` nullable, `note` |

Funciones auxiliares recomendadas: `is_blocked(a, b)`, `same_space(a, b)`, `is_moderator()`.

## 5. Storage

- `avatars`: público. Ruta `{user_id}/avatar.{ext}`. Solo el dueño escribe.
- `boletas`: **privado**. Ruta `{user_id}/{verification_id}.{ext}`. El dueño sube; lectura solo dueño y moderadores.
- `report-evidence`: **privado**. El reportante sube; lectura solo moderadores.
- Validar tipo (jpg, png, webp) y tamaño máximo (p. ej. 5 MB) en cliente y en políticas.

## 6. Fases

### Fase 1 · Base del proyecto
- Vite + React + TS + Tailwind, estructura por features (`src/features/...`)
- Supabase CLI inicializado, entorno local funcionando
- Cliente Supabase tipado (tipos generados con `supabase gen types`)
- Router, TanStack Query, layout mobile first con navegación inferior
- `.env.example` con todas las variables

**Aceptación:** `npm run dev` levanta la app conectada a Supabase local; tipos generados; lint y typecheck pasan.

### Fase 2 · Registro y perfil
- Registro con correo y contraseña, confirmación de correo, login, logout, recuperar contraseña
- Onboarding: fecha de nacimiento (rechazar < 12 años), nivel escolar, escuela, username, avatar, qué busca (con `otro` libre), intereses
- Vista y edición de perfil; switch "Recibir solicitudes de mensaje"
- Carga de promedio + foto de boleta → crea `grade_verifications` en `pending`
- RLS de perfiles según la sección 2 (visibilidad por espacio, menores ocultos a visitantes)

**Aceptación:** un usuario teen no ve perfiles adult ni al revés; un visitante sin sesión no ve perfiles teen; la boleta no es accesible por URL pública.

### Fase 3 · Publicaciones
- Crear, editar y borrar posts propios (solo texto)
- Comentarios en posts
- Feed cronológico del mismo espacio, excluyendo bloqueados, con paginación infinita

**Aceptación:** RLS impide leer posts o comentarios de otro espacio o de usuarios bloqueados.

### Fase 4 · Búsqueda y sugerencias
- Búsqueda por nombre/username (`pg_trgm`) con filtros: intereses, qué busca, rango de edad, promedio mínimo, solo verificados
- Sugerencias: modo aleatorio total y modo con filtros; excluir a uno mismo, bloqueados y conversaciones ya existentes
- Implementar como funciones RPC en Postgres

**Aceptación:** ningún resultado cruza de espacio ni incluye bloqueados.

### Fase 5 · Chat 1 a 1 y bloqueos
- Enviar solicitud de chat (solo si el destinatario tiene `accepts_message_requests = true`, mismo espacio y sin bloqueo — validado en RLS)
- Aceptar/rechazar solicitud → crea `conversation` tipo `direct`
- Mensajes en tiempo real con Supabase Realtime (solo texto)
- Bloquear/desbloquear desde perfil y chat; el bloqueo oculta perfil, posts y comentarios, y corta el chat
- Si el perfil no acepta solicitudes, mostrar "No recibe solicitudes" en lugar del botón

**Aceptación:** un usuario bloqueado no puede enviar mensajes ni ver el perfil; insertar una solicitud vía API directa con el switch apagado falla.

### Fase 6 · Grupos
- Listado y búsqueda de grupos del mismo espacio
- Unirse/salir; chat grupal en tiempo real con Presence (quién está en línea)
- Los grupos pertenecen a un `age_space`; un usuario solo ve y entra a los de su espacio

**Aceptación:** ningún usuario puede unirse a un grupo de otro espacio aunque llame la API directamente.

### Fase 7 · Moderación
- Botón de reporte en perfiles, posts, comentarios y mensajes: categoría, mensaje y foto de evidencia
- `involves_minor = true` si reportante o reportado está en espacio `teen`; esos reportes aparecen primero
- Database Webhook en `INSERT` de `reports` → Edge Function `notify-report` que envía correo con Resend a `MODERATOR_EMAIL`:
  - Asunto: `[Nexus] Reporte: {categoría}` (prefijo `[PRIORITARIO]` si involucra menor)
  - Cuerpo: usuario que reporta (username + id), usuario reportado (username + id), categoría, mensaje, fecha, enlace al panel
  - Adjunto: la foto de evidencia (descargada del bucket privado con la service role key)
- Panel de moderador (ruta protegida por `role = moderator`, validado en RLS):
  - Lista de reportes con filtros por estado y prioridad; cambiar estado y agregar nota
  - Acciones sobre usuarios: advertir, suspender, banear, reactivar (registrar en `moderation_actions`)
  - Cola de verificación de boletas: ver imagen (URL firmada), aprobar o rechazar; al aprobar, `profiles.gpa` y `gpa_verified = true`
- Usuarios `suspended`/`banned` no pueden publicar, comentar ni enviar mensajes (RLS)

**Aceptación:** crear un reporte dispara el correo con adjunto; un usuario normal no puede leer `reports` ni abrir el panel.

## 7. Variables de entorno

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
# Edge Functions (secrets de Supabase)
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
REPORT_FROM_EMAIL=reportes@<dominio>
MODERATOR_EMAIL=erickjohn96357@gmail.com
APP_URL=
```

## 8. Pendientes por confirmar con el dueño del proyecto

No implementes estas decisiones por tu cuenta; pregunta cuando llegues a la fase correspondiente:

1. ¿Existe un concepto de "amigos" o solo chats aceptados? (antes de la fase 5)
2. ¿Quién puede crear grupos y si tienen admin que expulse miembros? (antes de la fase 6)
3. Dominio para enviar correos con Resend (antes de la fase 7)

## 9. Convenciones

- Commits pequeños por feature; cada fase en su propia rama
- Tests de RLS con SQL (pgTAP o scripts) para las reglas de la sección 2
- Estados de carga, vacío y error en cada vista
- Textos de la interfaz en español
