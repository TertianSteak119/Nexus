# Comprobacion de la Fase 2

## Estado actual

Preparado y comprobable:

- Registro, confirmacion de correo, login, logout y recuperacion de contrasena.
- Edicion de username, nombre, fecha de nacimiento, nivel escolar, escuela y bio.
- Switch `accepts_message_requests`.
- Validacion de edad minima de 12 anos en la interfaz y en Postgres.
- Separacion `teen` / `adult` calculada desde `birth_date`.
- RLS de perfiles, intereses, preferencias y verificaciones.
- Bucket publico `avatars` y bucket privado `boletas`.

Pendiente para cerrar la Fase 2:

- Aplicar las migraciones al proyecto Supabase remoto.
- Tipos generados desde el esquema local con `supabase gen types`.
- Pruebas RLS ejecutadas contra Supabase local.

## 1. Preparar el entorno

Desde la raiz del repositorio:

```bash
copy .env.example .env
npm install
```

Completa en `.env` solo estas variables para el frontend:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=...
```

No pongas `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` ni otros secretos en variables `VITE_*`.

Requisitos adicionales para pruebas reales de base de datos:

- Docker Desktop iniciado.
- Supabase CLI instalado.

## 2. Iniciar Supabase local

```bash
supabase start
supabase db reset
supabase status
```

En `supabase status`, copia la URL API y la `anon key` al archivo `.env`.

La migracion de Fase 2 debe quedar aplicada:

```text
supabase/migrations/20260918000100_phase2_profiles.sql
```

## 3. Validar el frontend

En una terminal:

```bash
npm run typecheck
npm run lint
npm run build
npm run dev
```

Abre `http://localhost:5173`.

## 4. Probar registro y acceso

1. Entra a `Perfil`.
2. Comprueba que aparece `Iniciar sesion` y `Crear cuenta`.
3. Intenta crear una cuenta con correo invalido: debe mostrar un error de validacion.
4. Intenta crear una cuenta con una contrasena de menos de 8 caracteres: debe rechazarla.
5. Crea una cuenta con correo valido.
6. Confirma el correo usando el mensaje de Supabase/Inbucket.
7. Inicia sesion.
8. Pulsa `Cerrar sesion` y confirma que vuelves al formulario de acceso.
9. Usa `¿Olvidaste tu contrasena?` y confirma que llega el enlace.

## 5. Probar onboarding y edicion de fecha

1. Completa username, nombre, fecha, nivel escolar, escuela y bio.
2. Selecciona una fecha que implique 11 anos o menos: debe rechazarse.
3. Selecciona una fecha valida de 12 anos o mas.
4. Guarda el perfil y recarga la pagina.
5. Comprueba que los datos, incluida la fecha de nacimiento, se cargan de nuevo.
6. Cambia la fecha de nacimiento y guarda.
7. Recarga otra vez y confirma que la fecha editada persiste.
8. Cambia el switch de solicitudes y confirma que persiste.

La categoria de edad no se edita en la UI. Se calcula en Postgres con `age_space(birth_date)`.

## 6. Probar RLS con dos usuarios

Crea dos usuarios de prueba:

- `teen.test`: fecha que implique 15 anos.
- `adult.test`: fecha que implique 25 anos.

Con ambos perfiles completados:

1. Inicia sesion como `teen.test`.
2. Consulta perfiles desde la app o Supabase API: no debe aparecer `adult.test`.
3. Inicia sesion como `adult.test`.
4. Consulta perfiles: no debe aparecer `teen.test`.
5. Cierra sesion y consulta perfiles teen: no debe devolverse ningun perfil.
6. Intenta cambiar `role`, `status` o `gpa_verified` desde el cliente: no debe poder elevar privilegios ni verificar el promedio.

Estas pruebas deben repetirse mediante API directa, no solo desde la interfaz.

## 7. Probar Storage de boletas

1. Sube un JPG, PNG o WebP menor al limite.
2. Confirma que se crea una fila `grade_verifications` con `status = 'pending'`.
3. Intenta abrir el path de la boleta como URL publica: debe fallar.
4. El propietario debe verla mediante URL firmada.
5. Un usuario distinto no debe leerla.
6. Un moderador debe poder verla mediante URL firmada.

## 8. Probar Fase 3

1. Inicia sesion con dos perfiles del mismo espacio.
2. Crea una publicacion de texto y confirma que aparece en el feed.
3. Intenta publicar contenido vacio: el boton debe permanecer desactivado.
4. Edita y borra una publicacion propia.
5. Agrega un comentario y borralo.
6. Confirma que un perfil del otro espacio no aparece en el feed.
7. Crea mas de 20 publicaciones y usa `Cargar mas publicaciones`.
8. Intenta consultar o modificar los datos usando API directa con un usuario que no sea el autor: RLS debe rechazarlo.

## 9. Resultado para cerrar la fase

La Fase 2 solo puede marcarse como completada cuando:

- Las pruebas de las secciones 4, 5 y 6 pasan.
- Avatar, intereses, preferencias de busqueda, promedio y boleta estan implementados.
- Las pruebas de publicaciones, comentarios y paginacion de la seccion 8 pasan.
- La prueba de Storage de la seccion 7 pasa.
- `npm run typecheck`, `npm run lint` y `npm run build` pasan.
- `supabase db reset` reconstruye el esquema sin errores.