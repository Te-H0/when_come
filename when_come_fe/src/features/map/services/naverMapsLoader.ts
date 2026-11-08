import { isNaverMapsSdk } from './naverMapsTypes';
import type { NaverMapsSdk } from './naverMapsTypes';

export type MapsLoaderState = 'idle' | 'loading' | 'ready' | 'error';
export type MapsLoadErrorReason = 'configuration' | 'network' | 'timeout' | 'authentication' | 'sdk';

export class MapsLoadError extends Error {
  constructor(readonly reason: MapsLoadErrorReason) {
    super('지도를 불러오지 못했어요. 목록에서 정류장을 선택할 수 있어요.');
    this.name = 'MapsLoadError';
  }
}

let state: MapsLoaderState = 'idle';
let errorReason: MapsLoadErrorReason | null = null;
let attemptGeneration = 0;
let sharedPromise: Promise<NaverMapsSdk> | undefined;
const subscribers = new Set<() => void>();

export function getMapsLoaderAttempt(): number { return attemptGeneration; }
export function getMapsLoaderState(): MapsLoaderState { return state; }
export function getMapsLoaderErrorReason(): MapsLoadErrorReason | null { return errorReason; }
export function subscribeMapsLoader(listener: () => void): () => void {
  subscribers.add(listener);
  return () => { subscribers.delete(listener); };
}
function setState(next: MapsLoaderState) {
  state = next;
  subscribers.forEach(listener => listener());
}

/** Lazy, shared and sticky on failure. Only an explicit retry starts another attempt. */
export function loadNaverMaps(): Promise<NaverMapsSdk> {
  if (sharedPromise) return sharedPromise;
  const clientId = import.meta.env.VITE_NAVER_MAPS_CLIENT_ID?.trim();
  if (!clientId || typeof window === 'undefined') {
    errorReason = 'configuration';
    sharedPromise = Promise.reject(new MapsLoadError('configuration'));
    setState('error');
    return sharedPromise;
  }
  setState('loading');
  sharedPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let active = true;
    let settled = false;
    const previousAuthFailure = window.navermap_authFailure;
    const callbackName = `whenComeMapsReady${attemptGeneration}` as const;
    const clearReadyCallback = () => {
      if (window[callbackName] === handleReady) delete window[callbackName];
    };
    const fail = (reason: MapsLoadErrorReason) => {
      if (!active) return;
      active = false;
      errorReason = reason;
      const error = new MapsLoadError(reason);
      clearTimeout(timer);
      clearReadyCallback();
      script.onerror = null;
      script.remove();
      if (window.navermap_authFailure === handleAuthFailure) {
        window.navermap_authFailure = previousAuthFailure;
      }
      if (settled) {
        sharedPromise = Promise.reject(error);
        // Authentication may fail after script.onload, with no current waiter.
        void sharedPromise.catch(() => undefined);
      } else {
        settled = true;
        reject(error);
      }
      setState('error');
    };
    const handleAuthFailure = () => { fail('authentication'); };
    window.navermap_authFailure = handleAuthFailure;
    const timer = setTimeout(() => fail('timeout'), 8000);
    script.async = true;
    script.dataset.whenComeMaps = 'true';
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}&callback=${callbackName}`;
    script.onerror = () => fail('network');
    function handleReady() {
      // The SDK can call back before exporting its namespace in the same script evaluation.
      queueMicrotask(() => {
        if (!active || settled) return;
        const sdk: unknown = window.naver?.maps;
        if (!isNaverMapsSdk(sdk)) { fail('sdk'); return; }
        clearTimeout(timer);
        clearReadyCallback();
        settled = true;
        setState('ready');
        resolve(sdk);
      });
    }
    window[callbackName] = handleReady;
    document.head.appendChild(script);
  });
  return sharedPromise;
}

export function retryNaverMaps(): Promise<NaverMapsSdk> {
  if (state !== 'error') return loadNaverMaps();
  sharedPromise = undefined;
  errorReason = null;
  attemptGeneration += 1;
  setState('idle');
  return loadNaverMaps();
}
