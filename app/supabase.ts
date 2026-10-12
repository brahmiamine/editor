import { createClient } from '@supabase/supabase-js'
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
export const authStorageKey = url ? `sb-${new URL(url).hostname.split('.')[0]}-auth-token` : ''
export const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth:{ storageKey:authStorageKey } }) : null
