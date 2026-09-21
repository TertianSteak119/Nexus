# Nexus - GitHub Issues iniciales

Este archivo contiene borradores listos para crear como GitHub Issues. El repositorio todavía no existe, así que primero crea los milestones y labels indicados, y después copia cada bloque como un Issue independiente.

## Milestones

- `Fase 1 - Base del proyecto`
- `Fase 2 - Registro y perfil`
- `Fase 3 - Publicaciones`
- `Fase 4 - Busqueda y sugerencias`
- `Fase 5 - Chat y bloqueos`
- `Fase 6 - Grupos`
- `Fase 7 - Moderacion`

## Labels

`phase-1`, `phase-2`, `phase-3`, `phase-4`, `phase-5`, `phase-6`, `phase-7`, `security`, `database`, `frontend`, `backend`, `testing`, `decision-needed`, `blocked`

## Orden recomendado

Los Issues deben cerrarse respetando el orden numerico. Los Issues marcados con `decision-needed` no deben comenzar hasta resolver la decision indicada en la especificacion.

---

## Fase 1 - Base del proyecto

### Issue 01 - Inicializar aplicacion frontend

**Labels:** `phase-1`, `frontend`
**Milestone:** `Fase 1 - Base del proyecto`

### Objetivo

Crear la aplicacion Vite + React + TypeScript con Tailwind CSS, estructura por features y textos iniciales en espanol.

### Alcance

- Configurar Vite, React, TypeScript y Tailwind.
- Crear `src/features/...`, componentes compartidos y estilos base.
- Implementar layout mobile first con navegacion inferior.
- Agregar estados base de carga, vacio y error para las vistas nuevas.
- Configurar scripts de desarrollo, lint y typecheck.

### Criterios de aceptacion

- `npm run dev` inicia la aplicacion sin errores.
- La interfaz funciona en viewport movil y escritorio.
- `npm run lint` y `npm run typecheck` pasan.
- La estructura inicial permite agregar cada feature sin mezclar logica de datos y presentacion.

---

### Issue 02 - Inicializar Supabase local y migraciones

**Labels:** `phase-1`, `database`, `security`
**Milestone:** `Fase 1 - Base del proyecto`

### Objetivo

Configurar Supabase CLI y el flujo local de migraciones versionadas.

### Alcance

- Inicializar `supabase/` y la configuracion local.
- Documentar como iniciar y detener Supabase local.
- Crear la primera migracion base con extensiones necesarias, enums y funciones auxiliares vacias o iniciales.
- Establecer que los cambios de esquema se hacen solamente mediante migraciones.

### Criterios de aceptacion

- El proyecto arranca contra Supabase local.
- `supabase db reset` reconstruye el esquema desde cero.
- Las migraciones quedan versionadas y reproducibles.
- No hay cambios manuales necesarios en el dashboard.

---

### Issue 03 - Crear cliente Supabase tipado y configuracion de entorno

**Labels:** `phase-1`, `frontend`, `database`
**Milestone:** `Fase 1 - Base del proyecto`

### Objetivo

Conectar el frontend con Supabase usando variables de entorno y tipos generados.

### Alcance

- Crear cliente tipado con `@supabase/supabase-js`.
- Generar los tipos con `supabase gen types`.
- Agregar `.env.example` con las variables publicas del frontend y documentar cuales son secretos de Edge Functions.
- No exponer `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` ni `MODERATOR_EMAIL` en el bundle del frontend.

### Criterios de aceptacion

- El cliente usa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
- Los tipos se regeneran desde el esquema local.
- La aplicacion muestra un error entendible si faltan variables publicas.
- Los secretos no aparecen en archivos del frontend ni en el repositorio.

---

### Issue 04 - Configurar router, TanStack Query y layout base

**Labels:** `phase-1`, `frontend`
**Milestone:** `Fase 1 - Base del proyecto`

### Objetivo

Dejar lista la infraestructura de navegacion y consultas para las fases funcionales.

### Alcance

- Configurar React Router.
- Configurar `QueryClientProvider` de TanStack Query.
- Crear rutas publicas, autenticadas y protegidas para moderacion, aunque inicialmente sean placeholders.
- Crear layout mobile first con navegacion inferior.

### Criterios de aceptacion

- Las rutas cambian sin recarga completa.
- Las rutas autenticadas tienen un punto unico de control de sesion.
- Las consultas pueden invalidarse desde TanStack Query.
- Existe una ruta de fallback para paginas inexistentes.

---

## Fase 2 - Registro y perfil

### Issue 05 - Modelar perfiles, intereses y preferencias de busqueda

**Labels:** `phase-2`, `database`
**Milestone:** `Fase 2 - Registro y perfil`

### Objetivo

Crear el esquema de perfiles y datos de onboarding definido en la especificacion.

### Alcance

- Crear `profiles`, `interests`, `profile_interests` y `profile_looking_for`.
- Agregar enums, restricciones, indices y timestamps.
- Crear trigger o flujo seguro para crear el perfil asociado a `auth.users`.
- Validar username unico, edad minima y valores validos de `school_level`.

### Criterios de aceptacion

- Un perfil siempre pertenece a un usuario de `auth.users`.
- No se puede registrar una fecha que implique menos de 12 anos.
- `other_text` solo es necesario cuando se selecciona `other`.
- Se pueden seleccionar multiples intereses y opciones de busqueda.

---

### Issue 06 - Implementar age spaces y RLS de perfiles

**Labels:** `phase-2`, `database`, `security`, `testing`
**Milestone:** `Fase 2 - Registro y perfil`

### Objetivo

Aplicar en Postgres la separacion estricta entre `teen` y `adult`.

### Alcance

- Implementar `age_space(birth_date)` calculando la edad actual desde `birth_date`.
- Implementar `same_space(a, b)` y `is_blocked(a, b)`.
- Habilitar RLS en todas las tablas de esta fase.
- Permitir que perfiles teen solo sean visibles para usuarios autenticados teen.
- Impedir que cualquier usuario teen consulte perfiles adult y viceversa.
- Cubrir el cambio automatico al cumplir 18 sin guardar un espacio fijo.

### Criterios de aceptacion

- Un usuario teen no puede leer perfiles adult mediante frontend ni API directa.
- Un usuario adult no puede leer perfiles teen mediante frontend ni API directa.
- Un visitante anonimo no puede leer perfiles teen.
- Las pruebas SQL cubren ambos espacios, visitante y cambio de edad.

---

### Issue 07 - Crear flujo de autenticacion y onboarding

**Labels:** `phase-2`, `frontend`, `backend`
**Milestone:** `Fase 2 - Registro y perfil`

### Objetivo

Implementar registro, confirmacion de correo, inicio de sesion, cierre de sesion y recuperacion de contrasena.

### Alcance

- Formularios con `react-hook-form` y `zod`.
- Registro con correo, contrasena y fecha de nacimiento.
- Rechazo de menores de 12 anos antes de crear el perfil.
- Confirmacion de correo, login, logout y recuperacion de contrasena.
- Onboarding para username, nivel escolar, escuela, avatar, preferencias e intereses.

### Criterios de aceptacion

- Un usuario no puede completar el onboarding sin los campos obligatorios.
- El estado de sesion se conserva al recargar.
- Se muestran estados de carga y errores de validacion.
- La edad se deriva de `birth_date`, no de un campo elegido por el usuario.

---

### Issue 08 - Implementar perfil, avatar y verificacion de promedio

**Labels:** `phase-2`, `frontend`, `database`, `security`
**Milestone:** `Fase 2 - Registro y perfil`

### Objetivo

Permitir consultar y editar el perfil, y enviar evidencia del promedio para moderacion.

### Alcance

- Vista y edicion de perfil.
- Switch `accepts_message_requests` con valor inicial `true`.
- Buckets `avatars` publico y `boletas` privado.
- Crear `grade_verifications` con estado inicial `pending`.
- Permitir lectura de la boleta solo al propietario y moderadores mediante URLs firmadas.
- Mostrar el promedio y el badge de verificado segun el estado aprobado.

### Criterios de aceptacion

- Solo se aceptan JPG, PNG o WebP con limite de tamano documentado y aplicado.
- Una URL publica no permite acceder a una boleta.
- El usuario puede ver su propia boleta pendiente.
- `gpa_verified` no puede activarse desde el cliente.

---

## Fase 3 - Publicaciones

### Issue 09 - Crear publicaciones y comentarios de solo texto

**Labels:** `phase-3`, `frontend`, `database`
**Milestone:** `Fase 3 - Publicaciones`

### Objetivo

Implementar publicaciones de texto, edicion y borrado propios, y comentarios.

### Alcance

- Crear tablas `posts` y `comments` con limite de longitud.
- Crear formularios y mutaciones para crear, editar y borrar posts propios.
- Agregar comentarios sin likes, fotos ni videos.
- Implementar estados de carga, vacio y error.

### Criterios de aceptacion

- Un usuario solo puede editar o borrar sus propios posts y comentarios segun la politica definida.
- Se rechaza contenido vacio o que exceda el limite.
- No existe flujo para adjuntar fotos o videos.

---

### Issue 10 - Implementar feed por espacio y bloqueos

**Labels:** `phase-3`, `database`, `security`, `testing`
**Milestone:** `Fase 3 - Publicaciones`

### Objetivo

Mostrar un feed cronologico paginado sin cruzar espacios ni exponer usuarios bloqueados.

### Alcance

- Consultar posts del mismo `age_space`.
- Excluir ambos sentidos de bloqueos en posts y comentarios.
- Implementar paginacion infinita con TanStack Query.
- Crear pruebas de RLS para lectura directa y operaciones de escritura.

### Criterios de aceptacion

- Un usuario no lee posts o comentarios del otro espacio.
- Un bloqueo oculta posts y comentarios en ambas direcciones.
- La paginacion no duplica ni pierde publicaciones bajo el orden definido.
- Las restricciones se mantienen usando la API directa.

---

## Fase 4 - Busqueda y sugerencias

### Issue 11 - Implementar busqueda segura de perfiles

**Labels:** `phase-4`, `frontend`, `database`, `security`
**Milestone:** `Fase 4 - Busqueda y sugerencias`

### Objetivo

Permitir buscar perfiles del mismo espacio con filtros utiles y sin filtrar datos protegidos.

### Alcance

- Habilitar `pg_trgm` para nombre y username.
- Agregar filtros por intereses, que busca, rango de edad, promedio minimo y verificados.
- Implementar RPC que aplique `same_space` y `is_blocked` en la base de datos.
- Mostrar nivel escolar, no edad exacta, en perfiles teen.

### Criterios de aceptacion

- Ningun resultado cruza de espacio.
- Ningun resultado incluye bloqueados.
- Los filtros combinados producen resultados consistentes.
- La RPC no permite modificar ni revelar datos que la politica de RLS oculta.

---

### Issue 12 - Implementar sugerencias de conexion

**Labels:** `phase-4`, `frontend`, `database`, `security`
**Milestone:** `Fase 4 - Busqueda y sugerencias`

### Objetivo

Crear sugerencias aleatorias totales o filtradas mediante RPC.

### Alcance

- Excluir al usuario actual y usuarios bloqueados.
- Excluir conversaciones ya existentes.
- Mantener la separacion por `age_space`.
- Agregar modo aleatorio total y modo con filtros.
- Definir paginacion o limite maximo para evitar consultas costosas.

### Criterios de aceptacion

- Una llamada directa a la RPC nunca devuelve otro espacio.
- No aparecen usuarios bloqueados ni el usuario actual.
- El resultado soporta estado vacio y repeticion de consulta.

---

## Fase 5 - Chat y bloqueos

### Issue 13 - Resolver concepto de amistad y reglas de solicitud de chat

**Labels:** `phase-5`, `decision-needed`, `blocked`
**Milestone:** `Fase 5 - Chat y bloqueos`

### Decision requerida

Confirmar si Nexus tendra relaciones de amistad independientes o si una solicitud aceptada de chat es la unica relacion social.

### Criterios de salida

- La decision queda escrita en `nexus-spec.md`.
- Se define que relaciones pueden iniciar conversaciones.
- Se actualizan tablas, rutas y criterios de aceptacion de los Issues de chat antes de implementarlos.

---

### Issue 14 - Implementar solicitudes y chat directo en tiempo real

**Labels:** `phase-5`, `frontend`, `database`, `security`
**Milestone:** `Fase 5 - Chat y bloqueos`

### Objetivo

Implementar solicitudes de chat y conversaciones directas de texto con Supabase Realtime.

### Alcance

- Crear `chat_requests`, `conversations`, `conversation_members` y `messages`.
- Validar mismo espacio, ausencia de bloqueo y `accepts_message_requests = true` en RLS o funciones seguras.
- Aceptar o rechazar solicitudes; al aceptar, crear conversacion `direct`.
- Habilitar mensajes solo de texto en tiempo real.
- Aplicar limites de longitud y estados de envio, carga y error.

### Criterios de aceptacion

- Una solicitud con el switch apagado falla tambien por API directa.
- Usuarios de espacios distintos no pueden crear solicitud, conversacion ni mensaje.
- Un usuario bloqueado no puede leer ni enviar mensajes.
- Solo los miembros pueden leer y escribir en una conversacion.

---

### Issue 15 - Implementar bloqueo y desbloqueo en toda la plataforma

**Labels:** `phase-5`, `frontend`, `database`, `security`, `testing`
**Milestone:** `Fase 5 - Chat y bloqueos`

### Objetivo

Centralizar el bloqueo en la base de datos y hacerlo efectivo en todos los recursos.

### Alcance

- Crear tabla `blocks` con PK compuesta y validacion contra auto-bloqueo.
- Crear UI para bloquear y desbloquear desde perfil y chat.
- Aplicar el bloqueo a perfiles, posts, comentarios, busqueda, sugerencias, solicitudes y mensajes.
- Cortar el acceso a conversaciones existentes cuando se crea un bloqueo.

### Criterios de aceptacion

- El bloqueo funciona en ambas direcciones.
- Una consulta directa no puede eludir el bloqueo.
- Desbloquear restaura solo el acceso permitido, sin crear solicitudes automaticamente.
- Las pruebas cubren todos los recursos enumerados.

---

## Fase 6 - Grupos

### Issue 16 - Resolver permisos de creacion y administracion de grupos

**Labels:** `phase-6`, `decision-needed`, `blocked`
**Milestone:** `Fase 6 - Grupos`

### Decision requerida

Confirmar quienes pueden crear grupos y si existe un administrador con capacidad para expulsar miembros.

### Criterios de salida

- La decision queda escrita en `nexus-spec.md`.
- Se definen permisos de creador, administrador, miembro y visitante.
- Se actualizan esquema, RLS y criterios del Issue de grupos.

---

### Issue 17 - Implementar grupos por espacio y chat grupal

**Labels:** `phase-6`, `frontend`, `database`, `security`
**Milestone:** `Fase 6 - Grupos`

### Objetivo

Crear salas de estudio o discusion pertenecientes a un unico espacio de edad.

### Alcance

- Crear `groups` con `age_space`, tema, descripcion y creador.
- Listar y buscar grupos del espacio actual.
- Implementar unirse y salir con RLS.
- Crear conversaciones `group` y mensajes solo de texto.
- Agregar Supabase Realtime Presence para mostrar quienes estan en linea.

### Criterios de aceptacion

- Un usuario no puede listar, leer ni unirse a un grupo de otro espacio.
- Una llamada directa a la API no puede falsificar `age_space`.
- Solo miembros pueden leer y enviar mensajes del grupo.
- Se respetan los permisos definidos en el Issue de decision.

---

## Fase 7 - Moderacion

### Issue 18 - Implementar reportes y evidencia privada

**Labels:** `phase-7`, `frontend`, `database`, `security`
**Milestone:** `Fase 7 - Moderacion`

### Objetivo

Permitir reportar perfiles, posts, comentarios y mensajes con evidencia protegida.

### Alcance

- Crear `report_categories` y `reports`.
- Implementar formulario con categoria, mensaje y foto opcional de evidencia.
- Crear bucket privado `report-evidence`.
- Calcular `involves_minor` a partir del espacio del reportante o reportado, no desde el cliente.
- Permitir lectura de evidencia solo a moderadores.

### Criterios de aceptacion

- Un usuario puede reportar los recursos permitidos sin acceder a reportes ajenos.
- La evidencia no tiene URL publica.
- Los reportes que involucran menores quedan marcados como prioritarios en base de datos.
- Se validan tipo y tamano de archivo en cliente y politicas de Storage.

---

### Issue 19 - Notificar reportes por Edge Function y Resend

**Labels:** `phase-7`, `backend`, `security`, `blocked`
**Milestone:** `Fase 7 - Moderacion`

### Dependencia externa

Definir y verificar el dominio de envio de Resend antes de cerrar este Issue.

### Alcance

- Crear Database Webhook para `INSERT` en `reports`.
- Crear Edge Function `notify-report`.
- Descargar la evidencia privada con service role solo dentro de la funcion.
- Enviar correo a `MODERATOR_EMAIL` con asunto prioritario cuando corresponda.
- Incluir datos de reportante, reportado, categoria, mensaje, fecha y enlace al panel.

### Criterios de aceptacion

- Crear un reporte dispara una notificacion una sola vez o de forma idempotente.
- El correo incluye adjunto cuando existe evidencia.
- Ninguna clave secreta llega al frontend.
- Los errores quedan registrados y no revelan datos privados al usuario.

---

### Issue 20 - Crear panel de moderacion y acciones auditables

**Labels:** `phase-7`, `frontend`, `database`, `security`
**Milestone:** `Fase 7 - Moderacion`

### Objetivo

Crear la cola de moderacion y las acciones protegidas por rol.

### Alcance

- Crear ruta protegida para `role = moderator`.
- Listar reportes con filtros por estado y prioridad.
- Cambiar estado, agregar nota y resolver o descartar.
- Crear `moderation_actions` para advertir, suspender, banear y reactivar.
- Crear cola de verificacion de boletas con URLs firmadas.
- Al aprobar una boleta, actualizar `profiles.gpa` y `gpa_verified` desde una operacion autorizada.

### Criterios de aceptacion

- Un usuario normal no puede abrir el panel ni leer `reports` mediante API directa.
- Cada accion de moderacion queda auditada con moderador, objetivo, accion, nota y fecha.
- Usuarios suspendidos o baneados no pueden publicar, comentar ni enviar mensajes.
- Las boletas se muestran solo mediante URLs firmadas y con expiracion.

---

### Issue 21 - Suite de pruebas de seguridad y RLS

**Labels:** `testing`, `security`, `database`
**Milestone:** `Fase 7 - Moderacion`

### Objetivo

Mantener pruebas automatizadas para las reglas de seguridad mas importantes del sistema.

### Alcance

- Usar pgTAP o scripts SQL reproducibles contra Supabase local.
- Probar aislamiento teen/adult en perfiles, feed, busqueda, chat y grupos.
- Probar bloqueos en ambas direcciones.
- Probar acceso privado a boletas y evidencias.
- Probar permisos de moderador y restricciones de usuarios suspendidos o baneados.

### Criterios de aceptacion

- Las pruebas se ejecutan con un comando documentado.
- Cada regla no negociable de la especificacion tiene al menos una prueba de denegacion.
- Las pruebas se ejecutan antes de aplicar migraciones a un entorno compartido.
- Un cambio que debilite RLS produce un fallo claro.

---

## Decisiones pendientes que bloquean trabajo

1. Amistad independiente o solo chat aceptado: resolver antes del Issue 14.
2. Quien crea grupos y si existe administrador con capacidad de expulsar: resolver antes del Issue 17.
3. Dominio verificado para Resend: resolver antes del Issue 19.

## Riesgos que conviene resolver al crear el repositorio

- No guardar `age_space` como valor permanente: debe calcularse desde `birth_date` para que el cambio a `adult` sea automatico.
- Definir limites concretos para posts, comentarios, mensajes, bios, nombres y archivos antes de cerrar las migraciones.
- Decidir la politica de eliminacion o retencion de boletas y evidencias, porque la especificacion indica que la boleta se conserva como evidencia.
- Definir si una cuenta sin correo confirmado puede ver contenido o solo completar registro.
- Evitar que `involves_minor` sea manipulable desde el cliente; debe derivarse en Postgres.