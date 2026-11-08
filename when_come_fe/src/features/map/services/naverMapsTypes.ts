/** Minimal SDK boundary; provider globals enter as unknown and are checked before use. */
export interface NaverMapInstance {
  setCenter: (position: unknown) => void;
  fitBounds: (positions: unknown[], options: { maxZoom: number; top: number; right: number; bottom: number; left: number }) => void;
  autoResize: () => void;
  destroy: () => void;
}

export interface NaverMarkerInstance {
  setMap: (map: NaverMapInstance | null) => void;
  setIcon: (icon: { content: HTMLElement }) => void;
  setZIndex: (zIndex: number) => void;
}

export interface NaverMapsSdk {
  LatLng: new (lat: number, lng: number) => unknown;
  Map: new (container: HTMLElement, options: { center: unknown; zoom: number }) => NaverMapInstance;
  Marker: new (options: { position: unknown; map: NaverMapInstance; icon: { content: HTMLElement }; title: string }) => NaverMarkerInstance;
  Event: {
    addListener: (target: object, event: string, listener: () => void) => unknown;
    removeListener: (listener: unknown) => void;
    clearInstanceListeners: (target: object) => void;
  };
}

export function isNaverMapsSdk(value: unknown): value is NaverMapsSdk {
  if (typeof value !== 'object' || value === null) return false;
  if (!('Map' in value) || typeof value.Map !== 'function' ||
      !('LatLng' in value) || typeof value.LatLng !== 'function' ||
      !('Marker' in value) || typeof value.Marker !== 'function' ||
      !('Event' in value) || typeof value.Event !== 'object' || value.Event === null) return false;
  return 'addListener' in value.Event && typeof value.Event.addListener === 'function' &&
    'removeListener' in value.Event && typeof value.Event.removeListener === 'function' &&
    'clearInstanceListeners' in value.Event && typeof value.Event.clearInstanceListeners === 'function';
}

declare global {
  interface Window {
    naver?: { maps?: unknown };
    navermap_authFailure?: () => void;
    [key: `whenComeMapsReady${number}`]: (() => void) | undefined;
  }
}
