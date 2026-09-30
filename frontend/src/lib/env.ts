export const env = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '',
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '',
  apiUrl: (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? '',
}
export const supabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)
