import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createNaverMapsAdapter } from '../services/naverMapsAdapter';
import { getMapsLoaderAttempt, getMapsLoaderErrorReason, getMapsLoaderState, loadNaverMaps, MapsLoadError, retryNaverMaps, subscribeMapsLoader } from '../services/naverMapsLoader';
import { isMappableStop, stopKey } from '../types/map';
import type { StopMapAdapter, StopMapView } from '../services/naverMapsAdapter';
import type { MapsLoadErrorReason } from '../services/naverMapsLoader';
import type { MapCoordinates, StopSummary } from '../types/map';

const DEFAULT_CENTER: MapCoordinates = { lat: 37.5666, lng: 126.9784 };
type MapFailure = MapsLoadErrorReason | 'adapter';

interface StopMapProps {
  stops: readonly StopSummary[];
  selectedStopKey: string | null;
  onSelect: (key: string) => void;
  enabled?: boolean;
  showList?: boolean;
  itemLabel?: '정류장' | '장소';
  initialCenter?: MapCoordinates;
  /** Change for a new discovery request; omitted uses identity/coordinate content. */
  resultsKey?: string;
  /** Injectable SDK boundary for isolated QA and lifecycle tests. */
  adapter?: StopMapAdapter;
}

/** Display/selection only. It never fetches stops, requests location or saves a selection. */
export function StopMap({
  stops, selectedStopKey, onSelect,
  enabled = import.meta.env.VITE_ENABLE_STOP_MAP === 'true',
  showList = true, itemLabel = '정류장',
  initialCenter = DEFAULT_CENTER, resultsKey = undefined, adapter = undefined,
}: StopMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef(new Map<string, HTMLButtonElement>());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const lastFitRef = useRef<{ view: StopMapView; key: string }>();
  const failViewRef = useRef<(reason?: MapFailure) => void>();
  const firstCenterRef = useRef(initialCenter);
  const [view, setView] = useState<StopMapView | null>(null);
  const [failure, setFailure] = useState<MapFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [overlapKeys, setOverlapKeys] = useState<string[]>([]);
  const loaderAttempt = useSyncExternalStore(subscribeMapsLoader, getMapsLoaderAttempt, () => 0);
  const loaderState = useSyncExternalStore(subscribeMapsLoader, getMapsLoaderState, () => 'idle');
  const validStops = stops.filter(isMappableStop);
  const resultIdentity = resultsKey ?? validStops.map(stop => `${stopKey(stop)}:${stop.lat}:${stop.lng}`).join('|');

  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;
    let active = true;
    let currentView: StopMapView | undefined;
    let resolvedAdapter: StopMapAdapter | undefined;
    let observer: ResizeObserver | undefined;
    setFailure(null);
    function dispose() {
      if (!active) return;
      active = false;
      observer?.disconnect();
      window.removeEventListener('resize', handleResize);
      const previousView = currentView;
      currentView = undefined;
      lastFitRef.current = undefined;
      try { previousView?.destroy(); } catch {
        // An SDK teardown failure must not escape to the setup page.
      }
      container?.replaceChildren();
    }
    function fail(reason: MapFailure = 'adapter') {
      if (!active) return;
      dispose();
      setView(null);
      setOverlapKeys([]);
      setFailure(reason);
    }
    failViewRef.current = fail;
    function handleResize() {
      if (!active || !container || !resolvedAdapter) return;
      const { width, height } = container.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      try {
        if (!currentView) {
          currentView = resolvedAdapter.create(container, firstCenterRef.current);
          setView(currentView);
        } else currentView.resize();
      } catch {
        fail();
      }
    }
    async function initialize() {
      try {
        const nextAdapter = adapter ?? createNaverMapsAdapter(await loadNaverMaps());
        if (!active || !container) return;
        resolvedAdapter = nextAdapter;
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(handleResize);
          observer.observe(container);
        }
        window.addEventListener('resize', handleResize);
        handleResize();
      } catch (error) {
        fail(error instanceof MapsLoadError ? error.reason : 'adapter');
      }
    }
    void initialize();
    return () => {
      failViewRef.current = undefined;
      dispose();
      setView(null);
    };
  }, [enabled, adapter, attempt, loaderAttempt]);

  useEffect(() => {
    if (!adapter && loaderState === 'error' && enabled) {
      failViewRef.current?.(getMapsLoaderErrorReason() ?? 'sdk');
    }
  }, [adapter, loaderState, enabled]);

  useEffect(() => {
    if (!view) return;
    try {
      view.setStops(stops.filter(isMappableStop), keys => {
        if (keys.length > 1) setOverlapKeys(keys);
        else if (keys[0]) {
          setOverlapKeys([]);
          rowsRef.current.get(keys[0])?.scrollIntoView?.({ block: 'nearest' });
          onSelectRef.current(keys[0]);
        }
      });
    } catch {
      failViewRef.current?.();
    }
  }, [view, stops]);

  useEffect(() => {
    if (!view || !validStops.length) return;
    if (lastFitRef.current?.view === view && lastFitRef.current.key === resultIdentity) return;
    try {
      view.fitStops(validStops);
      lastFitRef.current = { view, key: resultIdentity };
    } catch {
      failViewRef.current?.();
    }
  }, [view, stops, resultIdentity]);

  useEffect(() => {
    if (!view) return;
    try { view.setSelectedKey(selectedStopKey); } catch {
      failViewRef.current?.();
    }
  }, [view, selectedStopKey, stops]);

  function handleRetry() {
    setFailure(null);
    if (!adapter) {
      // Start synchronously so every mounted consumer shares the same attempt.
      void retryNaverMaps().catch(() => undefined);
    }
    setAttempt(value => value + 1);
  }
  function handleSelect(key: string) {
    setOverlapKeys([]);
    onSelect(key);
  }
  const overlappingStops = validStops.filter(stop => overlapKeys.includes(stopKey(stop)));

  return (
    <section aria-label={`${itemLabel} 지도와 목록`} className="space-y-3">
      {enabled && <div ref={containerRef} hidden={failure !== null} role="region" aria-label={`${itemLabel} 위치 지도`} className="h-72 w-full rounded-card border border-border-subtle bg-surface-muted" />}
      {enabled && !failure && !view && <p role="status" className="text-body text-text-secondary">지도를 불러오는 중이에요.</p>}
      {enabled && failure && <div role="status" {...(import.meta.env.DEV && { 'data-map-failure': failure })} className="rounded-card border border-border-subtle bg-surface-card p-4">
        <p className="text-body text-text-secondary">지도를 불러오지 못했어요. 목록에서 {itemLabel}을 선택할 수 있어요.</p>
        <button type="button" onClick={handleRetry} className="min-h-12 rounded-control px-4 text-button text-text-primary">지도 다시 시도</button>
      </div>}
      {overlappingStops.length > 1 && <div className="rounded-card border border-border-default bg-surface-card p-4">
        <p role="status" className="text-body text-text-primary">같은 위치의 {itemLabel}이에요. {itemLabel} 정보를 확인해 주세요.</p>
        <ul aria-label={`같은 위치 ${itemLabel}`}>
          {overlappingStops.map(stop => <li key={stopKey(stop)}>
            <button type="button" onClick={() => handleSelect(stopKey(stop))} className="min-h-12 w-full rounded-control p-3 text-left text-button text-text-primary">{stop.name} · {stop.laneName || stop.arsId || stop.directionLabel || stop.id}</button>
          </li>)}
        </ul>
      </div>}
      {showList && <ul aria-label={`지도 ${itemLabel} 목록`} className="space-y-3">
        {stops.map(stop => {
          const key = stopKey(stop);
          const selected = key === selectedStopKey;
          return <li key={key}>
            <button ref={node => { if (node) rowsRef.current.set(key, node); else rowsRef.current.delete(key); }} type="button" aria-pressed={selected}
              onClick={() => handleSelect(key)} className="min-h-12 w-full rounded-control border border-border-default bg-surface-card p-4 text-left text-body text-text-primary">
              <span className="block text-card-title">{stop.name}{selected && ' · 선택됨'}</span>
              <span className="block text-label text-text-secondary">{stop.type === 'subway' ? stop.laneName || '지하철' : `버스 · ${stop.arsId || '정류장 번호 없음'}`}{stop.directionLabel ? ` · ${stop.directionLabel}` : ''}{!isMappableStop(stop) && ' · 위치 정보 없음'}</span>
            </button>
          </li>;
        })}
      </ul>}
    </section>
  );
}
