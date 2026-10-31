import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function requireEnv(name: string, value: string | undefined) {
  const resolved = value?.trim()
  if (!resolved) {
    throw new Error(`Falta la variable de entorno ${name}. Configúrala antes de iniciar Nexus.`)
  }
  return resolved
}

const supabaseUrl = requireEnv('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL)
const supabaseAnonKey = requireEnv('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY)

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export const isSupabaseConfigured = true
