import { createClient } from '@supabase/supabase-js'
import { env, supabaseConfigured } from './env'

/** The browser only ever holds the PUBLIC (anon / publishable) key. All privileged work happens in the API. */
export const supabase = createClient(
  supabaseConfigured ? env.supabaseUrl : 'http://localhost:54321',
  supabaseConfigured ? env.supabaseAnonKey : 'not-configured',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } },
)
