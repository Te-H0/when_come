import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSdk, getSdkReadyCallback } from './fixtures';

async function freshLoader() {
  vi.resetModules();
  vi.stubEnv('VITE_NAVER_MAPS_CLIENT_ID', 'public-test-id');
  return import('../services/naverMapsLoader');
}
function getScript() {
  const script = document.querySelector('script[data-when-come-maps]');
  if (!(script instanceof HTMLScriptElement)) throw new Error('SDK script missing');
  return script;
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  document.querySelectorAll('script[data-when-come-maps]').forEach(script => script.remove());
  delete window.naver;
  delete window.navermap_authFailure;
});

describe('공유 지도 로더', () => {
  it('호출 전에는 삽입하지 않고 동시 소비자는 한 스크립트와 promise를 공유한다', async () => {
    const loader = await freshLoader();
    expect(document.querySelector('script[data-when-come-maps]')).toBeNull();
    const first = loader.loadNaverMaps();
    expect(loader.loadNaverMaps()).toBe(first);
    expect(getScript().src).toContain('ncpKeyId=public-test-id');
    expect(getScript().src).not.toContain('ncpClientId');
    window.naver = { maps: createFakeSdk().sdk };
    const script = getScript();
    script.dispatchEvent(new Event('load'));
    expect(loader.getMapsLoaderState()).toBe('loading');
    getSdkReadyCallback(script)();
    await expect(first).resolves.toBe(window.naver.maps);
    expect(loader.getMapsLoaderState()).toBe('ready');
    expect(loader.loadNaverMaps()).toBe(first);
    expect(() => getSdkReadyCallback(script)).toThrow('SDK callback missing');
  });

  it('준비 콜백과 같은 스크립트 실행에서 뒤늦게 설정된 SDK를 확인한다', async () => {
    const loader = await freshLoader();
    const promise = loader.loadNaverMaps();
    getSdkReadyCallback(getScript())();
    expect(loader.getMapsLoaderState()).toBe('loading');
    const { sdk } = createFakeSdk();
    window.naver = { maps: sdk };
    await expect(promise).resolves.toBe(sdk);
  });

  it.each(['network', 'authentication', 'timeout', 'sdk'])('%s 실패 후 자동재시도 없이 명시적 재시도만 허용한다', async reason => {
    const loader = await freshLoader();
    const previousAuthFailure = vi.fn();
    window.navermap_authFailure = previousAuthFailure;
    const first = loader.loadNaverMaps();
    const rejection = expect(first).rejects.toMatchObject({ reason });
    const oldScript = getScript();
    const oldReadyCallback = getSdkReadyCallback(oldScript);
    const oldAuthFailure = window.navermap_authFailure;
    if (reason === 'network') oldScript.dispatchEvent(new Event('error'));
    if (reason === 'authentication') window.navermap_authFailure?.();
    if (reason === 'timeout') await vi.advanceTimersByTimeAsync(8000);
    if (reason === 'sdk') { window.naver = { maps: {} }; oldReadyCallback(); }
    await rejection;
    expect(loader.getMapsLoaderState()).toBe('error');
    expect(loader.loadNaverMaps()).toBe(first);
    expect(document.querySelector('script[data-when-come-maps]')).toBeNull();
    expect(() => getSdkReadyCallback(oldScript)).toThrow('SDK callback missing');
    expect(window.navermap_authFailure).toBe(previousAuthFailure);
    const retry = loader.retryNaverMaps();
    expect(retry).not.toBe(first);
    expect(document.querySelectorAll('script[data-when-come-maps]')).toHaveLength(1);
    window.naver = { maps: createFakeSdk().sdk };
    oldAuthFailure?.();
    oldReadyCallback();
    expect(loader.getMapsLoaderState()).toBe('loading');
    getSdkReadyCallback(getScript())();
    await expect(retry).resolves.toBe(window.naver.maps);
  });

  it('load 뒤 인증실패도 알리고 구독을 해제한 소비자는 변경하지 않는다', async () => {
    const loader = await freshLoader();
    const active = vi.fn();
    const inactive = vi.fn();
    const unsubscribe = loader.subscribeMapsLoader(inactive);
    loader.subscribeMapsLoader(active);
    unsubscribe();
    const promise = loader.loadNaverMaps();
    window.naver = { maps: createFakeSdk().sdk };
    getSdkReadyCallback(getScript())();
    await promise;
    window.navermap_authFailure?.();
    expect(loader.getMapsLoaderState()).toBe('error');
    expect(active).toHaveBeenCalled();
    expect(inactive).not.toHaveBeenCalled();
    await expect(loader.loadNaverMaps()).rejects.toMatchObject({ reason: 'authentication' });
  });

  it('공개키가 없으면 스크립트를 만들지 않는다', async () => {
    const loader = await freshLoader();
    vi.stubEnv('VITE_NAVER_MAPS_CLIENT_ID', '');
    await expect(loader.loadNaverMaps()).rejects.toMatchObject({ reason: 'configuration' });
    expect(document.querySelector('script[data-when-come-maps]')).toBeNull();
  });
});
