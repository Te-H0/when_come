import { lazy, Suspense, useEffect, useId, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StopMap } from '@/features/map/components/StopMap';
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
  const [candidate, setCandidate] = useState<RoutePlaceCandidate | null>(null);
  useEffect(() => { if (value) { search.changeQuery(value.name); setCandidate(null); } }, [value]);
  function handleInput(text: string) { onChange(null); setCandidate(null); search.changeQuery(text); }
  function handleConfirm() {
    if (!candidate) return;
    search.changeQuery(candidate.name);
    onChange(candidate);
    setCandidate(null);
  }
  const displayedPlaces = useMemo(() => value ? [value] : search.results, [value, search.results]);
  const mapPlaces = useMemo(() => displayedPlaces.map(mapPlace), [displayedPlaces]);
  const selectedKey = candidate ? `bus:${placeKey(candidate)}` : value ? `bus:${placeKey(value)}` : null;
  const hasStopCandidates = displayedPlaces.some(place => place.stopLabel);
  return <div className="space-y-3">
    <Label htmlFor={inputId} className="block text-label text-text-primary">{label}</Label>
    <div className="relative">
      <Input id={inputId} type="search" placeholder={placeholder} value={search.query}
        onChange={event => handleInput(event.target.value)} onCompositionStart={search.handleCompositionStart}
        onCompositionEnd={event => search.handleCompositionEnd(event.currentTarget.value)}
        className="h-12 rounded-control border-border-subtle pr-12 text-card-title" />
      {search.isLoading ? <Loader2 aria-label={`${label} 검색 중`} className="absolute right-3 top-3 h-5 w-5 animate-spin text-text-tertiary" /> : search.query &&
        <button type="button" onClick={() => handleInput('')} aria-label={`${label} 지우기`} className="absolute right-0 top-0 flex min-h-12 min-w-12 items-center justify-center text-text-tertiary"><X className="h-5 w-5" /></button>}
    </div>
    {QuickSearches && <Suspense fallback={null}><QuickSearches onSearch={handleInput} /></Suspense>}
    {search.error && <p role="alert" className="text-body text-text-danger">{search.error}<button type="button" onClick={search.retry} className="min-h-11 rounded-control px-3 text-button">장소 다시 검색</button></p>}
    {!value && !search.isLoading && !search.error && search.query && search.results.length === 0 && <p role="status" className="text-caption text-text-secondary">검색 결과가 없어요.</p>}
    {hasStopCandidates && <p role="status" className="text-caption text-text-secondary">
      {value?.stopLabel ?? '장소·주소 검색을 사용할 수 없어 역·정류장 검색 결과를 표시해요.'}
    </p>}
    {displayedPlaces.length > 0 && import.meta.env.VITE_ENABLE_STOP_MAP === 'true' &&
      <StopMap stops={mapPlaces} itemLabel={hasStopCandidates ? '정류장' : '장소'} showList={false} selectedStopKey={selectedKey} resultsKey={value ? placeKey(value) : search.resultsKey}
        onSelect={key => { const place = displayedPlaces.find(item => `bus:${placeKey(item)}` === key); if (place) setCandidate(place); }} />}
    {!value && <ul aria-label={`${label} 검색 결과`} className="space-y-3">
      {search.results.map(place => <li key={placeKey(place)}><button type="button" aria-pressed={candidate !== null && placeKey(candidate) === placeKey(place)}
        onClick={() => setCandidate(place)} className="min-h-12 w-full rounded-control border border-border-subtle bg-surface-card p-4 text-left">
        <span className="block text-label text-text-primary">{place.name}{candidate && placeKey(candidate) === placeKey(place) && ' · 선택됨'}</span>
        <span className="block text-caption text-text-secondary">{place.stopLabel ?? place.address}</span>
      </button></li>)}
    </ul>}
    {candidate && !value && <button type="button" onClick={handleConfirm} className="min-h-12 w-full rounded-control bg-text-primary px-4 text-button text-white">{label}로 선택</button>}
  </div>;
}
