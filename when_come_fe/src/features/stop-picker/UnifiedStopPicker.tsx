import { lazy, Suspense, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, X } from 'lucide-react';
import { searchStops } from '@/lib/api';
import { StopMap } from '@/features/map/components/StopMap';
import { stopKey } from '@/features/map/types/map';
import { useDiscoverySearch } from '@/features/search/hooks/useDiscoverySearch';
import type { ApiStop } from '@/types/api';

const QuickSearches = import.meta.env.DEV && import.meta.env.VITE_LOCAL_DEMO === 'true'
  ? lazy(() => import('@/dev/demo/QuickSearches')) : null;

export type PickerPayload =
  | { type: 'bus'; stop: ApiStop }
  | { type: 'subway'; stop: ApiStop; /** Legacy picker explicitly retains its existing both-direction behavior. */ direction: { updn: null; nextStop: null } };

interface UnifiedStopPickerProps {
  onComplete: (payload: PickerPayload) => void;
  onCancel?: () => void;
}

export default function UnifiedStopPicker({ onComplete, onCancel = undefined }: UnifiedStopPickerProps) {
  const search = useDiscoverySearch(searchStops, 20);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const mapStops = useMemo(() => search.results.map(stop => ({ ...stop, arsId: stop.arsId ?? null })), [search.results]);
  const selected = search.results.find(stop => stopKey(stop) === selectedKey);
  function handleConfirm() {
    if (!selected) return;
    if (selected.type === 'bus') onComplete({ type: 'bus', stop: selected });
    else onComplete({ type: 'subway', stop: selected, direction: { updn: null, nextStop: null } });
    setSelectedKey(null);
  }
  return <div className="flex flex-col gap-3">
    <div className="flex items-center gap-2">
      {onCancel && <button type="button" onClick={onCancel} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-text-secondary hover:bg-surface-muted" aria-label="정류장 선택 취소"><ArrowLeft className="h-4 w-4" /></button>}
      <label htmlFor="stop-search" className="text-label text-text-secondary">정류장/역 검색</label>
    </div>
    <div className="relative">
      <input id="stop-search" type="search" value={search.query} onChange={event => { search.changeQuery(event.target.value); setSelectedKey(null); }}
        onCompositionStart={search.handleCompositionStart} onCompositionEnd={event => search.handleCompositionEnd(event.currentTarget.value)}
        placeholder="정류장 또는 역 이름 입력" autoComplete="off" autoCorrect="off" spellCheck={false}
        className="h-12 w-full rounded-control border border-border-default bg-surface-card pl-3 pr-12 text-card-title text-text-primary focus:outline-none focus:ring-2 focus:ring-ring-focus" />
      {search.isLoading ? <Loader2 aria-label="정류장 검색 중" className="absolute right-3 top-3 h-5 w-5 animate-spin text-text-tertiary" /> : search.query &&
        <button type="button" onClick={() => { search.changeQuery(''); setSelectedKey(null); }} className="absolute right-0 top-0 flex min-h-12 min-w-12 items-center justify-center text-text-tertiary" aria-label="정류장 검색 지우기"><X className="h-5 w-5" /></button>}
    </div>
    {QuickSearches && <Suspense fallback={null}><QuickSearches onSearch={text => { search.changeQuery(text); setSelectedKey(null); }} /></Suspense>}
    {search.error && <div role="alert" className="text-body text-text-danger">{search.error}<button type="button" onClick={search.retry} className="min-h-11 rounded-control px-3 text-button">검색 다시 시도</button></div>}
    {!search.isLoading && !search.error && search.query && search.results.length === 0 && <p role="status" className="text-body text-text-secondary">검색 결과가 없어요. 다른 이름으로 찾아보세요.</p>}
    {search.results.length > 0 && <>
      <p role="status" className="text-caption text-text-secondary">검색 결과 {search.results.length}개 · 지도와 목록에서 같은 정류장을 선택할 수 있어요.</p>
      <StopMap stops={mapStops} resultsKey={search.resultsKey} selectedStopKey={selectedKey} onSelect={setSelectedKey} />
    </>}
    {selected && <div className="space-y-3 rounded-card border border-border-default bg-surface-card p-4">
      <p className="text-body text-text-primary">{selected.name}{selected.laneName ? ` · ${selected.laneName}` : ''}</p>
      {selected.type === 'subway' && <p className="text-caption text-text-secondary">이 선택기는 양방향 도착정보를 표시해요.</p>}
      <button type="button" onClick={handleConfirm} className="min-h-12 w-full rounded-control bg-text-primary px-4 text-button text-white">이 정류장 선택</button>
    </div>}
  </div>;
}
