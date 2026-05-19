import { createClient } from '@supabase/supabase-js'

const processEnv = process as any
const supabaseUrl = processEnv.env?.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = processEnv.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL must be defined in your .env.local file.')
}

if (!supabaseAnonKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY must be defined in your .env.local file.')
}

if (/service_role/i.test(supabaseAnonKey)) {
  throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY ne doit pas contenir de clé secrète. Utilisez la clé publique Anon/SB publishable, pas la service_role key.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)