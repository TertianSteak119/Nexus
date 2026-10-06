import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const fallbackUrl = 'https://bhxpsfwfvhjlovijlvcs.supabase.co'
const fallbackPublishableKey = 'sb_publishable_lmuGS__TQFJu84dM0GQokw_OffHu2Yz'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || fallbackUrl
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || fallbackPublishableKey

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export const isSupabaseConfigured = true
