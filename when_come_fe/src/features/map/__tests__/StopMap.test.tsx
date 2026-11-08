import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StopMap } from '../components/StopMap';
import { createNaverMapsAdapter } from '../services/naverMapsAdapter';
import { createFakeSdk, getSdkReadyCallback, stops } from './fixtures';

let resizeCallback: (() => void) | undefined;
const disconnect = vi.fn();
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 375, bottom: 288, width: 375, height: 288, toJSON() {} });
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resizeCallback = callback; }
    observe() {}
    disconnect = disconnect;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  document.querySelectorAll('script[data-when-come-maps]').forEach(script => script.remove());
  delete window.naver;
  delete window.navermap_authFailure;
});

describe('StopMap 선택과 수명주기', () => {
  it.each([undefined, 'false'])('운영에서 지도 플래그가 %s이면 SDK 없이 목록으로 선택한다', async flag => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_ENABLE_STOP_MAP', flag);
    const onSelect = vi.fn();
    render(<StopMap stops={stops} selectedStopKey={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /건너편/ }));
    expect(onSelect).toHaveBeenCalledWith('bus:three');
    expect(screen.queryByRole('region', { name: '정류장 위치 지도' })).toBeNull();
    expect(document.querySelector('script[data-when-come-maps]')).toBeNull();
  });

  it('운영에서 지도 플래그가 true이면 SDK를 로드하고 핀을 표시한다', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_ENABLE_STOP_MAP', 'true');
    vi.stubEnv('VITE_NAVER_MAPS_CLIENT_ID', 'public-test-id');
    vi.resetModules();
    const { StopMap: ProductionStopMap } = await import('../components/StopMap');
    const fake = createFakeSdk();

    render(<ProductionStopMap stops={stops} selectedStopKey={null} onSelect={vi.fn()} />);
    expect(screen.getByRole('region', { name: '정류장 위치 지도' })).toBeInTheDocument();
    const script = document.querySelector<HTMLScriptElement>('script[data-when-come-maps]');
    if (!script) throw new Error('SDK script missing');
    expect(new URL(script.src).searchParams.get('ncpKeyId')).toBe('public-test-id');
    window.naver = { maps: fake.sdk };
    await act(async () => { getSdkReadyCallback(script)(); });

    expect(fake.markers).toHaveLength(3);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('핀 선택은 동일 key의 목록에 반영되고 선택 rerender로 지도를 재생성하지 않는다', async () => {
    const fake = createFakeSdk();
    const adapter = createNaverMapsAdapter(fake.sdk);
    const onSelect = vi.fn();
    const { rerender, unmount } = render(<StopMap enabled adapter={adapter} stops={stops} selectedStopKey={null} onSelect={onSelect} />);
    await waitFor(() => expect(fake.markers).toHaveLength(3));
    act(() => fake.clicks.get(fake.markers[2])?.());
    expect(onSelect).toHaveBeenCalledWith('bus:three');
    rerender(<StopMap enabled adapter={adapter} stops={stops} selectedStopKey="bus:three" onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: /건너편/ })).toHaveAttribute('aria-pressed', 'true');
    expect(fake.maps).toHaveLength(1);
    expect(fake.markers).toHaveLength(3);
    expect(fake.maps[0].setCenter).toHaveBeenCalledOnce();
    expect(fake.maps[0].fitBounds).toHaveBeenCalledOnce();
    rerender(<StopMap enabled adapter={adapter} stops={stops.map(stop => ({ ...stop }))} selectedStopKey="bus:three" onSelect={() => undefined} />);
    expect(fake.maps[0].fitBounds).toHaveBeenCalledOnce();
    rerender(<StopMap enabled adapter={adapter} stops={stops} resultsKey="next-search" selectedStopKey="bus:three" onSelect={onSelect} />);
    expect(fake.maps[0].fitBounds).toHaveBeenCalledTimes(2);
    act(() => resizeCallback?.());
    expect(fake.maps[0].autoResize).toHaveBeenCalledOnce();
    unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(fake.maps[0].destroy).toHaveBeenCalledOnce();
    expect(fake.clicks.size).toBe(0);
  });

  it('겹친 핀은 각 호선 후보를 열고 명시적 목록 선택까지 완료하지 않는다', async () => {
    const fake = createFakeSdk();
    const onSelect = vi.fn();
    render(<StopMap enabled adapter={createNaverMapsAdapter(fake.sdk)} stops={stops} selectedStopKey={null} onSelect={onSelect} />);
    await waitFor(() => expect(fake.markers).toHaveLength(3));
    act(() => fake.clicks.get(fake.markers[0])?.());
    expect(onSelect).not.toHaveBeenCalled();
    const choices = screen.getByRole('list', { name: '같은 위치 정류장' });
    await userEvent.click(within(choices).getByRole('button', { name: /4호선/ }));
    expect(onSelect).toHaveBeenCalledWith('subway:two');
    expect(screen.queryByRole('list', { name: '같은 위치 정류장' })).toBeNull();
    expect(document.querySelector('img')).toBeNull();
  });

  it('어댑터 생성 실패에도 선택 목록을 보존하고 사용자 재시도로 복구한다', async () => {
    const fake = createFakeSdk();
    const realAdapter = createNaverMapsAdapter(fake.sdk);
    const create = vi.fn(realAdapter.create).mockImplementationOnce(() => { throw new Error('SDK unavailable'); });
    const onSelect = vi.fn();
    render(<StopMap enabled adapter={{ create }} stops={stops} selectedStopKey="bus:three" onSelect={onSelect} />);
    const retry = await screen.findByRole('button', { name: '지도 다시 시도' });
    act(() => resizeCallback?.());
    expect(create).toHaveBeenCalledOnce();
    await userEvent.click(retry);
    await waitFor(() => expect(fake.maps).toHaveLength(1));
    expect(screen.getByRole('button', { name: /건너편/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: '지도 다시 시도' })).toBeNull();
  });

  it('지도 갱신과 제거가 연속 실패해도 선택 목록을 유지하고 자동으로 지도를 재생성하지 않는다', async () => {
    const fake = createFakeSdk();
    const realAdapter = createNaverMapsAdapter(fake.sdk);
    const destroy = vi.fn(() => { throw new Error('SDK destroy failed'); });
    const create = vi.fn(realAdapter.create).mockImplementationOnce((container, center) => {
      container.appendChild(document.createElement('canvas'));
      return { ...realAdapter.create(container, center), fitStops: () => { throw new Error('SDK update failed'); }, destroy };
    });
    const onSelect = vi.fn();
    const { unmount } = render(<StopMap enabled adapter={{ create }} stops={stops} selectedStopKey="bus:three" onSelect={onSelect} />);
    const retry = await screen.findByRole('button', { name: '지도 다시 시도' });
    expect(screen.getByRole('status')).toHaveAttribute('data-map-failure', 'adapter');
    expect(document.querySelector('canvas')).toBeNull();
    expect(screen.getByRole('button', { name: /건너편/ })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: /4호선/ }));
    expect(onSelect).toHaveBeenCalledWith('subway:two');
    act(() => resizeCallback?.());
    expect(create).toHaveBeenCalledOnce();
    await userEvent.click(retry);
    expect(create).toHaveBeenCalledTimes(2);
    unmount();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('좌표 없는 발견 결과는 목록에서 유지하고 SDK 마커에서만 제외한다', async () => {
    const fake = createFakeSdk();
    const onSelect = vi.fn();
    render(<StopMap enabled adapter={createNaverMapsAdapter(fake.sdk)} stops={[...stops, { ...stops[0], id: 'missing', name: '위치 미확인', lat: null, lng: null }]} selectedStopKey={null} onSelect={onSelect} />);
    await waitFor(() => expect(fake.markers).toHaveLength(3));
    await userEvent.click(screen.getByRole('button', { name: /위치 미확인.*위치 정보 없음/ }));
    expect(onSelect).toHaveBeenCalledWith('subway:missing');
  });

  it('로딩 중 닫히면 늦은 SDK load가 지도를 만들지 않는다', async () => {
    vi.stubEnv('VITE_NAVER_MAPS_CLIENT_ID', 'public-test-id');
    const fake = createFakeSdk();
    const { unmount } = render(<StopMap enabled stops={stops} selectedStopKey={null} onSelect={vi.fn()} />);
    const script = document.querySelector<HTMLScriptElement>('script[data-when-come-maps]');
    if (!script) throw new Error('SDK script missing');
    const ready = getSdkReadyCallback(script);
    window.naver = { maps: fake.sdk };
    fireEvent.load(script);
    expect(fake.maps).toHaveLength(0);
    unmount();
    await act(async () => { ready(); });
    expect(fake.maps).toHaveLength(0);
    delete window.naver;
    vi.unstubAllEnvs();
  });
  it('컨테이너 크기가 확정된 후 생성하고 닫힌 뒤 resize 콜백은 무시한다', async () => {
    let visible = false;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ x: 0, y: 0, top: 0, left: 0, right: 375, bottom: 288, width: visible ? 375 : 0, height: visible ? 288 : 0, toJSON() {} }));
    const fake = createFakeSdk();
    const { unmount } = render(<StopMap enabled adapter={createNaverMapsAdapter(fake.sdk)} stops={stops} selectedStopKey={null} onSelect={vi.fn()} />);
    await act(async () => {});
    expect(fake.maps).toHaveLength(0);
    visible = true;
    act(() => resizeCallback?.());
    await waitFor(() => expect(fake.maps).toHaveLength(1));
    unmount();
    act(() => resizeCallback?.());
    expect(fake.maps).toHaveLength(1);
    expect(fake.maps[0].autoResize).not.toHaveBeenCalled();
  });

  it('공유 SDK 실패 후 한 지도의 재시도로 다른 지도도 함께 복구한다', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_NAVER_MAPS_CLIENT_ID', 'public-test-id');
    const { StopMap: SharedStopMap } = await import('../components/StopMap');
    const fake = createFakeSdk();
    render(<><SharedStopMap enabled stops={stops} selectedStopKey={null} onSelect={vi.fn()} /><SharedStopMap enabled stops={stops} selectedStopKey={null} onSelect={vi.fn()} /></>);
    const firstScript = document.querySelector('script[data-when-come-maps]');
    if (!firstScript) throw new Error('SDK script missing');
    fireEvent.error(firstScript);
    const retryButtons = await screen.findAllByRole('button', { name: '지도 다시 시도' });
    expect(retryButtons).toHaveLength(2);
    expect(screen.getAllByRole('status').map(status => status.getAttribute('data-map-failure'))).toEqual(['network', 'network']);
    await userEvent.click(retryButtons[0]);
    const retryScript = document.querySelector<HTMLScriptElement>('script[data-when-come-maps]');
    if (!retryScript) throw new Error('Retry script missing');
    window.naver = { maps: fake.sdk };
    await act(async () => { getSdkReadyCallback(retryScript)(); });
    await waitFor(() => expect(fake.maps).toHaveLength(2));
    expect(screen.queryByRole('button', { name: '지도 다시 시도' })).toBeNull();
    act(() => window.navermap_authFailure?.());
    expect(screen.getAllByRole('status').map(status => status.getAttribute('data-map-failure'))).toEqual(['authentication', 'authentication']);
    expect(fake.maps.every(map => map.destroy.mock.calls.length === 1)).toBe(true);
    delete window.naver;
    vi.unstubAllEnvs();
  });

});
