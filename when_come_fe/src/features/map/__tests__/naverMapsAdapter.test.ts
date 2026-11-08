import { describe, expect, it, vi } from 'vitest';
import { createNaverMapsAdapter } from '../services/naverMapsAdapter';
import { isMapCoordinates, isMappableStop } from '../types/map';
import { createFakeSdk, stops } from './fixtures';

describe('지도 SDK 어댑터', () => {
  it('좌표축을 유지하고 같은 위치의 다른 ID를 선택 후보로 보존한다', () => {
    const { sdk, maps, markers, clicks } = createFakeSdk();
    const onSelect = vi.fn();
    const view = createNaverMapsAdapter(sdk).create(document.createElement('div'), { lat: 37, lng: 127 });
    view.setStops(stops, onSelect);
    expect(maps[0].options.center).toEqual({ lat: 37, lng: 127 });
    expect(markers).toHaveLength(3);
    expect(markers[0].options.position).toEqual({ lat: 37.5, lng: 127 });
    clicks.get(markers[0])?.();
    expect(onSelect).toHaveBeenCalledWith(['subway:one', 'subway:two']);
    expect(markers[0].options.icon.content.textContent).toContain('<img');
    expect(markers[0].options.icon.content.querySelector('img')).toBeNull();
  });

  it('선택이 바뀔 때만 지도를 이동하고 마커와 모든 리스너를 해제한다', () => {
    const { sdk, maps, markers, clicks } = createFakeSdk();
    const onSelect = vi.fn();
    const view = createNaverMapsAdapter(sdk).create(document.createElement('div'), { lat: 37, lng: 127 });
    view.setStops(stops, onSelect);
    const staleClick = clicks.get(markers[0]);
    view.setSelectedKey('bus:three');
    view.setSelectedKey('bus:three');
    expect(maps[0].setCenter).toHaveBeenCalledTimes(1);
    expect(markers[2].setIcon.mock.calls[0][0].content.textContent).toContain('선택');
    view.resize();
    expect(maps[0].autoResize).toHaveBeenCalledOnce();
    view.setStops([], onSelect);
    expect(markers.every(marker => marker.setMap.mock.calls[0][0] === null)).toBe(true);
    view.destroy();
    view.destroy();
    staleClick?.();
    expect(onSelect).not.toHaveBeenCalled();
    expect(clicks.size).toBe(0);
    expect(maps[0].destroy).toHaveBeenCalledOnce();
  });

  it('리스너 해제나 마커 분리가 실패해도 남은 SDK 정리를 시도한다', () => {
    const { sdk, maps, markers, clicks } = createFakeSdk();
    const onSelect = vi.fn();
    const view = createNaverMapsAdapter(sdk).create(document.createElement('div'), { lat: 37, lng: 127 });
    view.setStops(stops, onSelect);
    const staleClick = clicks.get(markers[0]);
    sdk.Event.removeListener.mockImplementationOnce(() => { throw new TypeError('SDK Event is unavailable'); });
    sdk.Event.clearInstanceListeners.mockImplementationOnce(() => { throw new TypeError('SDK Event is unavailable'); });
    markers[0].setMap.mockImplementationOnce(() => { throw new TypeError('SDK Marker is unavailable'); });

    view.setStops([stops[2]], onSelect);
    staleClick?.();
    expect(onSelect).not.toHaveBeenCalled();
    expect(markers.slice(0, 3).every(marker => marker.setMap.mock.calls[0][0] === null)).toBe(true);
    sdk.Event.clearInstanceListeners.mockImplementation(() => { throw new TypeError('SDK Event is unavailable'); });
    maps[0].destroy.mockImplementation(() => { throw new TypeError('SDK Map is unavailable'); });

    expect(() => view.destroy()).not.toThrow();
    view.destroy();
    expect(markers[3].setMap).toHaveBeenCalledWith(null);
    expect(maps[0].destroy).toHaveBeenCalledOnce();
  });

  it('클릭 리스너 등록이 실패하면 이미 생성한 마커를 모두 분리한다', () => {
    const { sdk, markers, clicks } = createFakeSdk();
    const view = createNaverMapsAdapter(sdk).create(document.createElement('div'), { lat: 37, lng: 127 });
    sdk.Event.addListener.mockImplementation((target, _event, listener) => {
      if (target === markers[1]) throw new TypeError('SDK Event is unavailable');
      clicks.set(target, listener);
      return target;
    });

    expect(() => view.setStops(stops, vi.fn())).toThrow(TypeError);
    expect(markers).toHaveLength(2);
    expect(markers.every(marker => marker.setMap.mock.calls[0][0] === null)).toBe(true);
    expect(clicks.size).toBe(0);
    expect(sdk.Event.removeListener).toHaveBeenCalledOnce();
  });

  it('좌표가 없거나 무한대와 범위 밖이면 지도용 좌표로 인정하지 않는다', () => {
    expect(isMappableStop({ ...stops[0], lat: null })).toBe(false);
    for (const lat of [NaN, Infinity, -Infinity, 91]) expect(isMapCoordinates({ lat, lng: 127 })).toBe(false);
    expect(isMapCoordinates({ lat: 37, lng: 181 })).toBe(false);
    expect(isMapCoordinates({ lat: '37', lng: 127 })).toBe(false);
    expect(isMapCoordinates({ lat: 37, lng: 127 })).toBe(true);
  });
});
