import { createClient, SupabaseClient } from '@supabase/supabase-js'

export function getSupabaseAdmin(): SupabaseClient {
  const processEnv = process as any
  const supabaseUrl = processEnv.env?.NEXT_PUBLIC_SUPABASE_URL || processEnv.env?.SUPABASE_URL
  const supabaseServiceRoleKey = processEnv.env?.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_URL doit être défini.')
  }

  if (!supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY doit être défini dans l’environnement serveur.')
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
