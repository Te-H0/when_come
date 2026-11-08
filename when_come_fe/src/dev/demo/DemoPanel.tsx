import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DEMO_AREAS } from './catalog';
import { readDemoState, resetDemo, setDemoRegion } from './storage';
import type { DemoRegionFilter } from './catalog';

export default function DemoPanel() {
  const queryClient = useQueryClient();
  const [region, setRegion] = useState<DemoRegionFilter>(() => {
    try { return readDemoState().region; } catch { return 'all'; }
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['routes'] });
    await queryClient.invalidateQueries({ queryKey: ['favorite-stops'] });
    // In-flight discovery requests must not write results from the previous demo region.
    window.dispatchEvent(new Event('when-come-demo-region'));
  }
  async function handleRegion(next: DemoRegionFilter) {
    try {
      setDemoRegion(next);
      setRegion(next);
      setError(null);
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '가상 데이터를 읽지 못했어요.'); }
  }
  async function handleReset() {
    try {
      resetDemo();
      setRegion('all');
      setError(null);
      setConfirmReset(false);
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '가상 데이터를 초기화하지 못했어요.'); }
  }
  return <aside aria-label="로컬 가상 체험" className="border-b border-surface-info-border bg-surface-info-soft p-4 text-text-info">
    <div className="mx-auto max-w-2xl space-y-3">
      <p className="text-label font-semibold">로컬 가상 체험 · 가상 사용자</p>
      <p className="text-caption">정류장·노선·도착시간은 가상 데이터예요. 저장은 이 브라우저에만 남아요. 지도 배경은 네이버 지도예요.</p>
      <div role="group" aria-label="가상 데이터 지역" className="flex flex-wrap gap-2">
        {[{ id: 'all', name: '전체' }, ...DEMO_AREAS].map(area => <button key={area.id} type="button" aria-pressed={region === area.id}
          onClick={() => { if (area.id === 'all' || area.id === 'seoul' || area.id === 'gyeonggi' || area.id === 'incheon') void handleRegion(area.id); }}
          className={`min-h-11 rounded-control border border-surface-info-border px-3 text-button ${region === area.id ? 'bg-text-primary text-white' : 'bg-surface-card text-text-info'}`}>{area.name}</button>)}
        <button type="button" onClick={() => setConfirmReset(true)} className="min-h-11 rounded-control px-3 text-button text-text-info">가상 데이터 초기화</button>
      </div>
      {confirmReset && <div className="space-y-3 rounded-control border border-border-subtle bg-surface-card p-4">
        <p className="text-body text-text-primary">이 브라우저에 저장한 가상 경로와 즐겨찾기를 지우고 처음부터 시작할까요?</p>
        <button type="button" onClick={() => void handleReset()} className="min-h-11 rounded-control bg-text-primary px-3 text-button text-white">초기화하기</button>
        <button type="button" onClick={() => setConfirmReset(false)} className="min-h-11 rounded-control px-3 text-button text-text-secondary">취소</button>
      </div>}
      {error && <p role="alert" className="text-body text-text-danger">{error}</p>}
    </div>
  </aside>;
}
