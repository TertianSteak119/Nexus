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

## Comprobacion de Fase 2

Consulta [docs/fase-2-checklist.md](docs/fase-2-checklist.md) para preparar Supabase local y probar registro, edición de perfil, edad mínima, RLS y Storage. La guía también lista las partes de Fase 2 que todavía están pendientes.