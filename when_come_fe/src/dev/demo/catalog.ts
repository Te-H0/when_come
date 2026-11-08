import type { ApiPlace, ApiStop, ApiStopBus } from '@/types/api';

export type DemoRegion = 'seoul' | 'gyeonggi' | 'incheon';
export type DemoRegionFilter = 'all' | DemoRegion;
export interface DemoArea {
  id: DemoRegion;
  name: string;
  keyword: string;
  places: ApiPlace[];
}
export interface DemoStop extends ApiStop {
  region: DemoRegion;
  routes: ApiStopBus[];
}

// All transit names/IDs/routes below are invented, even though the map positions are public places.
export const DEMO_AREAS: DemoArea[] = [
  { id: 'seoul', name: '서울', keyword: '서울 시청', places: [
    { name: '서울 시청 · 가상 출발지', address: '서울 중구 · 가상 장소', x: '126.9784', y: '37.5666' },
    { name: '서울 광장 · 가상 도착지', address: '서울 중구 · 가상 장소', x: '126.9820', y: '37.5700' },
  ] },
  { id: 'gyeonggi', name: '경기', keyword: '경기 수원역', places: [
    { name: '수원역 · 가상 출발지', address: '경기 수원시 · 가상 장소', x: '127.0000', y: '37.2661' },
    { name: '수원 광장 · 가상 도착지', address: '경기 수원시 · 가상 장소', x: '127.0050', y: '37.2690' },
  ] },
  { id: 'incheon', name: '인천', keyword: '인천 시청', places: [
    { name: '인천 시청 · 가상 출발지', address: '인천 남동구 · 가상 장소', x: '126.7052', y: '37.4563' },
    { name: '인천 광장 · 가상 도착지', address: '인천 남동구 · 가상 장소', x: '126.7090', y: '37.4590' },
  ] },
];

export const DEMO_STOPS: DemoStop[] = DEMO_AREAS.flatMap((area, index) => {
  const base = 99000100 + index * 100;
  const center = area.places[0];
  const lat = Number(center.y);
  const lng = Number(center.x);
  const routes: ApiStopBus[] = [
    { routeName: `가상 ${index + 1}01`, busRouteId: `demo-${area.id}-route-a`, busRouteType: 3, startStation: '가상 기점', endStation: '가상 종점' },
    { routeName: `가상 ${index + 1}02`, busRouteId: `demo-${area.id}-route-b`, busRouteType: 4, startStation: '가상 기점', endStation: '가상 종점' },
  ];
  return [
    { id: String(base + 1), name: `${area.name} 가상 정류장 · 광장 방면`, type: 'bus', lat, lng, arsId: `D${index}001`, region: area.id, routes },
    { id: String(base + 2), name: `${area.name} 가상 정류장 · 반대편`, type: 'bus', lat: lat + 0.0005, lng: lng + 0.0005, arsId: `D${index}002`, region: area.id, routes },
    { id: String(base + 3), name: `${area.name} 가상 환승역`, type: 'subway', lat: lat - 0.0004, lng, arsId: null, laneName: '1호선', subwayCode: '1001', region: area.id, routes: [] },
    { id: String(base + 4), name: `${area.name} 가상 환승역`, type: 'subway', lat: lat - 0.0004, lng, arsId: null, laneName: '2호선', subwayCode: '1002', region: area.id, routes: [] },
    { id: String(base + 5), name: `${area.name} 위치 미확인 가상 정류장`, type: 'bus', lat: null, lng: null, arsId: `D${index}003`, region: area.id, routes },
  ];
});

export function isDemoRegion(value: unknown): value is DemoRegionFilter {
  return value === 'all' || value === 'seoul' || value === 'gyeonggi' || value === 'incheon';
}
export function areaForCoordinates(lat: number, lng: number): DemoArea {
  return [...DEMO_AREAS].sort((a, b) =>
    Math.hypot(Number(a.places[0].y) - lat, Number(a.places[0].x) - lng) -
    Math.hypot(Number(b.places[0].y) - lat, Number(b.places[0].x) - lng))[0];
}
