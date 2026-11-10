import { lazy, Suspense, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2, X } from 'lucide-react';
import { searchStops } from '@/lib/api';
import { MapSearchResults } from '@/features/map/components/MapSearchResults';
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
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLLabelElement>(null);
  const search = useDiscoverySearch(searchStops, 20);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const mapStops = useMemo(() => search.results.map(stop => ({ ...stop, arsId: stop.arsId ?? null })), [search.results]);
  const selected = search.results.find(stop => stopKey(stop) === selectedKey);
  function handleInput(text: string) {
    search.changeQuery(text);
    setSelectedKey(null);
  }
  function handleSelect(key: string | null) {
    inputRef.current?.blur();
    setSelectedKey(key);
  }
  function handleConfirm() {
    if (!selected) return;
    handleInput('');
    labelRef.current?.focus({ preventScroll: true });
    if (selected.type === 'bus') onComplete({ type: 'bus', stop: selected });
    else onComplete({ type: 'subway', stop: selected, direction: { updn: null, nextStop: null } });
  }
  return <div className="flex flex-col gap-3">
    <div className="flex items-center gap-2">
      {onCancel && <button type="button" onClick={onCancel} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-text-secondary hover:bg-surface-muted" aria-label="정류장 선택 취소"><ArrowLeft className="h-4 w-4" /></button>}
      <label ref={labelRef} tabIndex={-1} htmlFor={inputId} className="text-label text-text-secondary">정류장/역 검색</label>
    </div>
    <div className="relative">
      <input ref={inputRef} id={inputId} type="search" value={search.query} onChange={event => handleInput(event.target.value)}
        onCompositionStart={search.handleCompositionStart} onCompositionEnd={event => search.handleCompositionEnd(event.currentTarget.value)}
        placeholder="정류장 또는 역 이름 입력" autoComplete="off" autoCorrect="off" spellCheck={false}
        className="h-12 w-full rounded-control border border-border-default bg-surface-card pl-3 pr-12 text-card-title text-text-primary focus:outline-none focus:ring-2 focus:ring-ring-focus" />
      {search.isLoading ? <Loader2 aria-label="정류장 검색 중" className="absolute right-3 top-3 h-5 w-5 animate-spin text-text-tertiary" /> : search.query &&
        <button type="button" onClick={() => handleInput('')} className="absolute right-0 top-0 flex min-h-12 min-w-12 items-center justify-center text-text-tertiary" aria-label="정류장 검색 지우기"><X className="h-5 w-5" /></button>}
    </div>
    {!selected && QuickSearches && <Suspense fallback={null}><QuickSearches onSearch={handleInput} /></Suspense>}
    {search.error && <div role="alert" className="text-body text-text-danger">{search.error}<button type="button" onClick={search.retry} className="min-h-11 rounded-control px-3 text-button">검색 다시 시도</button></div>}
    {!search.isLoading && !search.error && search.query && search.results.length === 0 && <p role="status" className="text-body text-text-secondary">검색 결과가 없어요. 다른 이름으로 찾아보세요.</p>}
    {mapStops.length > 0 && <MapSearchResults key={search.resultsKey} stops={mapStops} resultsKey={search.resultsKey} itemLabel="정류장"
      listLabel="지도 정류장 목록" selectedKey={selectedKey} confirmLabel="이 정류장 선택" onSelect={handleSelect} onConfirm={handleConfirm}
      note={selected?.type === 'subway' ? '이 선택기는 양방향 도착정보를 표시해요.' : undefined} />}
  </div>;
}
