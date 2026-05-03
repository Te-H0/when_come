-- ───────────────────────────────────────────────────────────────────────────
-- step_group: 같은 "논리 스텝"에 정류장 최대 2개를 그룹핑하기 위한 컬럼.
-- 사용자가 한 정거장에서 두 개의 대안 정류장(예: 같은 방향 인근 두 정류소)을
-- 묶어두면, 도착 조회 시 두 곳을 동시에 조회하여 더 빠른 쪽을 표시한다.
--
-- 모델 결정:
--   - (route_id, step_group, sequence) 조합으로 유니크
--   - step_group: 1부터 시작하는 정수 (논리 스텝 번호)
--   - sequence:   같은 step_group 내부 ordering (1 또는 2; 미래에도 같은 의미)
--   - 한 step_group 당 최대 2개라는 제약은 애플리케이션 레이어에서 검증
--     (DB CHECK으로 강제 시 GROUP BY 트리거가 필요해 비용 대비 가치가 낮음)
--
-- 기존 데이터는 일관성 보장을 위해 TRUNCATE한다 (개발 단계, 사용자 동의됨).
-- ───────────────────────────────────────────────────────────────────────────

-- 1. 기존 데이터 비우기 (cascade로 route_stops, stop_routes도 함께)
TRUNCATE TABLE routes RESTART IDENTITY CASCADE;

-- 2. 기존 unique constraint 제거
ALTER TABLE route_stops
  DROP CONSTRAINT IF EXISTS route_stops_route_id_sequence_key;

-- 3. step_group 컬럼 추가
--    NOT NULL DEFAULT 1 — 단일 정류장 스텝(기존 동작)이 자연스럽게 step_group=1로 들어옴
ALTER TABLE route_stops
  ADD COLUMN IF NOT EXISTS step_group INTEGER NOT NULL DEFAULT 1
    CHECK (step_group >= 1);

-- 4. 새 unique constraint
--    같은 (route_id, step_group) 안에서는 sequence가 유일하다.
--    한 step_group당 최대 2개라는 도메인 규칙은 BE에서 검증.
ALTER TABLE route_stops
  ADD CONSTRAINT route_stops_route_id_step_group_sequence_key
    UNIQUE (route_id, step_group, sequence);

-- 5. step_group 기준 조회를 위한 인덱스
CREATE INDEX IF NOT EXISTS route_stops_route_id_step_group_idx
  ON route_stops (route_id, step_group);
