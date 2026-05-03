-- stop_routes 테이블에 provider 컬럼 추가
-- 같은 정류장에 서울·경기 버스가 공존 가능 → 노선 단위로 provider 관리
ALTER TABLE stop_routes
  ADD COLUMN IF NOT EXISTS provider TEXT
    CHECK (provider IN ('seoul', 'gyeonggi', 'odsay_fallback'))
    NOT NULL DEFAULT 'odsay_fallback';

-- 기존 rows 백필: odsay_route_id 첫 자리로 provider 추론
-- 1xxx... → 서울 노선, 2xxx... → 경기(GBIS) 노선, 그 외 → ODsay fallback
UPDATE stop_routes
SET provider = CASE
  WHEN LEFT(odsay_route_id, 1) = '1' THEN 'seoul'
  WHEN LEFT(odsay_route_id, 1) = '2' THEN 'gyeonggi'
  ELSE 'odsay_fallback'
END;
