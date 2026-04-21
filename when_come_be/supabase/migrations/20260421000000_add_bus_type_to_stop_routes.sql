alter table stop_routes
  add column if not exists bus_type int;

comment on column stop_routes.bus_type is '서울 버스 노선 타입 (1=간선 2=지선 3=순환 4=광역 5=공항 6=마을), ODsay lane[].type';
