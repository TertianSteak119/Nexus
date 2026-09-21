# Nexus

Red social para estudiantes, construida fase por fase con React, TypeScript y Supabase.

## Fase 1

La base incluye:

- Vite + React + TypeScript.
- Tailwind CSS mediante `@tailwindcss/vite`.
- React Router y TanStack Query.
- Cliente Supabase tipado en `src/lib/supabase.ts`.
- Layout mobile first con navegacion inferior.
- Configuracion inicial de Supabase CLI en `supabase/config.toml`.

## Requisitos

- Node.js LTS.
- Supabase CLI.

## Arranque

1. Copia `.env.example` a `.env` y completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
2. Instala dependencias con `npm install`.
3. Inicia Supabase local con `supabase start`.
4. Ejecuta la app con `npm run dev`.

## Validaciones

```bash
npm run lint
npm run typecheck
npm run build
```

Las migraciones de base de datos se agregaran en `supabase/migrations/`. No se deben hacer cambios manuales en el dashboard.

## Conectar Supabase para crear cuentas

Si usas un proyecto alojado en Supabase:

1. Abre `Project Settings > API` en el dashboard de Supabase.
2. Copia `Project URL` en `VITE_SUPABASE_URL`.
3. Copia la clave pública `anon` en `VITE_SUPABASE_ANON_KEY`.
4. Guarda `.env` en la raíz del proyecto, al mismo nivel que `package.json`.
5. Reinicia Vite completamente con `Ctrl+C` y después `npm run dev`.

El archivo debe verse así, usando tus valores reales:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_clave_anon_publica
```

No uses `service_role` en el frontend ni la subas a GitHub. Vite solo carga las variables de entorno al iniciar el servidor.

## Publicar migraciones en Supabase

Las migraciones nuevas se encuentran en `supabase/migrations/`. Para que la integración de GitHub las aplique al proyecto remoto, deben llegar a la rama `main`:

```bash
git add .
git commit -m "feat: complete phases 2 and 3"
git push origin main
```

Después verifica en Supabase que las tablas `profiles`, `posts` y `comments` existan. No incluyas `.env` en el commit.

## Comprobacion de Fase 2

Consulta [docs/fase-2-checklist.md](docs/fase-2-checklist.md) para preparar Supabase local y probar registro, edición de perfil, edad mínima, RLS y Storage. La guía también lista las partes de Fase 2 que todavía están pendientes.