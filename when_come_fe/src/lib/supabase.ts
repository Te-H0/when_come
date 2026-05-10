import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const DEV_EMAIL = import.meta.env.VITE_DEV_USER_EMAIL as string | undefined
const DEV_PASSWORD = import.meta.env.VITE_DEV_USER_PASSWORD as string | undefined

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export async function initAuth(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) return

  if (import.meta.env.DEV && DEV_EMAIL && DEV_PASSWORD) {
    const { error } = await supabase.auth.signInWithPassword({
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
    })
    if (!error) return
    // dev 로그인 실패 시(예: seed 미실행) 콘솔 경고 + 익명 fallback
    console.warn('[dev] signInWithPassword 실패 — 익명 로그인으로 fallback. seed.sql 실행했는지 확인:', error.message)
  }

  await supabase.auth.signInAnonymously()
}

export async function getJwt(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}
