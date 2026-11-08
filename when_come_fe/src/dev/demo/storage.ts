import { safeStorage } from '@/lib/safeStorage';
import { DEMO_AREAS, DEMO_STOPS, isDemoRegion } from './catalog';
import { isRecord, isSavedFavorite, isSavedRoute } from './guards';
import { DEMO_USER_ID } from './session';
import type { ApiFavoriteStop, ApiRoute, ApiRouteStop, ApiStopRoute } from '@/types/api';
import type { FavoriteStopRouteInput, SaveRouteStop } from '@/lib/api';
import type { DemoRegionFilter } from './catalog';

export const DEMO_STORAGE_KEY = 'when_come:local-demo:v1';
export interface DemoState {
  version: 1;
  region: DemoRegionFilter;
  routes: ApiRoute[];
  favorites: ApiFavoriteStop[];
}
function isDemoState(value: unknown): value is DemoState {
  return isRecord(value) && value.version === 1 && isDemoRegion(value.region) &&
    Array.isArray(value.routes) && value.routes.every(isSavedRoute) &&
    Array.isArray(value.favorites) && value.favorites.every(isSavedFavorite);
}
export function makeLine(line: FavoriteStopRouteInput, existing?: ApiStopRoute): ApiStopRoute {
  return {
    id: existing?.id ?? crypto.randomUUID(), odsay_route_id: line.odsayRouteId, route_name: line.routeName,
    st_id: line.stId ?? null, bus_route_id: line.busRouteId ?? null, station_ord: line.stationOrd ?? null,
    station_name: line.stationName ?? null, bus_type: line.busType ?? null, subway_code: line.subwayCode ?? null,
    gbis_route_id: existing?.gbis_route_id ?? null, gbis_sta_order: existing?.gbis_sta_order ?? null,
  };
}
export function makeStop(stop: SaveRouteStop, existing?: ApiRouteStop): ApiRouteStop {
  return {
    id: existing?.id ?? crypto.randomUUID(), odsay_stop_id: stop.odsayStopId, stop_name: stop.stopName,
    stop_type: stop.stopType, sequence: stop.sequence, step_group: stop.stepGroup, ars_id: stop.arsId ?? null,
    direction_headsign: stop.directionHeadsign ?? null, direction_updn: stop.directionUpdn ?? null,
    direction_next_stop: stop.directionNextStop ?? null, alias: existing?.alias ?? null,
    // This label only drives synthetic arrival display; no provider mapping has been performed.
    provider: DEMO_STOPS.find(item => item.id === stop.odsayStopId)?.region === 'gyeonggi' ? 'gyeonggi' : 'seoul',
    stop_routes: stop.stopRoutes.map(line => makeLine(line, existing?.stop_routes.find(old => old.odsay_route_id === line.odsayRouteId))),
  };
}
export function createDemoSeed(): DemoState {
  const routes: ApiRoute[] = DEMO_AREAS.map((area, index) => {
    const stop = DEMO_STOPS.find(item => item.region === area.id && item.type === 'bus');
    if (!stop) throw new Error('Demo catalog is incomplete');
    return {
      id: `demo-route-${area.id}`, name: `${area.name} 가상 출근길`, origin_name: area.places[0].name,
      destination_name: area.places[1].name, origin_coords: { lat: Number(area.places[0].y), lng: Number(area.places[0].x) },
      destination_coords: { lat: Number(area.places[1].y), lng: Number(area.places[1].x) },
      is_active: true, display_order: index, created_at: '2026-11-08T00:00:00.000Z',
      route_stops: [makeStop({ odsayStopId: stop.id, stopName: stop.name, stopType: stop.type,
        sequence: 1, stepGroup: 1, arsId: stop.arsId ?? undefined,
        stopRoutes: stop.routes.map(line => ({ odsayRouteId: line.busRouteId, routeName: line.routeName, busRouteId: line.busRouteId, busType: 11 })),
      })],
    };
  });
  const favorites: ApiFavoriteStop[] = routes.map((route, index) => {
    const stop = route.route_stops[0];
    const catalog = DEMO_STOPS.find(item => item.id === stop.odsay_stop_id);
    const id = `demo-favorite-${index}`;
    return {
      id, user_id: DEMO_USER_ID, odsay_stop_id: stop.odsay_stop_id, stop_name: stop.stop_name,
      stop_type: stop.stop_type, ars_id: stop.ars_id ?? null, lat: catalog?.lat ?? null, lng: catalog?.lng ?? null,
      direction_headsign: null, direction_updn: null, direction_next_stop: null, provider: stop.provider ?? 'seoul',
      gbis_station_id: null, alias: null, display_order: index,
      favorite_stop_routes: stop.stop_routes.map(line => ({ ...line, favorite_stop_id: id, provider: stop.provider ?? 'seoul', gbis_route_id: null, gbis_sta_order: null })),
      created_at: route.created_at, updated_at: route.created_at,
    };
  });
  return { version: 1, region: 'all', routes, favorites };
}
export function writeDemoState(state: DemoState): void {
  const serialized = JSON.stringify(state);
  safeStorage.setOrThrow(DEMO_STORAGE_KEY, serialized);
  if (safeStorage.getOrThrow(DEMO_STORAGE_KEY) !== serialized) {
    throw new Error('브라우저 저장 공간을 사용할 수 없어요. 저장 허용 설정을 확인해 주세요.');
  }
}
export function readDemoState(): DemoState {
  const raw = safeStorage.getOrThrow(DEMO_STORAGE_KEY);
  if (raw !== null) {
    let value: unknown;
    try { value = JSON.parse(raw); } catch {
      throw new Error('저장한 가상 데이터를 읽을 수 없어요. 가상 데이터 초기화로 다시 시작할 수 있어요.');
    }
    if (!isDemoState(value)) throw new Error('저장한 가상 데이터 형식이 달라요. 가상 데이터 초기화로 다시 시작할 수 있어요.');
    return value;
  }
  const seed = createDemoSeed();
  writeDemoState(seed);
  return seed;
}
export function setDemoRegion(region: DemoRegionFilter): void { writeDemoState({ ...readDemoState(), region }); }
export function resetDemo(): void {
  writeDemoState(createDemoSeed());
  safeStorage.remove('when_come:local-demo:selectedRouteId');
}
export function matchesDemoRegion(stopId: string, region: DemoRegionFilter): boolean {
  return region === 'all' || DEMO_STOPS.some(stop => stop.id === stopId && stop.region === region);
}
