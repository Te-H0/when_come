import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ getSession: vi.fn(), signInWithPassword: vi.fn(), signInAnonymously: vi.fn() }));
const createClient = vi.hoisted(() => vi.fn());
vi.mock('@supabase/supabase-js', () => ({ createClient }));
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('DEV', true); vi.stubEnv('MODE', 'localdev'); vi.stubEnv('VITE_LOCAL_DEMO', 'false');
  vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:55421'); vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-only');
  vi.stubEnv('VITE_DEV_USER_EMAIL', 'dev@local.test'); vi.stubEnv('VITE_DEV_USER_PASSWORD', 'test-only-password');
  createClient.mockReturnValue({ auth });
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  auth.signInWithPassword.mockResolvedValue({ error: null });
  auth.signInAnonymously.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe('실제 로컬 인증 경계', () => {
  it('기존 익명 세션을 재사용하지 않고 별도 origin 저장키와 dev 계정으로 연결한다', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'old-anonymous', user: { email: null } } }, error: null });
    const { initAuth } = await import('../supabase');
    expect(createClient).not.toHaveBeenCalled();
    await initAuth();
    expect(createClient).toHaveBeenCalledWith('http://127.0.0.1:55421', 'test-only', { auth: { storageKey: 'when-come-localdev:http://127.0.0.1:55421' } });
    expect(auth.signInWithPassword).toHaveBeenCalledOnce();
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });
  it('로컬 dev 사용자 세션만 재사용하고 실패 시 익명 fallback을 하지 않는다', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'local', user: { email: 'dev@local.test' } } }, error: null });
    const { initAuth, getJwt } = await import('../supabase');
    await initAuth();
    expect(await getJwt()).toBe('local');
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    auth.signInWithPassword.mockResolvedValue({ error: new Error('stopped') });
    await expect(initAuth()).rejects.toThrow('stopped');
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });
  it('localdev가 원격 URL을 가리키면 constructor 이전에 차단한다', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://remote.example');
    const { initAuth } = await import('../supabase');
    await expect(initAuth()).rejects.toThrow('이 컴퓨터');
    expect(createClient).not.toHaveBeenCalled();
  });
  it('DEV=false이면 demo flag가 true여도 실제 정상 인증 경로를 사용한다', async () => {
    vi.stubEnv('DEV', false); vi.stubEnv('VITE_LOCAL_DEMO', 'true');
    const { initAuth, getJwt } = await import('../supabase');
    await initAuth();
    expect(createClient).toHaveBeenCalledOnce();
    expect(auth.signInAnonymously).toHaveBeenCalledOnce();
    expect(await getJwt()).toBeNull();
  });
});
