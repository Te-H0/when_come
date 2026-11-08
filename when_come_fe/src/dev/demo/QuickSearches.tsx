import { useEffect, useState } from 'react';
import { DEMO_AREAS } from './catalog';
import { readDemoState } from './storage';
import type { DemoRegionFilter } from './catalog';

interface QuickSearchesProps { onSearch: (query: string) => void }
export default function QuickSearches({ onSearch }: QuickSearchesProps) {
  const [region, setRegion] = useState<DemoRegionFilter>('all');
  useEffect(() => {
    function readRegion() { try { setRegion(readDemoState().region); } catch { /* Reset is offered in DemoPanel. */ } }
    readRegion();
    window.addEventListener('when-come-demo-region', readRegion);
    return () => window.removeEventListener('when-come-demo-region', readRegion);
  }, []);
  return <div aria-label="가상 지역 빠른 검색" className="flex flex-wrap gap-2">
    {DEMO_AREAS.filter(area => region === 'all' || area.id === region).map(area =>
      <button key={area.id} type="button" onClick={() => onSearch(area.name)} className="min-h-11 rounded-control border border-border-subtle bg-surface-input px-3 text-label text-text-secondary">{area.name} 가상 데이터 찾기</button>)}
  </div>;
}
