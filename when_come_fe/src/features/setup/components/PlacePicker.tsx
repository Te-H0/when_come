import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapSearchResults } from '@/features/map/components/MapSearchResults';
import { stopKey } from '@/features/map/types/map';
import { useDiscoverySearch } from '@/features/search/hooks/useDiscoverySearch';
import { searchRoutePlaces } from '../services/searchRoutePlaces';
import type { ApiPlace } from '@/types/api';
import type { StopSummary } from '@/features/map/types/map';
import type { RoutePlaceCandidate } from '../services/searchRoutePlaces';

const QuickSearches = import.meta.env.DEV && import.meta.env.VITE_LOCAL_DEMO === 'true'
  ? lazy(() => import('@/dev/demo/QuickSearches')) : null;

interface PlacePickerProps {
  label: string;
  placeholder: string;
  value: RoutePlaceCandidate | null;
  onChange: (place: ApiPlace | null) => void;
}
function placeKey(place: RoutePlaceCandidate): string { return `${place.name}|${place.stopLabel ?? place.address}|${place.x}|${place.y}`; }
function mapPlace(place: RoutePlaceCandidate): StopSummary {
  const lat = place.y.trim() ? Number(place.y) : NaN;
  const lng = place.x.trim() ? Number(place.x) : NaN;
  return { id: placeKey(place), name: place.name, type: 'bus', lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null, arsId: null, directionLabel: place.stopLabel ?? place.address };
}

export default function PlacePicker({ label, placeholder, value, onChange }: PlacePickerProps) {
  const inputId = useId();
  const search = useDiscoverySearch(searchRoutePlaces, 8, value?.name ?? '', value === null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const focusChangeRef = useRef(false);
  useEffect(() => {
    if (!value) return;
    search.changeQuery(value.name);
    setSelectedKey(null);
    if (focusChangeRef.current) changeRef.current?.focus({ preventScroll: true });
    focusChangeRef.current = false;
  }, [value]);
  function handleInput(text: string) { onChange(null); setSelectedKey(null); search.changeQuery(text); }
  function handleSelect(key: string | null) {
    document.getElementById(inputId)?.blur();
    setSelectedKey(key);
  }
  function handleChange() {
    handleInput('');
    document.getElementById(inputId)?.focus();
  }
  function handleConfirm() {
    const candidate = search.results.find(place => `bus:${placeKey(place)}` === selectedKey);
    if (!candidate) return;
    focusChangeRef.current = true;
    onChange(candidate);
  }
  const mapPlaces = useMemo(() => search.results.map(mapPlace), [search.results]);
  const hasCandidate = mapPlaces.some(place => stopKey(place) === selectedKey);
  const hasStopCandidates = search.results.some(place => place.stopLabel);
  return <div className="min-w-0 space-y-3">
    <Label htmlFor={inputId} className="block text-label text-text-primary">{label}</Label>
    <div className="relative">
      <Input id={inputId} type="search" placeholder={placeholder} value={value?.name ?? search.query}
        onChange={event => handleInput(event.target.value)} onCompositionStart={search.handleCompositionStart}
        onCompositionEnd={event => search.handleCompositionEnd(event.currentTarget.value)}
        className={`h-12 rounded-control border-border-subtle text-card-title ${value ? 'pr-16' : 'pr-12'}`} />
      {value ? <button ref={changeRef} type="button" onClick={handleChange} aria-label={`${label} 변경`} className="absolute right-0 top-0 min-h-12 rounded-control px-3 text-button text-text-primary">변경</button> : search.isLoading ? <Loader2 aria-label={`${label} 검색 중`} className="absolute right-3 top-3 h-5 w-5 animate-spin text-text-tertiary" /> : search.query &&
        <button type="button" onClick={() => handleInput('')} aria-label={`${label} 지우기`} className="absolute right-0 top-0 flex min-h-12 min-w-12 items-center justify-center text-text-tertiary"><X className="h-5 w-5" /></button>}
    </div>
    {value && <p className="break-words text-caption text-text-secondary">{value.stopLabel ?? value.address}</p>}
    {!value && !search.query && <p className="text-caption text-text-secondary">장소 이름이나 주소를 입력하세요.</p>}
    {!value && !hasCandidate && QuickSearches && <Suspense fallback={null}><QuickSearches onSearch={handleInput} /></Suspense>}
    {!value && search.error && <p role="alert" className="text-body text-text-danger">{search.error}<button type="button" onClick={search.retry} className="min-h-11 rounded-control px-3 text-button">장소 다시 검색</button></p>}
    {!value && !search.isLoading && !search.error && search.query && search.results.length === 0 && <p role="status" className="text-caption text-text-secondary">검색 결과가 없어요.</p>}
    {!value && !hasCandidate && hasStopCandidates && <p role="status" className="text-caption text-text-secondary">장소·주소 검색을 사용할 수 없어 역·정류장 검색 결과를 표시해요.</p>}
    {!value && mapPlaces.length > 0 && <MapSearchResults key={search.resultsKey} stops={mapPlaces} resultsKey={search.resultsKey} itemLabel="장소"
      listLabel={`${label} 검색 결과`} selectedKey={selectedKey} confirmLabel={`${label}로 선택`} onSelect={handleSelect} onConfirm={handleConfirm} />}
  </div>;
}
