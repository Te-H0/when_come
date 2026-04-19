import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://kifxccvqofsdyonbhmnc.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_rlRYC4jhon314ly9fzSvsg_GWFc6QBo'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export async function initAuth(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    await supabase.auth.signInAnonymously()
  }
}

export async function getJwt(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}
