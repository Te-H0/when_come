-- gbis_stations: 경기도 정류소 자체 캐시
-- sync-gbis-stations Edge Function이 일 1회 cron으로 갱신
-- 매핑 알고리즘(regionMapper)이 ARS/좌표/이름으로 검색

create table if not exists gbis_stations (
  station_id        text primary key,                 -- STATION_ID
  station_name      text not null,                    -- STATION_NM_INFO
  ars_no            text,                             -- STATION_MANAGE_NO (ARS, ODsay arsId와 매칭 가능)
  lat               double precision not null,         -- WGS84_LAT
  lng               double precision not null,         -- WGS84_LOGT
  sigun_nm          text,                             -- SIGUN_NM
  sigun_cd          text,                             -- SIGUN_CD
  district_cd       text,                             -- (추후 보강용)
  station_div_nm    text,                             -- 정류소 구분명 (STATION_DIV_NM)
  jurisd_inst_nm    text,                             -- 관할기관명 (JURISD_INST_NM)
  locplc_loc        text,                             -- 위치설명 (LOCPLC_LOC)
  synced_at         timestamptz not null default now()
);

-- 매핑 1차 키 (ARS) 인덱스 — 일부 정류소는 ARS 미할당이므로 partial
create index if not exists gbis_stations_ars_no_idx
  on gbis_stations (ars_no)
  where ars_no is not null;

-- 좌표 사전 필터용 bbox 인덱스 (lat, lng 합성)
create index if not exists gbis_stations_latlng_idx
  on gbis_stations (lat, lng);

-- 시군 필터용
create index if not exists gbis_stations_sigun_nm_idx
  on gbis_stations (sigun_nm);

-- (선택, 추후 도입 검토) earthdistance / PostGIS 도입 시 위 인덱스 대체
-- create extension if not exists cube;
-- create extension if not exists earthdistance;
-- create index gbis_stations_earth_idx on gbis_stations using gist (
--   ll_to_earth(lat::float8, lng::float8)
-- );

comment on table gbis_stations is
  '경기도 정류소 캐시. sync-gbis-stations Edge Function이 일 1회 cron으로 갱신. 매핑 알고리즘(regionMapper)이 ARS/좌표/이름으로 검색.';
comment on column gbis_stations.ars_no is
  'STATION_MANAGE_NO. ODsay arsId와 동일 체계로 사용 (1차 매칭 키).';
comment on column gbis_stations.synced_at is
  '마지막 cron 갱신 시각. 14일 이상 된 row는 운영팀 알림.';

-- RLS: 읽기는 인증된 사용자(및 anon) 허용, 쓰기는 service role만
alter table gbis_stations enable row level security;

create policy "public read gbis_stations"
  on gbis_stations
  for select
  using (true);

-- write는 service role key로만 가능 (RLS bypass)
-- anon/authenticated insert/update/delete 정책 없음 → 차단됨
