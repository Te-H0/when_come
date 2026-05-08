-- ─────────────────────────────────────────────────────────
-- T1. favorite_stops + favorite_stop_routes 테이블 생성
-- SDD §2.1, §2.2
-- 2026-05-09
-- ─────────────────────────────────────────────────────────

-- ───────────────────────────────────────────
-- favorite_stops
-- 사용자가 즐겨찾기한 단일 정류장/역
-- ───────────────────────────────────────────
create table favorite_stops (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,

  -- 정류장 정보 (route_stops와 같은 형태)
  odsay_stop_id       text not null,
  stop_name           text not null,
  stop_type           text not null check (stop_type in ('bus', 'subway')),
  ars_id              text,
  lat                 double precision,
  lng                 double precision,

  -- 지하철 방향 (옵셔널, route_stops와 동일)
  direction_headsign  text,
  direction_updn      text check (direction_updn in ('up', 'down')),
  direction_next_stop text,

  -- multi-region (route_stops와 동일)
  provider            text not null default 'seoul'
                      check (provider in ('seoul', 'gyeonggi', 'odsay_fallback')),
  gbis_station_id     text,

  -- 즐겨찾기 전용
  alias               text,           -- 별명 (NULL = 별명 없음)
  display_order       int not null default 0,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index favorite_stops_user_id_order_idx
  on favorite_stops(user_id, display_order);

create trigger set_favorite_stops_updated_at
  before update on favorite_stops
  for each row execute function extensions.moddatetime(updated_at);

-- RLS
alter table favorite_stops enable row level security;

create policy "owner read" on favorite_stops
  for select using (auth.uid() = user_id);

create policy "owner write" on favorite_stops
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ───────────────────────────────────────────
-- favorite_stop_routes
-- 즐겨찾기 정류장에서 탈 수 있는 노선 목록
-- route_stops ↔ stop_routes 관계와 동일한 추상화
-- ───────────────────────────────────────────
create table favorite_stop_routes (
  id                uuid primary key default gen_random_uuid(),
  favorite_stop_id  uuid not null references favorite_stops(id) on delete cascade,

  -- stop_routes와 동일 컬럼 셋
  odsay_route_id    text not null,
  route_name        text not null,
  bus_type          int,
  st_id             text,
  bus_route_id      text,
  station_ord       int,
  station_name      text,
  gbis_route_id     text,
  gbis_sta_order    int,

  -- 노선 단위 provider (stop_routes와 동일 — 2026-05-03 결정)
  provider          text check (provider in ('seoul', 'gyeonggi', 'odsay_fallback')),

  created_at        timestamptz not null default now()
);

create index favorite_stop_routes_stop_idx
  on favorite_stop_routes(favorite_stop_id);

-- RLS: 부모 favorite_stops의 user_id 기반
alter table favorite_stop_routes enable row level security;

create policy "owner read" on favorite_stop_routes
  for select using (
    exists (
      select 1 from favorite_stops fs
      where fs.id = favorite_stop_routes.favorite_stop_id
        and fs.user_id = auth.uid()
    )
  );

create policy "owner write" on favorite_stop_routes
  for all using (
    exists (
      select 1 from favorite_stops fs
      where fs.id = favorite_stop_routes.favorite_stop_id
        and fs.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from favorite_stops fs
      where fs.id = favorite_stop_routes.favorite_stop_id
        and fs.user_id = auth.uid()
    )
  );
