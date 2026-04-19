-- stop_routes 테이블에 서울 버스 API용 필드 추가
-- getArrInfoByRoute 호출에 stId + busRouteId + ord 3개 필요

alter table stop_routes
  add column if not exists st_id        text,    -- 서울 버스 정류소 ID (stId)
  add column if not exists bus_route_id text,    -- 서울 버스 노선 ID (busRouteId)
  add column if not exists station_ord  int,     -- 정류소 순번 (ord)
  add column if not exists station_name text;    -- 지하철역명 (subway 도착조회용)

comment on column stop_routes.st_id        is '서울 버스 API stId — getArrInfoByRoute 필수';
comment on column stop_routes.bus_route_id is '서울 버스 API busRouteId — getArrInfoByRoute 필수';
comment on column stop_routes.station_ord  is '서울 버스 API ord (정류소 순번) — getArrInfoByRoute 필수';
comment on column stop_routes.station_name is '지하철역명 — swopenapi.seoul.go.kr realtimeStationArrival 용';
