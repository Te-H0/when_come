import { vi } from 'vitest';
import type { NaverMapInstance } from '../services/naverMapsTypes';
import type { MappableStop } from '../types/map';

export const stops: MappableStop[] = [
  { id: 'one', name: '환승역 <img src=x onerror=alert(1)>', type: 'subway', lat: 37.5, lng: 127, arsId: null, laneName: '2호선' },
  { id: 'two', name: '환승역', type: 'subway', lat: 37.5, lng: 127, arsId: null, laneName: '4호선' },
  { id: 'three', name: '건너편', type: 'bus', lat: 37.501, lng: 127.001, arsId: '00123' },
];

export function getSdkReadyCallback(script: HTMLScriptElement): () => void {
  const name = new URL(script.src).searchParams.get('callback');
  if (!name) throw new Error('SDK callback parameter missing');
  const callback: unknown = Object.getOwnPropertyDescriptor(window, name)?.value;
  if (typeof callback !== 'function') throw new Error('SDK callback missing');
  return () => { callback(); };
}

export function createFakeSdk() {
  const maps: FakeMap[] = [];
  const markers: FakeMarker[] = [];
  const clicks = new Map<object, () => void>();
  class FakeMap {
    setCenter = vi.fn();
    fitBounds = vi.fn();
    autoResize = vi.fn();
    destroy = vi.fn();
    constructor(readonly container: HTMLElement, readonly options: { center: unknown; zoom: number }) { maps.push(this); }
  }
  class FakeMarker {
    setMap = vi.fn();
    setIcon = vi.fn();
    setZIndex = vi.fn();
    constructor(readonly options: { position: unknown; map: NaverMapInstance; icon: { content: HTMLElement }; title: string }) { markers.push(this); }
  }
  const sdk = {
    Map: FakeMap,
    Marker: FakeMarker,
    LatLng: class { constructor(readonly lat: number, readonly lng: number) {} },
    Event: {
      addListener: vi.fn((target: object, _event: string, listener: () => void) => { clicks.set(target, listener); return target; }),
      removeListener: vi.fn((target: unknown) => { if (typeof target === 'object' && target !== null) clicks.delete(target); }),
      clearInstanceListeners: vi.fn((target: object) => { clicks.delete(target); }),
    },
  };
  return { sdk, maps, markers, clicks };
}
