-- gbis_stations 좌표 타입 보정
-- 20260502000001에서 numeric(9,6)으로 생성된 경우를 위한 안전망.
-- 이미 double precision이면 이 ALTER은 no-op이 아니므로 주의.
-- prod에 20260502000001이 적용됐고 타입이 numeric(9,6)이면 이 마이그레이션 적용 필요.
-- prod에 20260502000001이 아직 미적용이면 이 마이그레이션은 적용하지 않아도 됨(skip).
--
-- RLS 정책명 변경도 동시 처리.
-- "anon read gbis_stations" 정책이 존재하는 경우에만 rename.

do $$
begin
  -- 좌표 타입 변경 (numeric → double precision)
  if exists (
    select 1 from information_schema.columns
    where table_name = 'gbis_stations'
      and column_name = 'lat'
      and data_type = 'numeric'
  ) then
    alter table gbis_stations
      alter column lat type double precision,
      alter column lng type double precision;
  end if;

  -- 정책명 변경 (anon → public)
  if exists (
    select 1 from pg_policies
    where tablename = 'gbis_stations'
      and policyname = 'anon read gbis_stations'
  ) then
    drop policy "anon read gbis_stations" on gbis_stations;
    create policy "public read gbis_stations"
      on gbis_stations
      for select
      using (true);
  end if;
end;
$$;
