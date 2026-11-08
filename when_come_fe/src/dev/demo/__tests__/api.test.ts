import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/test/server';
import { safeStorage } from '@/lib/safeStorage';
import type { SaveRouteRequest } from '@/lib/api';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(() => { throw new Error('Demo must not construct an auth client'); }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
let api: typeof import('@/lib/api');
let storage: typeof import('../storage');
let auth: typeof import('@/lib/supabase');
let networkCalls: number;

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('DEV', true);
  vi.stubEnv('MODE', 'demo');
  vi.stubEnv('VITE_LOCAL_DEMO', 'true');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://must-not-contact.example');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-only-key');
  networkCalls = 0;
  server.use(http.all('*', () => { networkCalls += 1; return HttpResponse.json({ error: 'Unexpected network' }, { status: 500 }); }));
  storage = await import('../storage');
  safeStorage.remove(storage.DEMO_STORAGE_KEY);
  safeStorage.set('sb-127-auth-token', '{"existing":"session-must-stay"}');
  api = await import('@/lib/api');
  auth = await import('@/lib/supabase');
});
afterEach(() => { vi.unstubAllEnvs(); });

async function routeInput(): Promise<SaveRouteRequest> {
  const [stop] = await api.searchStops('서울 가상 정류장 · 광장');
  const lines = await api.getStopBuses(stop.arsId ?? '');
  return { name: '브라우저 재조회 확인 경로', originName: null, destinationName: null, stops: [{
    odsayStopId: stop.id, stopName: stop.name, stopType: stop.type, stepGroup: 1, sequence: 1,
    arsId: stop.arsId ?? undefined, stopRoutes: [{ odsayRouteId: lines[0].busRouteId, routeName: lines[0].routeName, busRouteId: lines[0].busRouteId }],
  }] };
}

describe('서버 없는 로컬 가상 체험 경계', () => {
  it('기존 세션이 있어도 auth constructor·API·텔레메트리 네트워크를 사용하지 않는다', async () => {
    await auth.initAuth();
    const session = await auth.getJwt();
    expect(session).toBeTruthy();
    await api.listRoutes(session ?? '');
    await api.listFavoriteStops(session ?? '');
    await api.searchPlaces('수원');
    const { logClientError } = await import('@/lib/clientErrorLog');
    logClientError({ path: '/search-stops', method: 'GET', code: null, status: 500, message: 'test' });
    await Promise.resolve();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(networkCalls).toBe(0);
    expect(safeStorage.get('sb-127-auth-token')).toBe('{"existing":"session-must-stay"}');
  });

  it('서로 다른 지역·양편·환승 호선·좌표 없는 후보를 보존한다', async () => {
    const all = await api.searchStops('가상');
    expect(new Set(all.map(stop => `${stop.type}:${stop.id}`)).size).toBe(all.length);
    expect(all.some(stop => stop.lat === null)).toBe(true);
    storage.setDemoRegion('gyeonggi');
    const suwon = await api.searchStops('경기');
    expect(suwon).toHaveLength(5);
    expect(suwon.filter(stop => stop.type === 'subway')).toHaveLength(2);
    expect((await api.listRoutes('')).every(route => route.name.includes('경기'))).toBe(true);
    expect((await api.searchStops('인천'))).toHaveLength(0);
    expect(networkCalls).toBe(0);
  });

  it('경로 생성 후 모듈 재시작·목록 재조회에도 같은 저장 ID와 선택 노선이 남는다', async () => {
    const input = await routeInput();
    const saved = await api.saveRoute(input, 'local-only');
    vi.resetModules();
    const reloadedApi = await import('@/lib/api');
    const route = (await reloadedApi.listRoutes('local-only')).find(item => item.id === saved.id);
    expect(route?.route_stops[0].odsay_stop_id).toBe(input.stops[0].odsayStopId);
    expect(route?.route_stops[0].stop_routes[0].odsay_route_id).toBe(input.stops[0].stopRoutes[0].odsayRouteId);
    const arrival = await reloadedApi.getArrivalByStopId(route?.route_stops[0].id ?? '');
    expect(arrival.items[0].busRouteAbrv).toBe(input.stops[0].stopRoutes[0].routeName);
    expect(arrival.items[0].arrmsg1).toContain('가상');
    expect(networkCalls).toBe(0);
  });

  it('장소 기반 경로 후보와 즐겨찾기 생성·수정·삭제를 로컬에서 완결한다', async () => {
    const places = await api.searchPlaces('인천');
    const paths = await api.searchRoutes(Number(places[0].x), Number(places[0].y), Number(places[1].x), Number(places[1].y));
    const [stop] = await api.searchStops('인천 가상 정류장 · 광장');
    expect(String(paths[0].segments[0].startOdsayId)).toBe(stop.id);
    expect(paths[0].segments[0].startArsId).not.toBe(stop.id);
    const [line] = await api.getStopBuses(stop.arsId ?? '');
    const favorite = await api.createFavoriteStop({ odsayStopId: stop.id, stopName: stop.name, stopType: stop.type,
      lat: stop.lat, lng: stop.lng, routes: [{ odsayRouteId: line.busRouteId, routeName: line.routeName }] }, 'local-only');
    await api.updateFavoriteStop(favorite.id, { alias: '가상 즐겨찾기 확인' }, 'local-only');
    expect((await api.listFavoriteStops('')).find(item => item.id === favorite.id)?.alias).toBe('가상 즐겨찾기 확인');
    await api.deleteFavoriteStop(favorite.id, 'local-only');
    expect((await api.listFavoriteStops('')).some(item => item.id === favorite.id)).toBe(false);
    expect(networkCalls).toBe(0);
  });

  it('같은 정류장의 두 occurrence를 PATCH해도 서로 다른 child ID를 보존한다', async () => {
    const input = await routeInput();
    input.stops.push({ ...input.stops[0], stepGroup: 2 });
    const saved = await api.saveRoute(input, 'local-only');
    const before = (await api.listRoutes('')).find(route => route.id === saved.id);
    await api.updateRoute(saved.id, { stops: input.stops });
    const after = (await api.listRoutes('')).find(route => route.id === saved.id);
    const ids = after?.route_stops.map(stop => stop.id) ?? [];
    expect(new Set(ids).size).toBe(2);
    expect(ids).toEqual(before?.route_stops.map(stop => stop.id));
  });

  it.each(['{bad', '', '{"version":1,"routes":[]}'])('손상 snapshot %s는 오류로 남고 사용자 초기화 전 덮지 않는다', async raw => {
    safeStorage.set(storage.DEMO_STORAGE_KEY, raw);
    await expect(api.listRoutes('')).rejects.toThrow('가상 데이터');
    expect(safeStorage.get(storage.DEMO_STORAGE_KEY)).toBe(raw);
    storage.resetDemo();
    expect((await api.listRoutes(''))).toHaveLength(3);
  });

  it('좌표 shape가 손상되면 원본을 보존하고 읽기를 거부한다', async () => {
    const seed = storage.createDemoSeed();
    const invalid = { ...seed, routes: seed.routes.map(route => ({ ...route, origin_coords: 'invalid' })) };
    const raw = JSON.stringify(invalid);
    safeStorage.set(storage.DEMO_STORAGE_KEY, raw);
    await expect(api.listRoutes('')).rejects.toThrow('가상 데이터');
    expect(safeStorage.get(storage.DEMO_STORAGE_KEY)).toBe(raw);
  });

  it('storage 쓰기 실패는 저장 성공으로 가장하지 않고 이전 snapshot과 입력을 유지한다', async () => {
    const input = await routeInput();
    const previous = safeStorage.get(storage.DEMO_STORAGE_KEY);
    const previousInput = JSON.stringify(input);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    await expect(api.saveRoute(input, 'local-only')).rejects.toThrow('저장 공간');
    expect(safeStorage.get(storage.DEMO_STORAGE_KEY)).toBe(previous);
    expect(JSON.stringify(input)).toBe(previousInput);
  });

  it('storage 읽기 차단은 새 seed로 덮지 않고 실패한다', async () => {
    const set = vi.spyOn(Storage.prototype, 'setItem');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    await expect(api.listRoutes('')).rejects.toThrow('저장 공간');
    expect(set).not.toHaveBeenCalled();
  });

  it('미지원 API와 취소된 요청도 네트워크 fallback을 하지 않는다', async () => {
    const { demoFetch } = await import('../api');
    expect((await demoFetch('/not-supported')).status).toBe(404);
    const controller = new AbortController(); controller.abort();
    await expect(api.searchStops('서울', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(networkCalls).toBe(0);
  });
});
