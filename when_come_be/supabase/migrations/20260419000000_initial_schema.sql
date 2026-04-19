-- enable moddatetime extension for auto updated_at
create extension if not exists moddatetime schema extensions;

-- ───────────────────────────────────────────
-- routes
-- 사용자가 저장한 출퇴근 경로
-- ───────────────────────────────────────────
create table routes (
  id                   uuid default gen_random_uuid() primary key,
  user_id              uuid references auth.users(id) on delete cascade not null,
  name                 text not null,                    -- 예: "출근길"
  origin_name          text not null,                    -- 예: "집"
  destination_name     text not null,                    -- 예: "회사"
  origin_coords        jsonb,                            -- {lat, lng}
  destination_coords   jsonb,                            -- {lat, lng}
  is_active            boolean default true not null,
  created_at           timestamptz default now() not null,
  updated_at           timestamptz default now() not null
);

create trigger set_routes_updated_at
  before update on routes
  for each row execute function extensions.moddatetime(updated_at);

-- ───────────────────────────────────────────
-- route_stops
-- 경로 내 정류장/역 (순서 있음)
-- ───────────────────────────────────────────
create table route_stops (
  id          uuid default gen_random_uuid() primary key,
  route_id    uuid references routes(id) on delete cascade not null,
  odsay_stop_id  text not null,                          -- ODsay 정류장 ID
  stop_name   text not null,
  stop_type   text not null check (stop_type in ('bus', 'subway')),
  sequence    int not null,                              -- 경로 내 순서 (1부터)
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null,
  unique (route_id, sequence)
);

create trigger set_route_stops_updated_at
  before update on route_stops
  for each row execute function extensions.moddatetime(updated_at);

-- ───────────────────────────────────────────
-- stop_routes
-- 정류장에서 탈 수 있는 노선 목록 (복수 선택 가능)
-- ───────────────────────────────────────────
create table stop_routes (
  id               uuid default gen_random_uuid() primary key,
  stop_id          uuid references route_stops(id) on delete cascade not null,
  odsay_route_id   text not null,                        -- ODsay 노선 ID
  route_name       text not null,                        -- 예: "273", "2호선"
  created_at       timestamptz default now() not null,
  updated_at       timestamptz default now() not null
);

create trigger set_stop_routes_updated_at
  before update on stop_routes
  for each row execute function extensions.moddatetime(updated_at);

-- ───────────────────────────────────────────
-- RLS
-- ───────────────────────────────────────────
alter table routes      enable row level security;
alter table route_stops enable row level security;
alter table stop_routes enable row level security;

-- routes: 본인 경로만 접근
create policy "routes: 본인만 조회" on routes
  for select using (auth.uid() = user_id);

create policy "routes: 본인만 생성" on routes
  for insert with check (auth.uid() = user_id);

create policy "routes: 본인만 수정" on routes
  for update using (auth.uid() = user_id);

create policy "routes: 본인만 삭제" on routes
  for delete using (auth.uid() = user_id);

-- route_stops: routes를 통해 간접 소유권 확인
create policy "route_stops: 본인 경로만 조회" on route_stops
  for select using (
    exists (select 1 from routes where routes.id = route_stops.route_id and routes.user_id = auth.uid())
  );

create policy "route_stops: 본인 경로만 생성" on route_stops
  for insert with check (
    exists (select 1 from routes where routes.id = route_stops.route_id and routes.user_id = auth.uid())
  );

create policy "route_stops: 본인 경로만 삭제" on route_stops
  for delete using (
    exists (select 1 from routes where routes.id = route_stops.route_id and routes.user_id = auth.uid())
  );

-- stop_routes: route_stops → routes 체인으로 소유권 확인
create policy "stop_routes: 본인 경로만 조회" on stop_routes
  for select using (
    exists (
      select 1 from route_stops rs
      join routes r on r.id = rs.route_id
      where rs.id = stop_routes.stop_id and r.user_id = auth.uid()
    )
  );

create policy "stop_routes: 본인 경로만 생성" on stop_routes
  for insert with check (
    exists (
      select 1 from route_stops rs
      join routes r on r.id = rs.route_id
      where rs.id = stop_routes.stop_id and r.user_id = auth.uid()
    )
  );

create policy "stop_routes: 본인 경로만 삭제" on stop_routes
  for delete using (
    exists (
      select 1 from route_stops rs
      join routes r on r.id = rs.route_id
      where rs.id = stop_routes.stop_id and r.user_id = auth.uid()
    )
  );

-- ───────────────────────────────────────────
-- 인덱스
-- ───────────────────────────────────────────
create index on routes (user_id);
create index on route_stops (route_id);
create index on stop_routes (stop_id);
