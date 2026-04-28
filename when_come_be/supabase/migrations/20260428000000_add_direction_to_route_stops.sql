-- 경로 방향 정보 컬럼 추가
-- PRD: docs/specs/route-direction/PRD.md
-- SDD: docs/specs/route-direction/SDD.md 섹션 2.3

alter table route_stops
  add column if not exists direction_headsign  text,
  add column if not exists direction_updn      text,
  add column if not exists direction_next_stop text;

alter table route_stops
  add constraint route_stops_direction_updn_chk
  check (direction_updn is null or direction_updn in ('up', 'down'));

comment on column route_stops.direction_headsign  is
  '지하철 진행 방향 헤드사인 (예: "장암행"). subway stop만 사용.';
comment on column route_stops.direction_updn      is
  '상/하행 정규화 (up/down). 서울 지하철 updnLine: 상행/내선→up, 하행/외선→down.';
comment on column route_stops.direction_next_stop is
  'ODsay route-search subPath.endName (환승/하차역명, 디버그/감사용).';
