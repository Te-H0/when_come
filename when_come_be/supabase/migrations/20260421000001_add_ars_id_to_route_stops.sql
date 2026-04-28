alter table route_stops
  add column if not exists ars_id text;

comment on column route_stops.ars_id is '서울 버스 정류장 고유번호 — getRouteByStation arsId 파라미터, search-stops 응답 arsId';
