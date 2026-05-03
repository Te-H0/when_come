-- ─── T1: route_stops에 provider/gbis 컬럼 추가 ──────────────────────────
-- SDD §5.2 최종 결정: route_stops.gbis_route_id/gbis_sta_order 제거,
--   stop_routes에만 둠 (노선 차원 정보, JOIN으로 조회).

alter table route_stops
  add column if not exists provider        text,
  add column if not exists gbis_station_id text;

-- provider CHECK constraint
alter table route_stops
  add constraint route_stops_provider_chk
  check (provider is null or provider in ('seoul', 'gyeonggi', 'odsay_fallback'));

-- 기존 row 백필 — 서울 버스/지하철 모두 'seoul'
update route_stops
  set provider = 'seoul'
  where provider is null;

-- 컬럼 comment
comment on column route_stops.provider is
  '도착 조회 provider 식별자. seoul=서울 버스 API, gyeonggi=GBIS, odsay_fallback=ODsay realtimeStation';
comment on column route_stops.gbis_station_id is
  'GBIS 정류소 ID (text). provider=gyeonggi 일 때 채움.';

-- ─── stop_routes에 GBIS 매핑 컬럼 추가 ────────────────────────────────────
alter table stop_routes
  add column if not exists gbis_route_id  text,
  add column if not exists gbis_sta_order int;

comment on column stop_routes.gbis_route_id is
  '해당 정류장에서 이 노선의 GBIS routeId. provider=gyeonggi 일 때 채움.';
comment on column stop_routes.gbis_sta_order is
  '이 노선의 정류장 순번 (정류소를 왕복 경유하는 노선 구분용).';
