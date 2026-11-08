import { useEffect, useState } from 'react';
import { initAuth } from '@/lib/supabase';
import type { ReactNode } from 'react';

interface StartupProps {
  children: ReactNode;
  initialize?: () => Promise<void>;
}

/** Render immediately, even when the local auth service is stopped or unavailable. */
export function Startup({ children, initialize = initAuth }: StartupProps) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setState('loading');
    const timer = setTimeout(() => { if (active) { active = false; setState('error'); } }, 8000);
    void initialize().then(() => {
      if (active) { clearTimeout(timer); setState('ready'); }
    }).catch(() => {
      if (active) { clearTimeout(timer); setState('error'); }
    });
    return () => { active = false; clearTimeout(timer); };
  }, [initialize, attempt]);
  if (state === 'ready') return <>{children}</>;
  return <div className="mx-auto max-w-lg space-y-3 p-6 text-text-primary">
    <h1 className="text-section">{state === 'loading' ? '앱을 준비하고 있어요' : '앱에 연결하지 못했어요'}</h1>
    {state === 'loading' ? <p role="status" className="text-body text-text-secondary">잠시만 기다려 주세요.</p> : <>
      <p role="alert" className="text-body text-text-secondary">연결 상태를 확인한 뒤 다시 시도해 주세요.</p>
      <button type="button" onClick={() => setAttempt(value => value + 1)} className="min-h-12 rounded-control bg-text-primary px-4 text-button text-white">다시 시도</button>
      {import.meta.env.DEV && <p className="text-caption text-text-secondary">로그인 없는 로컬 체험은 터미널에서 npm run dev:demo로 열 수 있어요.</p>}
    </>}
  </div>;
}
