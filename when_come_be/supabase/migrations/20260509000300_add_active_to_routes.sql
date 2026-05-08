-- ─────────────────────────────────────────────────────────
-- T3-a. routes.active 컬럼 추가 + 백필 (PRD D2)
-- SDD §2.5
-- 2026-05-09
-- ─────────────────────────────────────────────────────────
-- 토글로 비활성화된 경로를 보존하면서 홈 노출 여부만 제어.
-- 기존 is_active 컬럼과 별도 — is_active는 레거시(앱 내부용),
-- active는 서버 권위 데이터(PATCH /routes/:id로 토글).
-- ─────────────────────────────────────────────────────────

-- 1단계: 컬럼을 nullable로 추가 (백필 전 NOT NULL 설정 불가)
alter table routes add column active boolean;

-- 2단계: 기존 row 백필 — 모두 활성 상태로
update routes set active = true where active is null;

-- 3단계: NOT NULL + default 설정 (백필 완료 후)
alter table routes alter column active set not null;
alter table routes alter column active set default true;

-- 인덱스 (홈 화면 active=true 필터링 + display_order 정렬 복합 쿼리용)
create index routes_user_id_active_order_idx
  on routes(user_id, active, display_order);
