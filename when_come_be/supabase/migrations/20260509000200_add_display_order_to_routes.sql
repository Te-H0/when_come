-- ─────────────────────────────────────────────────────────
-- T3. routes.display_order 컬럼 추가 + 백필
-- SDD §2.4
-- 2026-05-09
-- ─────────────────────────────────────────────────────────

-- 1단계: 컬럼을 nullable로 추가 (백필 전 NOT NULL 설정 불가)
alter table routes add column display_order int;

-- 2단계: 기존 row 백필 — 사용자별 created_at 순으로 0-based 부여
-- (SDD §2.4: 0-based 통일 — FE 정렬 알고리즘과 일관)
with ordered as (
  select id,
         row_number() over (partition by user_id order by created_at) - 1 as ord
  from routes
)
update routes r
   set display_order = ordered.ord
  from ordered
 where r.id = ordered.id;

-- 3단계: NOT NULL + default 설정 (백필 완료 후)
alter table routes alter column display_order set not null;
alter table routes alter column display_order set default 0;

-- 인덱스 (RouteManagement 정렬용)
create index routes_user_id_order_idx
  on routes(user_id, display_order);
