import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Lazy construction prevents auth recovery/timers/network before the selected startup mode is known.
let client: SupabaseClient | undefined;
function getSupabaseClient(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('서비스 연결 설정을 확인해 주세요.');
    if (import.meta.env.DEV && import.meta.env.MODE === 'localdev') {
      const parsed = new URL(url);
      const host = parsed.hostname;
      if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]')) throw new Error('로컬 개발 연결은 이 컴퓨터의 서비스만 사용할 수 있어요.');
    }
    client = import.meta.env.DEV && import.meta.env.MODE === 'localdev'
      ? createClient(url, key, { auth: { storageKey: `when-come-localdev:${new URL(url).origin}` } })
      : createClient(url, key);
  }
  return client;
}

export async function initAuth(): Promise<void> {
  if (import.meta.env.DEV && import.meta.env.VITE_LOCAL_DEMO === 'true') return;
  const email = import.meta.env.VITE_DEV_USER_EMAIL;
  const password = import.meta.env.VITE_DEV_USER_PASSWORD;
  if (import.meta.env.DEV && import.meta.env.MODE === 'localdev' && (!email || !password)) {
    throw new Error('로컬 개발 사용자 설정을 확인해 주세요.');
  }
  const supabase = getSupabaseClient();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (import.meta.env.DEV && import.meta.env.MODE === 'localdev') {
    if (session?.user.email === email) return;
    if (!email || !password) throw new Error('로컬 개발 사용자 설정을 확인해 주세요.');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return;
  }
  if (session) return;

  if (import.meta.env.DEV && email && password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return;
    console.warn('[dev] 개발 사용자 로그인에 실패했습니다. 로컬 환경 상태를 확인해 주세요.');
  }
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
}

export async function getJwt(): Promise<string | null> {
  if (import.meta.env.DEV && import.meta.env.VITE_LOCAL_DEMO === 'true') {
    const { DEMO_SESSION } = await import('@/dev/demo/session');
    return DEMO_SESSION;
  }
  const { data: { session }, error } = await getSupabaseClient().auth.getSession();
  if (error) throw error;
  if (import.meta.env.DEV && import.meta.env.MODE === 'localdev' && session?.user.email !== import.meta.env.VITE_DEV_USER_EMAIL) {
    throw new Error('로컬 개발 사용자로 다시 연결해 주세요.');
  }
  return session?.access_token ?? null;
}
