ALTER TABLE route_stops
  ADD COLUMN IF NOT EXISTS provider_fallback_reason TEXT
  CHECK (provider_fallback_reason IN ('unsupported_region', 'mapping_failed', 'verify_failed'))
  DEFAULT NULL;

COMMENT ON COLUMN route_stops.provider_fallback_reason IS
  'provider=odsay_fallback일 때 이유. unsupported_region: 서울/경기 외 지역. mapping_failed: 경기인데 GBIS 매핑 실패. verify_failed: GBIS 검증 50% 미달.';
