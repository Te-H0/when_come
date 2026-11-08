import { DEMO_AREAS, DEMO_STOPS, areaForCoordinates } from './catalog';
import { isFavoriteInput, isInputLines, isInputStop, isRecord, isRouteInput } from './guards';
import { makeLine, makeStop, matchesDemoRegion, readDemoState, writeDemoState } from './storage';
import { DEMO_USER_ID } from './session';
import type { ApiFavoriteStop, ApiRouteOption } from '@/types/api';

function response(value: unknown, status = 200): Response { return Response.json(value, { status }); }
function failure(code: string, message: string, status = 400): Response { return response({ error: { code, message } }, status); }
function readBody(options?: RequestInit): unknown {
  return typeof options?.body === 'string' ? JSON.parse(options.body) : null;
}
function searchText(value: string, q: string) { return value.toLocaleLowerCase().includes(q.trim().toLocaleLowerCase()); }

/** Local v0 UI adapter. Unknown routes fail closed; this function never falls back to fetch. */
export async function demoFetch(path: string, options?: RequestInit): Promise<Response> {
  if (!(import.meta.env.DEV && import.meta.env.VITE_LOCAL_DEMO === 'true')) {
    throw new Error('Local demo adapter is disabled');
  }
  options?.signal?.throwIfAborted();
  const url = new URL(path, 'https://local-demo.invalid');
  const endpoint = url.pathname;
  const method = options?.method?.toUpperCase() ?? 'GET';
  const state = readDemoState();
  const catalog = DEMO_STOPS.filter(stop => matchesDemoRegion(stop.id, state.region));
  let body: unknown = null;
  try { if (method !== 'GET') body = readBody(options); } catch { return failure('COMMON_INVALID_JSON', '요청 형식을 확인해 주세요'); }

  if (endpoint === '/place-search' && method === 'GET') {
    const q = url.searchParams.get('q') ?? '';
    return response(DEMO_AREAS.filter(area => state.region === 'all' || state.region === area.id)
      .flatMap(area => area.places).filter(place => searchText(`${place.name} ${place.address}`, q)));
  }
  if (endpoint === '/search-stops' && method === 'GET') {
    const q = url.searchParams.get('q') ?? '';
    return response(catalog.filter(stop => searchText(`${stop.name} ${stop.arsId ?? ''} ${DEMO_AREAS.find(area => area.id === stop.region)?.keyword ?? ''}`, q))
      .map(({ region: _region, routes: _routes, ...stop }) => stop));
  }
  if (endpoint === '/stop-buses' && method === 'GET') {
    return response(DEMO_STOPS.find(stop => stop.arsId === url.searchParams.get('arsId'))?.routes ?? []);
  }
  if (endpoint === '/subway-station-directions' && method === 'GET') {
    const stop = DEMO_STOPS.find(item => item.id === url.searchParams.get('stationId'));
    if (!stop) return failure('STOP_NOT_FOUND', '가상 정류장을 찾을 수 없어요', 404);
    return response({ stationName: stop.name, lineName: stop.laneName, subwayCode: stop.subwayCode, directions: [
      { updn: 'up', nextStop: '가상 이전역' }, { updn: 'down', nextStop: '가상 다음역' },
    ] });
  }
  if (endpoint === '/route-search' && method === 'POST') {
    if (!isRecord(body) || typeof body.startY !== 'number' || typeof body.startX !== 'number' ||
        !Number.isFinite(body.startY) || !Number.isFinite(body.startX)) return failure('COMMON_BAD_REQUEST', '출발지와 도착지를 선택해 주세요');
    const area = areaForCoordinates(body.startY, body.startX);
    const bus = DEMO_STOPS.find(stop => stop.region === area.id && stop.type === 'bus');
    const subway = DEMO_STOPS.find(stop => stop.region === area.id && stop.type === 'subway');
    if (!bus || !subway) return failure('COMMON_INTERNAL_ERROR', '가상 경로를 준비하지 못했어요', 500);
    const routes: ApiRouteOption[] = [
      { id: `demo-candidate-${area.id}-bus`, totalMinutes: 18, transferCount: 0, totalTransferCount: 0, totalWalkMeters: 250, paymentWon: 1500,
        segments: [{ type: 'bus', sectionMinutes: 15, startName: bus.name, endName: `${area.name} 가상 도착 정류장`,
          startOdsayId: Number(bus.id), startArsId: bus.arsId,
          lines: bus.routes.map(line => ({ routeName: line.routeName, busRouteId: line.busRouteId, subwayCode: null, busType: 11 })) }] },
      { id: `demo-candidate-${area.id}-subway`, totalMinutes: 23, transferCount: 0, totalTransferCount: 0, totalWalkMeters: 450, paymentWon: 1550,
        segments: [{ type: 'subway', sectionMinutes: 19, startName: subway.name, endName: '가상 다음역', startOdsayId: Number(subway.id), way: '가상 다음역', wayCode: 2,
          lines: [{ routeName: subway.laneName ?? '1호선', busRouteId: null, subwayCode: subway.subwayCode ?? null, busType: null }] }] },
    ];
    return response(routes);
  }
  if (endpoint === '/routes' && method === 'GET') {
    return response(state.routes.filter(route => state.region === 'all' || route.route_stops.some(stop => matchesDemoRegion(stop.odsay_stop_id, state.region)))
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)));
  }
  if (endpoint === '/routes' && method === 'POST') {
    if (!isRouteInput(body)) return failure('ROUTE_STOPS_REQUIRED', '경로 이름과 선택한 노선을 확인해 주세요');
    const id = crypto.randomUUID();
    const route = {
      id, name: body.name.trim(), origin_name: body.originName, destination_name: body.destinationName,
      origin_coords: body.originCoords ?? null, destination_coords: body.destinationCoords ?? null,
      is_active: true, display_order: state.routes.length, created_at: new Date().toISOString(),
      route_stops: body.stops.map(stop => makeStop(stop)),
    };
    writeDemoState({ ...state, routes: [...state.routes, route] });
    return response({ id }, 201);
  }
  const routeId = endpoint.startsWith('/routes/') ? endpoint.slice('/routes/'.length) : null;
  if (routeId) {
    const route = state.routes.find(item => item.id === routeId);
    if (!route) return failure('ROUTE_NOT_FOUND', '가상 경로를 찾을 수 없어요', 404);
    if (method === 'DELETE') { writeDemoState({ ...state, routes: state.routes.filter(item => item.id !== routeId) }); return response({ ok: true }); }
    if (method === 'PATCH' && isRecord(body)) {
      const update = body;
      if (update.stops !== undefined && (!Array.isArray(update.stops) || !update.stops.length || !update.stops.every(isInputStop))) {
        return failure('ROUTE_STOPS_REQUIRED', '선택한 정류장을 확인해 주세요');
      }
      const stops = Array.isArray(update.stops) && update.stops.every(isInputStop) ? update.stops : null;
      const remainingStops = [...route.route_stops];
      const replacementStops = stops?.map(stop => {
        const sameGroupIndex = remainingStops.findIndex(old => old.odsay_stop_id === stop.odsayStopId && old.step_group === stop.stepGroup);
        const index = sameGroupIndex >= 0 ? sameGroupIndex : remainingStops.findIndex(old => old.odsay_stop_id === stop.odsayStopId);
        const existing = index >= 0 ? remainingStops.splice(index, 1)[0] : undefined;
        return makeStop(stop, existing);
      });
      const next = {
        ...route,
        name: typeof update.name === 'string' && update.name.trim() ? update.name.trim() : route.name,
        is_active: typeof update.is_active === 'boolean' ? update.is_active : typeof update.active === 'boolean' ? update.active : route.is_active,
        display_order: typeof update.displayOrder === 'number' ? update.displayOrder : route.display_order,
        route_stops: replacementStops ?? route.route_stops,
      };
      writeDemoState({ ...state, routes: state.routes.map(item => item.id === routeId ? next : item) });
      return response({ ok: true });
    }
  }
  if (endpoint === '/favorite-stops' && method === 'GET') {
    return response(state.favorites.filter(favorite => matchesDemoRegion(favorite.odsay_stop_id, state.region)).sort((a, b) => a.display_order - b.display_order));
  }
  if (endpoint === '/favorite-stops' && method === 'POST') {
    if (!isFavoriteInput(body)) return failure('FAVORITE_ROUTES_REQUIRED', '이용할 노선을 선택해 주세요');
    const id = crypto.randomUUID();
    const favorite: ApiFavoriteStop = {
      id, user_id: DEMO_USER_ID, odsay_stop_id: body.odsayStopId, stop_name: body.stopName, stop_type: body.stopType,
      ars_id: body.arsId ?? null, lat: body.lat ?? null, lng: body.lng ?? null,
      direction_headsign: body.directionHeadsign ?? null, direction_updn: body.directionUpdn ?? null,
      direction_next_stop: body.directionNextStop ?? null, provider: DEMO_STOPS.find(stop => stop.id === body.odsayStopId)?.region === 'gyeonggi' ? 'gyeonggi' : 'seoul',
      gbis_station_id: null, alias: body.alias ?? null, display_order: state.favorites.length,
      favorite_stop_routes: body.routes.map(line => ({ ...makeLine(line), favorite_stop_id: id, provider: 'seoul', gbis_route_id: null, gbis_sta_order: null })),
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    writeDemoState({ ...state, favorites: [...state.favorites, favorite] });
    return response(favorite, 201);
  }
  const favoriteId = endpoint.startsWith('/favorite-stops/') ? endpoint.slice('/favorite-stops/'.length) : null;
  if (favoriteId) {
    const favorite = state.favorites.find(item => item.id === favoriteId);
    if (!favorite) return failure('FAVORITE_NOT_FOUND', '가상 즐겨찾기를 찾을 수 없어요', 404);
    if (method === 'DELETE') { writeDemoState({ ...state, favorites: state.favorites.filter(item => item.id !== favoriteId) }); return response({ ok: true }); }
    if (method === 'PATCH' && isRecord(body)) {
      if (body.routes !== undefined && !isInputLines(body.routes)) return failure('FAVORITE_ROUTES_REQUIRED', '이용할 노선을 선택해 주세요');
      const next = {
        ...favorite,
        alias: typeof body.alias === 'string' || body.alias === null ? body.alias : favorite.alias,
        display_order: typeof body.displayOrder === 'number' ? body.displayOrder : favorite.display_order,
        favorite_stop_routes: isInputLines(body.routes) ? body.routes.map(line => ({ ...makeLine(line), favorite_stop_id: favoriteId, provider: favorite.provider, gbis_route_id: null, gbis_sta_order: null })) : favorite.favorite_stop_routes,
        updated_at: new Date().toISOString(),
      };
      writeDemoState({ ...state, favorites: state.favorites.map(item => item.id === favoriteId ? next : item) });
      return response(next);
    }
  }
  if (endpoint.startsWith('/route-stops/') && method === 'PATCH' && isRecord(body) && (typeof body.alias === 'string' || body.alias === null)) {
    const id = endpoint.slice('/route-stops/'.length);
    const alias = body.alias;
    if (!state.routes.some(route => route.route_stops.some(stop => stop.id === id))) return failure('ROUTE_STOP_NOT_FOUND', '가상 정류장을 찾을 수 없어요', 404);
    writeDemoState({ ...state, routes: state.routes.map(route => ({ ...route, route_stops: route.route_stops.map(stop => stop.id === id ? { ...stop, alias } : stop) })) });
    return response({ id, alias });
  }
  if (endpoint === '/arrival-info' && method === 'GET') {
    const stopId = url.searchParams.get('stopId');
    if (stopId) {
      const routeStop = state.routes.flatMap(route => route.route_stops).find(stop => stop.id === stopId);
      const favorite = state.favorites.find(stop => stop.id === stopId);
      const lines = routeStop?.stop_routes ?? favorite?.favorite_stop_routes ?? [];
      return response({
        items: lines.map((line, index) => ({ busRouteId: line.bus_route_id ?? line.odsay_route_id, busRouteAbrv: line.route_name,
          arrmsg1: `${index + 3}분 후 (가상)`, arrmsg2: '8분 후 (가상)', traTime1: (index + 3) * 60, traTime2: 480, busType: line.bus_type })),
        provider: routeStop?.provider ?? favorite?.provider ?? 'seoul', fetchedAt: new Date().toISOString(),
      });
    }
    if (url.searchParams.get('type') === 'subway') return response(['1001', '1002'].flatMap(lineName => ['상행', '하행'].map(updnLine => ({
      lineName, direction: '가상 종착역행', arrmsg1: '3분 후 (가상)', arrmsg2: '8분 후 (가상)', updnLine, headsign: '가상 종착역', trainType: '일반', arrivalSeconds: 180,
    }))));
    if (url.searchParams.get('type') === 'odsay') return response([{ routeID: 'demo-route-a', routeName: '가상 101', arrivalTime1: 3, arrivalTime2: 8, type: 11 }]);
    return response({ routeName: '가상 노선', arrmsg1: '3분 후 (가상)', arrmsg2: '8분 후 (가상)', arrivalSec1: 180, arrivalSec2: 480 });
  }
  return failure('COMMON_BAD_REQUEST', '로컬 데모에서 지원하지 않는 요청이에요', 404);
}
